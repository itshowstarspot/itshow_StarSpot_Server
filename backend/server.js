// const db = require('./src/config/db'); // DB 연결 코드 불러오기
const express = require('express');
const cors = require('cors');
const os = require('os'); // 내 컴퓨터의 네트워크 정보를 가져오는 도구
const app = express();
const axios = require('axios');
require('dotenv').config();

// 라우터 불러오기
const userRoute = require('./src/routes/userRoute');

// 1. 미들웨어 설정
app.use(cors());
app.use(express.json());

// 2. API 경로 설정
app.use('/api/users', userRoute);

// TMAP 대중교통 API
app.post('/api/transit/routes', async (req, res) => {
    try {
        const response = await axios.post(
            "https://apis.openapi.sk.com/transit/routes",
            req.body,
            {
                headers: {
                    'accept': 'application/json',
                    'content-type': 'application/json',
                    'appKey': process.env.TMAP_APPKEY
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error("티맵 호출 에러:", error.message);
        res.status(500).json({ error: "티맵 API 연결 실패" });
    }
});

// 3. 기본 홈 경로
app.get('/', (req, res) => {
    res.send('Star_Spot 백엔드 서버가 가동 중입니다.');
});

// 4. 서버 실행 및 내 IP 주소 출력 기능
const PORT = 5000;

// 내 컴퓨터의 IPv4 주소를 찾는 함수
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

const myIp = getLocalIp();

app.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`[시스템] Star_Spot 백엔드 서버 가동 성공!`);
    console.log(`[로컬 주소] http://localhost:${PORT}`);
    console.log(`[네트워크 주소] http://${myIp}:${PORT}`);
    console.log(`================================================`);
    console.log(`※ 프론트엔드 담당자에게 '네트워크 주소'를 공유해주세요.`);
});