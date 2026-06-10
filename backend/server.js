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
    cb(null, `${Date.now()}_${file.originalname}`); 
  }
});
const upload = multer({ storage: storage });

// 2. API 경로 설정
app.use('/api/users', userRoute);

// 2. API 경로 설정
app.use('/api/users', userRoute);

// 🌟 [백엔드 server.js 프로필 라우터 최종 수정] 닉네임 + 최애 아이돌 동시 대응 복합 쿼리
app.put('/api/users/profile', async (req, res) => {
  try {
    const { userId, email, favorite_idol, nickname } = req.body;

    if (!userId && !email) {
      return res.status(400).json({ success: false, message: "유저 식별 정보(id 또는 email)가 없습니다." });
    }

    let query = '';
    let queryParams = [];

    // 🌟 상황별로 유연하게 쿼리를 짜기 위해 조건문 구성 (닉네임과 최애 둘 다 혹은 각각 들어올 수 있도록 처리)
    // 여기서는 마이페이지/홈에서 각각 호출하므로 넘어온 값만 SET 하거나 둘 다 SET 하도록 동적 쿼리 스타일로 구성합니다.
    if (userId) {
      query = 'UPDATE users SET favorite_idol = COALESCE(?, favorite_idol), nickname = COALESCE(?, nickname) WHERE id = ?';
      queryParams = [favorite_idol || null, nickname || null, userId];
    } else {
      query = 'UPDATE users SET favorite_idol = COALESCE(?, favorite_idol), nickname = COALESCE(?, nickname) WHERE email = ?';
      queryParams = [favorite_idol || null, nickname || null, email];
    }

    const [result] = await pool.query(query, queryParams);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "해당 유저를 찾을 수 없습니다." });
    }

    res.status(200).json({ 
      success: true, 
      message: "DB 프로필(닉네임/최애) 업데이트 성공! ⭐",
      favoriteIdol: favorite_idol,
      nickname: nickname
    });

  } catch (error) {
    console.error("프로필 DB 업데이트 에러:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
});

