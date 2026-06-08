require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const axios = require('axios');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');

// 라우터 불러오기
const userRoute = require('./src/routes/userRoute');

const app = express();

// 1. 미들웨어 설정
app.use(cors());
app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'star_spot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); 
  },
  filename: function (req, file, cb) {
    // 파일 이름이 겹치지 않게 타임스탬프를 결합합니다 (예: 1717834_photo.png)
    cb(null, `${Date.now()}_${file.originalname}`); 
  }
});
const upload = multer({ storage: storage });

// 2. API 경로 설정
app.use('/api/users', userRoute);

// 인생네컷 업로드 및 DB 주소 저장 API
app.post('/api/life4cut/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "업로드된 사진 파일이 없습니다." });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    // 2. 프론트엔드가 FormData로 보낸 후기 데이터들을 변수에 담기
    // (프론트엔드에서 던내주는 키 이름과 req.body.뒤의 이름을 맞춰주세요!)
    const { userEmail, nickname, content, locationName, latitude, longitude } = req.body;

    const [result] = await pool.query(
      `INSERT INTO posts 
        (user_email, nickname, content, location_name, latitude, longitude, photo_path) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userEmail || null, 
        nickname || '익명', 
        content || '', 
        locationName || null, 
        latitude ? Number(latitude) : null, 
        longitude ? Number(longitude) : null, 
        imageUrl
      ]
    );

    res.status(200).json({ 
      success: true, 
      message: "성지순례 후기 및 인생네컷 사진 등록 성공!", 
      postId: result.insertId, // 생성된 게시글의 고유 ID
      url: imageUrl 
    });

  } catch (error) {
    console.error("인생네컷 후기 등록 에러:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
});

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