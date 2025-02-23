import datetime
import json
import sys
import pymysql
import hashlib
import os
import base64

config = {  #데이터베이스 설정
    "host": "drive-database.c12i2osm20jj.ap-northeast-2.rds.amazonaws.com",
    "port": 3306,
    "database": "drivedatabase",
    "user": "admin",
    "password": "password"
}

try:  #데이터베이스 연결 
    conn = pymysql.connect(**config)
except Exception as e:
    print("Error connecting to MariaDB Platform: ", e)
    sys.exit()

def json_default(value):
    if isinstance(value, datetime.date):
        return value.strftime('%Y-%m-%d')
    raise TypeError('not JSON serializable')

def hash_password(password): #입력받은 비밀번호 해시 암호화 적용
    salt = os.urandom(16)
    hashed_password = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return base64.b64encode(salt + hashed_password).decode('utf-8')

def verify_password(stored_password, provided_password): #입력받은 비밀번호, DB에 저장된 암호와 같은 지 검증
    decoded_password = base64.b64decode(stored_password)
    salt = decoded_password[:16]  #보안 강화를 위해 salt 추가
    stored_hash = decoded_password[16:]
    hashed_provided_password = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
    return hashed_provided_password == stored_hash

def lambda_handler(event, context):
    with conn.cursor() as cur:
        if event['httpMethod'] == "POST":  #POST 시 비밀번호 해시 적용 및 DB에 저장
            password = hash_password(event['password'])
            query = "INSERT INTO t_board (title, updated_id, created_dt, password) VALUES (%s, %s, CURRENT_TIMESTAMP, %s)"
            cur.execute(query, (event["title"], event["updated_id"], password))
            conn.commit()
            
            select_query = "SELECT * FROM t_board"
            cur.execute(select_query)
            result = cur.fetchall()
            return {
                "statusCode": 200,
                "body": "Success",
                "data": json.dumps(result, default=json_default)
            }
        elif event['httpMethod'] == "GET": #GET 데이터베이스 읽기
            select_query = "SELECT * FROM t_board"
            cur.execute(select_query)
            result = cur.fetchall()
            sanitized_results = [row[:-1] for row in result]
            return {
                "statusCode": 200,
                "Access-Control-Allow-Origin": '*',  #CORS 관련 부분
                "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
                "body": "Success",
                "data": json.dumps(sanitized_results, default=json_default, ensure_ascii=False)
            }
        elif event['httpMethod'] == "DELETE":  #비밀번호 삭제
            select_query = "SELECT password FROM t_board WHERE updated_id = %s"
            cur.execute(select_query, (event["updated_id"],))
            stored_password = cur.fetchone()
            if verify_password(stored_password[0], event['password']):  #비밀번호 검증 후 동일하면 삭제
                delete_query = "DELETE FROM t_board WHERE updated_id = %s"
                cur.execute(delete_query, (event["updated_id"],))
                conn.commit()
            else:
                return {
                    "statusCode": 403,
                    "body": "비밀번호가 일치하지 않습니다.",
                    "data": json.dumps({"success":"n"}, default=json_default, ensure_ascii=False)
                }
            return {
                "statusCode": 200,
                "body": "파일이 삭제되었습니다.",
                "data": json.dumps({"success":"y"}, default=json_default, ensure_ascii=False)
            }

    return {
        "statusCode": 400,
        "body": "원인 모를 에러 발생"
    }