// 인생네컷 업로드 및 DB 주소 저장 API
app.post('/api/life4cut/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "업로드된 사진 파일이 없습니다." });
    }

    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
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
      postId: result.insertId, 
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
        const itinery = plan.itineraries[0]; 

        const summary = {
            totalTime: Math.round(itinery.totalTime / 60) + "분",
            totalFare: itinery.fare.regular.totalFare + "원",
            path: itinery.legs.map(leg => {
                const time = Math.round(leg.sectionTime / 60); 
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


// =================================================================
// [백엔드 server.js 최종수정] idolId 및 카테고리(영어/한글/대소문자 완벽 대응) 통합 API
// =================================================================
app.get('/api/places', async (req, res) => {
  try {
    const { idolId, category } = req.query; // 프론트가 보낸 idolId와 category 추출
    
    let query = 'SELECT * FROM spots WHERE 1=1'; 
    let params = [];

    // 1. idolId 필터링 (기존 로직 유지)
    if (idolId) {
      query += ' AND (member_name LIKE ? OR group_name LIKE ?)';
      params.push(`%${idolId}%`, `%${idolId}%`);
    }

    // 2. [★업그레이드★] category 필터링 조건 (한글/영어 대소문자 공백 완전 파괴)
    if (category && category.trim() !== '' && category !== 'all') {
      // 프론트가 'restaurant', 'cafe', 'playground' 등을 보낼 때 유연하게 매치하기 위해 LIKE 사용
      query += ' AND (category LIKE ? OR category LIKE ?)';
      
      const cleanCategory = category.trim().toLowerCase();
      params.push(`%${cleanCategory}%`, `%${category}%`);
    }

    const [rows] = await pool.query(query, params);

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
    console.error('장소 필터링 조회 중 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// =======================================================
// [백엔드 server.js 추가] 기존 프론트엔드가 호출하는 전체 목록 API 복구
// =======================================================
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
    console.error('전체 장소 목록 조회 중 에러:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 2. 단일 장소 상세 조회 API 
app.get('/api/places/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT * FROM spots WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: '해당 장소를 찾을 수 없습니다.' });
    }

    const spot = rows[0];
    const formattedSpot = {
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
    };

    res.status(200).json(formattedSpot);
  } catch (error) {
    console.error('상세 조회 중 에러 발생:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 3. [추가] 장소별 후기 피드 조회 API (feedService.js 연동용)
app.get('/api/feeds', async (req, res) => {
  try {
    const { placeId } = req.query;
    let query = 'SELECT * FROM posts';
    let params = [];

    if (placeId) {
      // 업로드 테이블(posts)에 기록된 성지 고유 ID나 장소 기반 매칭이 있다면 필터링합니다.
      // 현재 posts 테이블의 구조에 맞춰 필요시 쿼리를 커스텀하세요.
      query += ' WHERE id = ?'; // 임시 매칭용 구조
      params.push(placeId);
    }
    
    query += ' ORDER BY id DESC'; // 최신순 정렬

    const [rows] = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error('피드 조회 중 에러 발생:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// ==========================================
// [백엔드 server.js 추가] 나만의 코스 관련 API 라우터
// ==========================================

// 1. 코스 목록 조회 API
app.get('/api/courses', async (req, res) => {
  try {
    // 임시로 보낼 빈 배열 혹은 DB에 코스 테이블(courses)이 있다면 조회를 진행합니다.
    // 여기서는 404 에러와 프론트엔드 오류를 막기 위해 정상적인 빈 배열(또는 기본값)을 반환합니다.
    const mockCourses = [
      {
        id: 'course_1',
        title: '카리나 성수동 힐링 코스',
        description: '성수동 카페부터 맛집까지 한 번에 도는 코스!',
        spotsCount: 3,
        createdAt: new Date().toISOString()
      }
    ];

    // 만약 DB에 별도의 courses 테이블을 만드셨다면 아래 주석을 해제하고 연동하세요.
    // const [rows] = await pool.query('SELECT * FROM courses ORDER BY id DESC');
    // return res.status(200).json(rows);

    res.status(200).json(mockCourses);
  } catch (error) {
    console.error('코스 목록 조회 중 에러 발생:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// 2. 코스 등록 API (미리 만들어두기)
app.post('/api/courses', async (req, res) => {
  try {
    const { title, description, spotIds } = req.body;
    res.status(201).json({ success: true, message: '코스가 성공적으로 등록되었습니다.' });
  } catch (error) {
    console.error('코스 등록 중 에러 발생:', error);
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

// 🌟 [백엔드 server.js 추가] 회원 탈퇴 (계정 삭제) API
app.delete('/api/users/:idOrEmail', async (req, res) => {
  try {
    const { idOrEmail } = req.params;

    if (!idOrEmail) {
      return res.status(400).json({ success: false, message: "유저 식별 정보가 없습니다." });
    }

    let query = '';
    // 숫자로만 이루어져 있으면 id(PK), 그 외에는 email로 판단하여 삭제
    if (/^\d+$/.test(idOrEmail)) {
      query = 'DELETE FROM users WHERE id = ?';
    } else {
      query = 'DELETE FROM users WHERE email = ?';
    }

    const [result] = await pool.query(query, [idOrEmail]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "삭제할 유저를 찾을 수 없습니다." });
    }

    res.status(200).json({ success: true, message: "회원 탈퇴가 정상적으로 처리되었습니다." });
  } catch (error) {
    console.error("회원 탈퇴 DB 에러:", error);
    res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
});

app.listen(PORT, () => {
    console.log(`================================================`);
    console.log(`[시스템] Star_Spot 백엔드 서버 가동 성공!`);
    console.log(`[로컬 주소] http://localhost:${PORT}`);
    console.log(`[네트워크 주소] http://${myIp}:${PORT}`);
    console.log(`================================================`);
});