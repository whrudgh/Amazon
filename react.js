import React, { useEffect, useState } from 'react';
import AWS from 'aws-sdk';
import './Upload.css';
import imageCompression from 'browser-image-compression';
import { BsSun } from "react-icons/bs";

const Upload = () => {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [fileUrls, setFileUrls] = useState([]);
  const [s3, setS3] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  const REACT_APP_S3_BUCKET = 'drive-sesac-s3';
  const REACT_APP_REGION = 'ap-northeast-2';
  const REACT_APP_COGNITO_IDENTITY_POOL_ID = "ap-northeast-2:87b0718a-8e32-40b3-90b3-9dd591dd0744";

  useEffect(() => {  //마운트 됐을 때 자격증명 설정
    AWS.config.update({
      region: REACT_APP_REGION,
      credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: REACT_APP_COGNITO_IDENTITY_POOL_ID,
      }),
    });

    AWS.config.credentials.get((err) => {
      if (err) {
        console.error("Error setting up AWS credentials:", err);
        setMessage("AWS 자격증명 설정 오류가 발생했습니다.");
      } else {
        const s3Instance = new AWS.S3({
          params: { Bucket: REACT_APP_S3_BUCKET },
          region: REACT_APP_REGION,
        });
        setS3(s3Instance);
      }
    });
  }, []);

  const handleFileChange = (e) => {  //첨부파일 change
    const selectedFile = e.target.files[0];
    if (selectedFile && (selectedFile.type === "image/jpg" || selectedFile.type === "image/jpeg" || selectedFile.type === "image/png")) {
      setFile(selectedFile);
      setMessage("");
    } else {
      setFile(null);
      setMessage("JPG, JPEG, PNG 파일만 업로드할 수 있습니다.");
      alert("JPG, JPEG, PNG 파일만 업로드할 수 있습니다.")
    }
  };
  const checkIfFileExists = async (fileName) => { // 파일 이름 체크
    const params = {
      Bucket: REACT_APP_S3_BUCKET,
      Prefix: `file/${fileName}`,
    };
  
    try {
      const data = await s3.listObjectsV2(params).promise();
      return data.Contents.length > 0;  // 같은 이름의 파일이 있으면 true 반환
    } catch (err) {
      console.error('Error checking if file exists:', err);
      return false;
    }
  };
  const handleUpload =async() => {  //파일 업로드
    if (!s3) {
      setMessage("S3 설정 중입니다. 잠시 후 다시 시도해주세요.");
      alert("S3 설정 중입니다. 잠시 후 다시 시도해주세요.")
      return;
    }
    if (!file) {
      setMessage("업로드할 파일을 선택해주세요.");
      alert("업로드할 파일을 선택해주세요.")
      return;
    }
    if (!password) {
      setMessage("비밀번호를 입력해주세요.");
      alert("비밀번호를 입력해주세요.")
      return;
    }
    const fileExists = await checkIfFileExists(file.name);  // 파일 존재 여부 체크
    if (fileExists) {
      setMessage("같은 이름의 파일이 이미 존재합니다. 다른 이름을 사용해 주세요.");
      alert("같은 이름의 파일이 이미 존재합니다. 다른 이름을 사용해 주세요.")
      return;
    }
    const options = {
      maxWidthOrHeight: 200, // 최대 너비
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);
    const params = {
      Bucket: REACT_APP_S3_BUCKET,
      Key: `file/${compressedFile.name}`,
      Body: compressedFile,
      ContentType: compressedFile.type,
      ACL: 'public-read',
    };
    
    s3.upload(params, async(err, data) => {
      if (err) {
        console.error('Error uploading file:', err);
        setMessage('업로드에 실패하였습니다.');
      } else {
        await fetch('https://ytseplgyf0.execute-api.ap-northeast-2.amazonaws.com/api-rest/board', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            httpMethod: "POST",
            updated_id: `file/${file.name}`,
            title: description,
            password: password 
          }),
        });
        setDescription("");
        setPassword("");
        setMessage('업로드 되었습니다.');
        alert("업로드 되었습니다.")
      }
    });
  };

  // S3 버킷에 저장된 모든 파일 가져오기
  useEffect(() => {
    if (!s3) return;
    const fetchFiles = async () => {
      const params = {
        Bucket: REACT_APP_S3_BUCKET,
        Prefix: 'file/'
      };

      try {
        const data = await s3.listObjectsV2(params).promise();
        const urls = await Promise.all(data.Contents.map(async (item) => {
          const [description,date] = await findRDS(item.Key);
          return {
            key: item.Key,
            url: s3.getSignedUrl('getObject', { Bucket: REACT_APP_S3_BUCKET, Key: item.Key, Expires: 3600 }),
            description: description,
            deletePassword: '',  // 개별 파일 삭제 비밀번호 입력 추가
            date: date, //날짜 추가
            showDetails: false
          };
        }));
        setFileUrls(urls);
      } catch (error) {
        console.error("Error fetching files: ", error);
      }
    };

    fetchFiles();
  }, [s3, message]);

  const deleteFile = async(fileKey, filePassword) => {  //파일 삭제
    if (!filePassword) {
      setMessage("비밀번호를 입력해주세요.");
      alert("비밀번호를 입력해주세요.")
      return;
    }

    const params = { Bucket: REACT_APP_S3_BUCKET, Key: fileKey };

    const response = await fetch('https://ytseplgyf0.execute-api.ap-northeast-2.amazonaws.com/api-rest/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        httpMethod: "DELETE",
        updated_id: fileKey,
        password: filePassword
      }),
    });

    const data = await response.json();
    const success = (JSON.parse(data.data).success);
    if(success === 'y') {
      s3.deleteObject(params, (err) => {
        if (err) {
          console.error('Error deleting file:', err);
          setMessage("파일 삭제에 실패했습니다.");
        } else {
          setFileUrls((prevFileUrls) => 
            prevFileUrls.filter((file) => file.key !== fileKey)
          );
          setMessage("파일이 삭제되었습니다.");
          alert("파일이 삭제되었습니다.")
        }
      });
    } else {
      alert("비밀번호가 틀렸습니다.")
      setMessage("비밀번호가 틀렸습니다.");
    }
  };

  const findRDS = async (key) => {  //데이터베이스에서 파일이름에 해당하는 설명 값 및 생성 날짜 찾기
    try {
      const response = await fetch('https://ytseplgyf0.execute-api.ap-northeast-2.amazonaws.com/api-rest/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ httpMethod: "GET" })
      });
      const data = await response.json();
      const descriptions = JSON.parse(data.data);
      for(let i = 0; i < descriptions.length; i++) {
        if(descriptions[i][6] === key) {
          return [descriptions[i][1],descriptions[i][3]];
        }
      }
      return '설명 없음';
    } catch (error) {
      console.error("Error fetching RDS data:", error);
      return '설명 없음';
    }
  };
  // 파일 다운로드 
  const downloadFile = async (fileKey) => {
    const params = { Bucket: REACT_APP_S3_BUCKET, Key: fileKey };

    try {
      const data = await s3.getObject(params).promise();
      const url = window.URL.createObjectURL(new Blob([data.Body]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileKey.split('/').pop()); // 파일 이름 설정
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
      setMessage("파일 다운로드에 실패했습니다.");
    }
  };
  const toggleDetails = (index) => { //자세히보기 토글
    setFileUrls((prev) => 
      prev.map((file, idx) => idx === index ? { ...file, showDetails: !file.showDetails } : file)
    );
  };
  useEffect(() => {
    // 테마 적용 및 로컬스토리지에 저장
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  return (
    <div className="container">
      <h1>Surviving Amazon</h1>
      <input type="file" onChange={handleFileChange} />
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="파일 설명"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="비밀번호 입력"
      />
      <button onClick={handleUpload}>Upload</button>
      {message && <p className="message">{message}</p>}

      <h2>Image List</h2>
      <div className="image-list">
        {fileUrls.map((file, index) => (
          <div key={index} className="image-card">
            <img src={file.url} alt={`file-${index}`} />
            <div>{file.description}</div>
            <button onClick={() => toggleDetails(index)}>
              {file.showDetails ? '간단히 보기' : '자세히 보기'}
            </button>
            {file.showDetails && (
              <div className="file-details">
                <p>파일명: {file.key.split('/').pop()}</p>
                <p>업로드 날짜: {file.date}</p>
                <p>파일 유형: {file.key.split('.').pop()}</p>
              </div>
            )}
            <input
              type="password"
              value={file.deletePassword}
              onChange={(e) => {
                const newFileUrls = [...fileUrls];
                newFileUrls[index].deletePassword = e.target.value;
                setFileUrls(newFileUrls);
              }}
              placeholder="삭제 비밀번호"
            />
            <button onClick={() => deleteFile(file.key, file.deletePassword)} className="delete-button">
              Delete
            </button>
            <button onClick={() => downloadFile(file.key)} className="download-button">Download</button>
          </div>
        ))}
      </div>

      <button onClick={toggleTheme} className="theme-toggle-button">
        <BsSun />
      </button>
    </div>
  );
};

export default Upload;
