require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const axios = require('axios');
const mysql = require('mysql2/promise');

// 라우터 불러오기
const userRoute = require('./src/routes/userRoute');

const app = express();

// 1. 미들웨어 설정
app.use(cors());
app.use(express.json());

app.use(express.urlencoded({ extended: true })); // form-data(텍스트) 해석용
app.use('/uploads', express.static('uploads')); // uploads 폴더를 외부에서 접근 가능하게 설정

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'star_spot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 2. API 경로 설정 (여기서 /api/users와 userRoute를 연결)
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

        const plan = response.data.metaData.plan;
        const itinery = plan.itineraries[0]; // 첫 번째 경로만 추출

        const summary = {
            totalTime: Math.round(itinery.totalTime / 60) + "분",
            totalFare: itinery.fare.regular.totalFare + "원",
            path: itinery.legs.map(leg => {
                const time = Math.round(leg.sectionTime / 60); // 해당 구간 소요 시간(분)
                const destination = leg.end.name;

                if (leg.mode === "WALK") {
                    return `🚶 도보 ${time}분 (${destination}까지)`;
                } else if (leg.mode === "BUS") {
                    return `🚍 ${leg.route} 이용 | ${time}분 소요 (${leg.passStopList.stations.length}개 정류장 이동, ${destination} 하차)`;
                } else if (leg.mode === "SUBWAY") {
                    return `🚇 ${leg.route} 이용 | ${time}분 소요 (${destination} 하차)`;
                }
                return `${leg.mode} | ${time}분 소요`;
            })
        };

        res.json(summary);

    } catch (error) {
        console.error("티맵 호출 에러:", error.message);
        res.status(500).json({ error: "티맵 API 연결 실패" });
    }
});

// 지도 전용 성지 장소 조회 API
app.get('/api/spots', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM spots');
    
    const formattedSpots = rows.map(spot => ({
      id: spot.id,
      groupName: spot.group_name,
      memberName: spot.member_name,
      placeName: spot.place_name,
      category: spot.category,
      description: spot.description,
      latitude: Number(spot.latitude), 
      longitude: Number(spot.longitude),
      operatingHours: spot.operating_hours,
      holiday: spot.holiday,
      address: spot.address,
      imageUrl: spot.image_url
    }));

    res.status(200).json(formattedSpots);
  } catch (error) {
    console.error('DB 조회 중 에러 발생:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

app.get('/', (req, res) => {
    res.send('Star_Spot 백엔드 서버가 가동 중입니다.');
});

// 4. 서버 실행 및 IP 출력
const PORT = 5000;

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
});