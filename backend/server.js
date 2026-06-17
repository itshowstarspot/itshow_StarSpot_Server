require('dotenv').config();
const express = require('express');
const cors = require('cors');
const os = require('os');
const axios = require('axios');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 라우터 불러오기
const userRoute = require('./src/routes/userRoute');

const app = express();

// ==========================================
// 1. 미들웨어 및 static 설정
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// 2. MySQL Connection Pool 설정
// ==========================================
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'star_spot',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 데이터베이스 연결 확인 로그 추가
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log("✅ [시스템] MySQL 데이터베이스 연결 성공! (창고 문 열림)");
    connection.release();
  } catch (err) {
    console.error("❌ [시스템] MySQL 데이터베이스 연결 실패:", err.message);
  }
})();

// 카카오 REST 키 로테이션
const kakaoKeys = (process.env.KAKAO_REST_API_KEY || '')
  .split(',').map(k => k.trim()).filter(Boolean);
let kakaoKeyIdx = 0;

async function kakaoGet(url, params) {
  const total = kakaoKeys.length;
  if (total === 0) throw new Error('카카오 REST 키가 없습니다');
  for (let i = 0; i < total; i++) {
    const key = kakaoKeys[(kakaoKeyIdx + i) % total];
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `KakaoAK ${key}` },
        params,
      });
      kakaoKeyIdx = (kakaoKeyIdx + i + 1) % total;
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      if ((status === 429 || status === 403 || status === 401) && i < total - 1) {
        console.warn(`카카오 키 [${i}] 실패(${status}), 다음 키로 전환`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('모든 카카오 키 사용량 초과');
}

// 카카오 차량 경로 프록시
app.get('/api/kakao/directions', async (req, res) => {
  try {
    const data = await kakaoGet('https://apis-navi.kakaomobility.com/v1/directions', req.query);
    res.json(data);
  } catch (err) {
    console.error('카카오 경로 프록시 에러:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: '카카오 경로 API 실패' });
  }
});

// 카카오 키워드 검색 프록시
app.get('/api/kakao/search/keyword', async (req, res) => {
  try {
    const data = await kakaoGet('https://dapi.kakao.com/v2/local/search/keyword.json', req.query);
    res.json(data);
  } catch (err) {
    console.error('카카오 검색 프록시 에러:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: '카카오 검색 API 실패' });
  }
});

// 좌표 → 주소 변환 프록시
app.get('/api/kakao/geo/coord2address', async (req, res) => {
  try {
    const data = await kakaoGet('https://dapi.kakao.com/v2/local/geo/coord2address.json', req.query);
    res.json(data);
  } catch (err) {
    console.error('카카오 주소변환 프록시 에러:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: '카카오 주소변환 API 실패' });
  }
});

// 글로벌 pool 바인딩 (외부 라우터인 userRoute 등에서 쓸 수 있도록 최적화)
app.set('pool', pool);

// ==========================================
// 3. 파일 업로드 설정 (Multer)
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/'); 
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}_${file.originalname}`); 
  }
});
const upload = multer({ storage: storage });


// ==========================================
// 4. API 경로 및 라우터 설정
// ==========================================

// 기본 루트 확인용
app.get('/', (req, res) => {
    res.send('Star_Spot 백엔드 서버가 가동 중입니다.');
});

// ------------------------------------------
// 🔒 [인증 안전장치 미들웨어성 함수]
// ------------------------------------------
const getEmailFromToken = (req) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log("⚠️ [인증 경고] 요청 헤더에 Authorization 토큰이 없습니다. 가상 계정으로 진행합니다.");
    return "test_user@naver.com"; 
  }

  const token = authHeader.split(' ')[1];
  
  if (!token || token === 'null' || token === 'undefined') {
    console.log("⚠️ [인증 경고] 유효하지 않은 토큰 값이 넘어왔습니다. 가상 계정으로 진행합니다.");
    return "test_user@naver.com";
  }

  if (!token.includes('@')) {
    console.log(`💡 [인증 안내] JWT 토큰 형식이 감지되었습니다: ${token.substring(0, 10)}... 가상 계정으로 전환합니다.`);
    return "test_jwt_user@naver.com";
  }
  
  return token; 
};

// ------------------------------------------
// ❤️ 즐겨찾기(Favorites) API 목록
// ------------------------------------------

// 1. [GET] 로그인한 유저의 즐겨찾기 목록 조회
app.get('/api/favorites', async (req, res) => {
  const userEmail = getEmailFromToken(req);
  console.log(`[즐겨찾기 조회] 요청 유저: ${userEmail}`);

  try {
    const query = 'SELECT spot_id FROM favorites WHERE user_email = ?';
    const [rows] = await pool.query(query, [userEmail]);
    
    const favoriteIds = rows.map(row => String(row.spot_id));
    console.log(`[조회 성공] 유저(${userEmail}) 즐겨찾기 개수: ${favoriteIds.length}개`);
    return res.status(200).json(favoriteIds);
  } catch (error) {
    console.error("❌ [GET /api/favorites] DB 에러 발생:", error);
    return res.status(500).json([]);
  }
});

// 2. [POST] 즐겨찾기 장소 추가
app.post('/api/favorites', async (req, res) => {
  const userEmail = getEmailFromToken(req);
  const { placeId } = req.body; 

  console.log(`[즐겨찾기 추가] 요청 유저: ${userEmail}, 장소 ID: ${placeId}`);

  if (!placeId) {
    return res.status(400).json({ success: false, message: "장소 식별자가 누락되었습니다." });
  }

  const numericSpotId = Number(placeId);
  if (isNaN(numericSpotId)) {
    console.log(`⚠️ [즐겨찾기 패스] '${placeId}'는 정적 더미 데이터 ID이므로 DB 저장을 생략하고 성공 처리합니다.`);
    return res.status(200).json({ success: true, message: "더미 데이터는 로컬 스토리지에만 저장됩니다." });
  }

  try {
    // 외래키 방어용 유저 체크 및 자동 삽입
    const [userExists] = await pool.query('SELECT id FROM users WHERE email = ?', [userEmail]);
    if (userExists.length === 0) {
      console.log(`💡 [외래키 방어] 유저(${userEmail})가 users 테이블에 없어 임시로 자동 생성합니다.`);
      await pool.query(
        "INSERT INTO users (email, password, nickname, favorite_idol) VALUES (?, '1234', '테스트유저', '정국')", 
        [userEmail]
      );
    }

    const checkQuery = 'SELECT id FROM favorites WHERE user_email = ? AND spot_id = ?';
    const [existing] = await pool.query(checkQuery, [userEmail, numericSpotId]);

    if (existing.length > 0) {
      return res.status(200).json({ success: true, message: "이미 등록된 즐겨찾기입니다." });
    }

    const insertQuery = 'INSERT INTO favorites (user_email, spot_id) VALUES (?, ?)';
    await pool.query(insertQuery, [userEmail, numericSpotId]);

    return res.status(200).json({ success: true, message: "성공적으로 즐겨찾기에 등록되었습니다!" });
  } catch (error) {
    console.error("❌ [POST /api/favorites] DB 에러 발생:", error);
    return res.status(500).json({ success: false, message: "즐겨찾기 등록 처리 중 서버 에러 발생" });
  }
});

// 3. [DELETE] 즐겨찾기 장소 해제/삭제
app.delete('/api/favorites/:placeId', async (req, res) => {
  const userEmail = getEmailFromToken(req);
  const { placeId } = req.params;

  console.log(`[즐겨찾기 삭제] 요청 유저: ${userEmail}, 장소 ID: ${placeId}`);

  const numericSpotId = Number(placeId);
  if (isNaN(numericSpotId)) {
    console.log(`⚠️ [즐겨찾기 삭제 패스] '${placeId}'는 로컬 전용 ID이므로 서버에서는 생략합니다.`);
    return res.status(200).json({ success: true, message: "로컬 데이터 해제 완료." });
  }

  try {
    const deleteQuery = 'DELETE FROM favorites WHERE user_email = ? AND spot_id = ?';
    const [result] = await pool.query(deleteQuery, [userEmail, numericSpotId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "삭제할 즐겨찾기 이력이 존재하지 않습니다." });
    }

    return res.status(200).json({ success: true, message: "즐겨찾기가 해제되었습니다." });
  } catch (error) {
    console.error("❌ [DELETE /api/favorites] DB 에러 발생:", error);
    return res.status(500).json({ success: false, message: "즐겨찾기 삭제 처리 중 서버 에러 발생" });
  }
});

// ------------------------------------------
// 🛣️ 나만의 코스(Courses) API 목록 (프론트엔드 완벽 호환 UI 복구 버전)
// ------------------------------------------

// 1. 코스 목록 전체 조회 API (일반 내 코스 및 추천 코스 완벽 분기 처리)
app.get('/api/courses', async (req, res) => {
  const idolId = req.query.idolId || 'leeyoungji';
  const isRecommended = req.query.recommended === 'true'; // 👈 프론트의 recommended 파라미터 감지
  
  console.log(`[코스 목록 조회] 요청된 아이돌 ID: ${idolId}, 추천코스여부: ${isRecommended}`);

  // ── 🌟 [추천 코스 분기] DB spots에서 아이돌별 동적 생성 ──
  if (isRecommended) {
    const IDOL_NAME_MAP = {
      jungkook:   { memberName: '정국',  displayName: '정국' },
      jimin_bang: { memberName: '방지민', displayName: '방지민' },
      karina:     { memberName: '카리나', displayName: '카리나' },
      youngk:     { memberName: '영케이', displayName: '영케이' },
      leeyoungji: { groupName:  '이영지', displayName: '이영지' },
    };

    try {
      const idolsToQuery = (idolId && idolId !== 'all')
        ? [idolId]
        : Object.keys(IDOL_NAME_MAP);

      const recommendedCourses = [];

      for (const iid of idolsToQuery) {
        const mapping = IDOL_NAME_MAP[iid];
        if (!mapping) continue;

        let spotQuery, spotParams;
        if (mapping.memberName) {
          spotQuery = `SELECT id, place_name AS name, address, category, latitude AS lat, longitude AS lng, description
                       FROM spots WHERE member_name = ? LIMIT 5`;
          spotParams = [mapping.memberName];
        } else {
          spotQuery = `SELECT id, place_name AS name, address, category, latitude AS lat, longitude AS lng, description
                       FROM spots WHERE group_name = ? AND member_name IS NULL LIMIT 5`;
          spotParams = [mapping.groupName];
        }

        const [spots] = await pool.query(spotQuery, spotParams);
        if (spots.length < 2) continue;

        recommendedCourses.push({
          id: `rec-${iid}-1`,
          title: `${mapping.displayName} 성지 코스`,
          idolId: iid,
          isRecommended: true,
          places: spots,
        });
      }

      return res.status(200).json(recommendedCourses);
    } catch (err) {
      console.error('[추천 코스 조회 오류]', err);
      return res.status(500).json([]);
    }
  }

  // ── 🏠 [일반 내 코스 분기] DB에서 실시간 저장 데이터 조회 ──
  try {
    const userEmail = req.query.userEmail || null;

    let query = `
      SELECT
        id,
        title,
        idol_id AS idolId,
        user_email AS userEmail,
        created_at AS createdAt
      FROM courses
      WHERE 1=1
    `;
    const params = [];

    if (userEmail) {
      // 내 코스: 이메일 기준으로만 조회 (아이돌 무관하게 내 코스 전체 표시)
      query += ` AND user_email = ?`;
      params.push(userEmail);
    } else {
      // 비로그인 or 공개 조회: 아이돌 필터 적용
      query += ` AND (idol_id = ? OR idol_id IS NULL OR ? = 'all')`;
      params.push(idolId, idolId);
    }

    query += ` ORDER BY created_at DESC`;

    const [courses] = await pool.query(query, params);

    for (let course of courses) {
      const spotQuery = `
        SELECT 
          s.id, 
          s.place_name AS name, 
          s.address, 
          s.category, 
          s.latitude AS lat, 
          s.longitude AS lng,
          s.description,
          s.image_url AS imageUrl
        FROM course_spots cs
        JOIN spots s ON cs.spot_id = s.id
        WHERE cs.course_id = ?
        ORDER BY cs.sequence_order ASC
      `;
      const [spots] = await pool.query(spotQuery, [course.id]);
      
      course.places = spots; 
      course.spotsCount = spots.length; 
    }

    return res.status(200).json(courses);

  } catch (error) {
    console.error('❌ 코스 목록 DB 조회 중 에러 발생:', error);
    return res.status(200).json([]); 
  }
});

// 코스 수정 API 추가 (PUT /api/courses/:id)
const getCourseById = async (courseId, db = pool) => {
  const [courses] = await db.query(
    `SELECT
      id,
      title,
      idol_id AS idolId,
      user_email AS userEmail,
      created_at AS createdAt
     FROM courses
     WHERE id = ?`,
    [courseId]
  );

  if (courses.length === 0) {
    return null;
  }

  const course = courses[0];
  const [spots] = await db.query(
    `SELECT
      s.id,
      s.place_name AS name,
      s.address,
      s.category,
      s.latitude AS lat,
      s.longitude AS lng,
      s.description,
      s.image_url AS imageUrl
     FROM course_spots cs
     JOIN spots s ON cs.spot_id = s.id
     WHERE cs.course_id = ?
     ORDER BY cs.sequence_order ASC`,
    [courseId]
  );

  course.places = spots;
  course.spotsCount = spots.length;
  return course;
};

app.post('/api/courses/:id/update', async (req, res) => {
  const courseId = req.params.id;
  const { title, spotIds, places } = req.body;

  console.log(`[코스 수정 요청] 코스 ID: ${courseId}, 새 제목: ${title}`);

  let finalSpotIds = [];
  if (Array.isArray(spotIds)) {
    finalSpotIds = spotIds;
  } else if (Array.isArray(places)) {
    finalSpotIds = places.map(p => p.id).filter(Boolean);
  }

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: '코스 제목은 필수입니다.' });
  }

  if (finalSpotIds.length < 2) {
    return res.status(400).json({ error: '코스는 최소 2개 이상의 장소가 필요합니다.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const updateCourseQuery = `UPDATE courses SET title = ? WHERE id = ?`;
    const [updateResult] = await connection.query(updateCourseQuery, [title, courseId]);

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }

    const deleteSpotsQuery = `DELETE FROM course_spots WHERE course_id = ?`;
    await connection.query(deleteSpotsQuery, [courseId]);

    const insertSpotQuery = `
      INSERT INTO course_spots (course_id, spot_id, sequence_order) 
      VALUES (?, ?, ?)
    `;
    for (let i = 0; i < finalSpotIds.length; i++) {
      await connection.query(insertSpotQuery, [courseId, finalSpotIds[i], i + 1]);
    }

    const updatedCourse = await getCourseById(courseId, connection);
    await connection.commit();
    return res.status(200).json({
      success: true,
      message: '코스가 성공적으로 수정되었습니다.',
      course: updatedCourse,
      data: updatedCourse
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ 코스 수정 DB 처리 중 에러 발생:', error);
    return res.status(500).json({ error: '코스 수정 중 서버 에러가 발생했습니다.' });
  } finally {
    connection.release(); // 연결 반환
  }
});

app.post('/api/courses-update-bypass/:id', async (req, res) => {
  const courseId = req.params.id;
  const { title, spotIds, places } = req.body;

  console.log(`[🚀 우회 포스트 수정 요청] 코스 ID: ${courseId}, 새 제목: ${title}`);

  let finalSpotIds = [];
  if (Array.isArray(spotIds)) {
    finalSpotIds = spotIds;
  } else if (Array.isArray(places)) {
    finalSpotIds = places.map(p => p.id).filter(Boolean);
  }

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: '코스 제목은 필수입니다.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const updateCourseQuery = `UPDATE courses SET title = ? WHERE id = ?`;
    const [updateResult] = await connection.query(updateCourseQuery, [title, courseId]);

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }

    const deleteSpotsQuery = `DELETE FROM course_spots WHERE course_id = ?`;
    await connection.query(deleteSpotsQuery, [courseId]);

    const insertSpotQuery = `
      INSERT INTO course_spots (course_id, spot_id, sequence_order) 
      VALUES (?, ?, ?)
    `;
    for (let i = 0; i < finalSpotIds.length; i++) {
      await connection.query(insertSpotQuery, [courseId, finalSpotIds[i], i + 1]);
    }

    const updatedCourse = await getCourseById(courseId, connection);
    await connection.commit();
    return res.status(200).json({
      success: true,
      message: '코스가 성공적으로 수정되었습니다.',
      course: updatedCourse,
      data: updatedCourse
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ 우회 코스 수정 에러:', error);
    return res.status(500).json({ error: '서버 에러 발생' });
  } finally {
    connection.release();
  }
});

app.put('/api/courses/:id', async (req, res) => {
  const courseId = req.params.id;
  const { title, spotIds, places } = req.body;

  console.log(`[🚨 404 구출 - PUT 수정 요청] 코스 ID: ${courseId}, 새 제목: ${title}`);

  let finalSpotIds = [];
  if (Array.isArray(spotIds)) {
    finalSpotIds = spotIds;
  } else if (Array.isArray(places)) {
    finalSpotIds = places.map(p => p.id).filter(Boolean);
  }

  if (!title || title.trim() === '') {
    return res.status(400).json({ error: '코스 제목은 필수입니다.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 코스 제목 업데이트
    const updateCourseQuery = `UPDATE courses SET title = ? WHERE id = ?`;
    const [updateResult] = await connection.query(updateCourseQuery, [title, courseId]);

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없습니다.' });
    }

    // 2. 기존 코스 장소 매핑 삭제
    const deleteSpotsQuery = `DELETE FROM course_spots WHERE course_id = ?`;
    await connection.query(deleteSpotsQuery, [courseId]);

    // 3. 새로운 코스 장소 매핑 순서대로 삽입
    const insertSpotQuery = `
      INSERT INTO course_spots (course_id, spot_id, sequence_order) 
      VALUES (?, ?, ?)
    `;
    for (let i = 0; i < finalSpotIds.length; i++) {
      await connection.query(insertSpotQuery, [courseId, finalSpotIds[i], i + 1]);
    }

    const updatedCourse = await getCourseById(courseId, connection);
    await connection.commit();
    return res.status(200).json({
      success: true,
      message: '코스가 성공적으로 수정되었습니다.',
      course: updatedCourse,
      data: updatedCourse
    });
  } catch (error) {
    await connection.rollback();
    console.error('❌ PUT 코스 수정 중 DB 에러 발생:', error);
    return res.status(500).json({ error: '코스 수정 중 서버 에러가 발생했습니다.' });
  } finally {
    connection.release();
  }
});

// 2. 코스 등록 API (title 및 idol_id 완벽 연동)
app.post('/api/courses', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { title, course_name, spotIds, places, selectedPlaces, idolId, userEmail: bodyEmail } = req.body;
    const userEmail = bodyEmail || getEmailFromToken(req);

    console.log(`[코스 생성 시도] 유저: ${userEmail}, 전달데이터:`, req.body);

    const finalTitle = title || course_name;
    const finalIdolId = idolId || 'leeyoungji'; // 아이돌 유실 방지 방어선

    if (!finalTitle) {
      return res.status(400).json({ success: false, message: '코스 제목을 입력해주세요.' });
    }

    await connection.beginTransaction();

    // 외래키 방어용 유저 체크
    const [userExists] = await connection.query('SELECT id FROM users WHERE email = ?', [userEmail]);
    if (userExists.length === 0) {
      console.log(`💡 [외래키 방어] 코스 등록 중 유저(${userEmail}) 정보가 DB에 없어 임시 계정을 자동 생성합니다.`);
      await connection.query(
        "INSERT INTO users (email, password, nickname) VALUES (?, '1234', '임시유저')", 
        [userEmail]
      );
    }

    // 💡 변경된 테이블 규격(title, idol_id)에 맞춰 데이터 매핑 및 저장
    const insertCourseQuery = 'INSERT INTO courses (user_email, title, idol_id, created_at) VALUES (?, ?, ?, NOW())';
    const [courseResult] = await connection.query(insertCourseQuery, [userEmail, finalTitle, finalIdolId]);
    const newCourseId = courseResult.insertId;

    console.log(`[DB 코스 삽입 성공] ID: ${newCourseId}, 제목: ${finalTitle}, 아이돌: ${finalIdolId}`);

    // 장소 ID 유실 없는 통합 파싱 처리
    let finalSpotIds = [];
    if (spotIds && Array.isArray(spotIds)) {
      finalSpotIds = spotIds;
    } else if (selectedPlaces && Array.isArray(selectedPlaces)) {
      finalSpotIds = selectedPlaces.map(p => p.id || p.spot_id);
    } else if (places && Array.isArray(places)) {
      finalSpotIds = places.map(p => {
        const rawId = typeof p === 'object' ? String(p.id || p.spot_id) : String(p);
        const onlyNumbers = rawId.replace(/[^0-9]/g, ''); 
        return onlyNumbers ? Number(onlyNumbers) : null;
      }).filter(id => id !== null);
    }

    console.log(`[스팟 ID 파싱 결과]`, finalSpotIds);

    if (finalSpotIds.length > 0) {
      const insertSpotsQuery = 'INSERT INTO course_spots (course_id, spot_id, sequence_order) VALUES (?, ?, ?)';
      
      for (let i = 0; i < finalSpotIds.length; i++) {
        const spotId = finalSpotIds[i];
        const sequenceOrder = i + 1; 

        if (!isNaN(spotId) && spotId > 0) {
          try {
            await connection.query(insertSpotsQuery, [newCourseId, spotId, sequenceOrder]);
            console.log(`   └─ [스팟 매핑 성공] 코스 ID: ${newCourseId} -> 장소 ID: ${spotId} (순서: ${sequenceOrder})`);
          } catch (spotErr) {
            console.log(`⚠️ 장소 ID ${spotId}번 연결 실패:`, spotErr.message);
          }
        }
      }
    }

    await connection.commit();
    return res.status(201).json({ 
      success: true, 
      message: '코스가 성공적으로 등록되었습니다.',
      courseId: newCourseId 
    });

  } catch (error) {
    await connection.rollback();
    console.error('❌ 코스 등록 중 치명적 DB 에러 발생 (롤백 완료):', error);
    return res.status(500).json({ success: false, message: '서버 내부 에러가 발생했습니다.', error: error.message });
  } finally {
    connection.release();
  }
});

// 3. 코스 단건 조회 API (공유 링크용)
app.get('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [courses] = await pool.query(
      'SELECT id, title, idol_id AS idolId, user_email AS userEmail, created_at AS createdAt FROM courses WHERE id = ?',
      [id]
    );
    if (courses.length === 0) {
      return res.status(404).json({ success: false, message: '코스를 찾을 수 없어요.' });
    }
    const course = courses[0];
    const [spots] = await pool.query(
      `SELECT s.id, s.place_name AS name, s.address, s.latitude AS lat, s.longitude AS lng
       FROM course_spots cs
       JOIN spots s ON cs.spot_id = s.id
       WHERE cs.course_id = ?
       ORDER BY cs.sequence_order ASC`,
      [id]
    );
    course.places = spots;
    return res.status(200).json({ success: true, data: course });
  } catch (error) {
    console.error('❌ 코스 단건 조회 에러:', error);
    return res.status(500).json({ success: false, message: '서버 에러가 발생했습니다.' });
  }
});

// 4. 코스 삭제 API
app.delete('/api/courses/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[코스 삭제 시도] 삭제할 코스 ID: ${id}`);

  if (!id || id === 'undefined') {
    return res.status(400).json({ success: false, message: '유효한 코스 ID가 아닙니다.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query('DELETE FROM course_spots WHERE course_id = ?', [id]);
    const [result] = await connection.query('DELETE FROM courses WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: '삭제하려는 코스가 DB에 존재하지 않습니다.' });
    }

    await connection.commit();
    console.log(`[코스 삭제 성공] 코스 ID: ${id} 및 관련 스팟 매핑 삭제 완료`);
    return res.status(200).json({ success: true, message: '코스가 정상적으로 삭제되었습니다.' });

  } catch (error) {
    await connection.rollback();
    console.error('❌ 코스 삭제 중 DB 에러 발생:', error);
    return res.status(500).json({ success: false, message: '서버 내부 에러로 코스를 삭제하지 못했습니다.' });
  } finally {
    connection.release();
  }
});



// ------------------------------------------
// 👥 유저 관련 라우터 연결
// ------------------------------------------
app.use('/api/users', userRoute);

// 프로필 라우터
app.put('/api/users/profile', async (req, res) => {
  try {
    const { userId, email, favorite_idol, nickname } = req.body;

    if (!userId && !email) {
      return res.status(400).json({ success: false, message: "유저 식별 정보(id 또는 email)가 없습니다." });
    }

    let query = '';
    let queryParams = [];

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

// 회원 탈퇴 API
app.delete('/api/users/:idOrEmail', async (req, res) => {
  try {
    const { idOrEmail } = req.params;

    if (!idOrEmail) {
      return res.status(400).json({ success: false, message: "유저 식별 정보가 없습니다." });
    }

    let query = '';
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


// ------------------------------------------
// 📸 사진 업로드 및 성지순례 기능 목록
// ------------------------------------------
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

        const plan = response.data.metaData?.plan;
        const itineraries = plan?.itineraries;
        if (!itineraries || itineraries.length === 0) {
            return res.status(404).json({ error: "경로를 찾을 수 없습니다." });
        }
        const itinery = itineraries[0];

        const fare = itinery.fare?.regular?.totalFare
            ?? itinery.fare?.intercity?.totalFare
            ?? 0;

        const summary = {
            totalTime: Math.round(itinery.totalTime / 60),
            totalFare: fare,
            path: itinery.legs.map(leg => {
                const time = Math.round(leg.sectionTime / 60);
                const destination = leg.end?.name || "";

                if (leg.mode === "WALK") {
                    return `🚶 도보 ${time}분 (${destination}까지)`;
                } else if (leg.mode === "BUS") {
                    const stops = leg.passStopList?.stations?.length || 0;
                    return `🚍 ${leg.route} 이용 | ${time}분 소요 (${stops}개 정류장, ${destination} 하차)`;
                } else if (leg.mode === "SUBWAY") {
                    return `🚇 ${leg.route} 이용 | ${time}분 소요 (${destination} 하차)`;
                } else if (leg.mode === "TRAIN" || leg.mode === "EXPRESSBUS") {
                    return `🚄 ${leg.route || leg.mode} | ${time}분 소요 (${destination} 하차)`;
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

// T-Map 차량 경로 API (카카오 모빌리티 할당량 초과 시 폴백)
app.post('/api/car/routes', async (req, res) => {
    try {
        const { startX, startY, endX, endY, passList } = req.body;
        const body = {
            startX: String(startX),
            startY: String(startY),
            endX: String(endX),
            endY: String(endY),
            reqCoordType: 'WGS84GEO',
            resCoordType: 'WGS84GEO',
            searchOption: '0',
        };
        if (passList) body.passList = passList;

        const response = await axios.post(
            'https://apis.openapi.sk.com/tmap/routes',
            body,
            { headers: { appKey: process.env.TMAP_APPKEY } }
        );

        const features = response.data.features || [];
        const summaryFeature = features.find(f => f.geometry.type === 'Point' && f.properties.totalDistance != null);
        const totalDistance = summaryFeature?.properties?.totalDistance || 0;
        const totalTime = summaryFeature?.properties?.totalTime || 0;
        const totalFare = summaryFeature?.properties?.taxiFare || 0;

        const linePath = [];
        features.forEach(f => {
            if (f.geometry.type === 'LineString') {
                f.geometry.coordinates.forEach(([lng, lat]) => {
                    linePath.push({ lng, lat });
                });
            }
        });

        res.json({ totalDistance, totalTime, totalFare, linePath });
    } catch (error) {
        console.error('T-Map 차량 경로 에러:', error.response?.data || error.message);
        res.status(500).json({ error: 'T-Map 차량 API 실패' });
    }
});

// ------------------------------------------
// 🗺️ 장소 및 스팟(Spots) 관련 API 목록
// ------------------------------------------
app.get('/api/places', async (req, res) => {
  try {
    const { idolId, category } = req.query; 
    let query = 'SELECT * FROM spots WHERE 1=1'; 
    let params = [];

    if (idolId) {
      query += ' AND (member_name LIKE ? OR group_name LIKE ? OR place_name LIKE ?)';
      params.push(`%${idolId}%`, `%${idolId}%`, `%${idolId}%`);
    }

    if (category && category.trim() !== '' && category !== 'all') {
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

app.get('/api/feeds', async (req, res) => {
  try {
    const { placeId } = req.query;
    let query = 'SELECT * FROM posts';
    let params = [];

    if (placeId) {
      query += ' WHERE id = ?'; 
      params.push(placeId);
    }
    
    query += ' ORDER BY id DESC'; 

    const [rows] = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error('피드 조회 중 에러 발생:', error);
    res.status(500).json({ message: '서버 에러가 발생했습니다.' });
  }
});

// ------------------------------------------
// 📝 리뷰/피드(Feeds) 추가 API 목록
// ------------------------------------------
app.get('/feeds', async (req, res) => {
  const { placeId, userEmail } = req.query;
  console.log(`[리뷰 조회] placeId: ${placeId}, userEmail: ${userEmail}`);

  try {
    let query = '';
    let params = [];

    if (placeId && placeId !== 'undefined' && !isNaN(placeId)) {
      query = `
        SELECT
          p.id, p.user_email, p.nickname, p.content, p.photo_path AS image, p.created_at,
          s.id AS placeId, s.place_name AS placeName
        FROM posts p
        JOIN spots s ON p.location_name = s.place_name
        WHERE s.id = ?
        ORDER BY p.id DESC
      `;
      params = [Number(placeId)];
    } else {
      const conditions = [];
      if (userEmail && userEmail !== 'undefined' && userEmail !== 'null') {
        conditions.push('p.user_email = ?');
        params.push(userEmail);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      query = `
        SELECT
          p.id, p.user_email, p.nickname, p.content, p.photo_path AS image, p.created_at,
          s.id AS placeId, s.place_name AS placeName
        FROM posts p
        LEFT JOIN spots s ON p.location_name = s.place_name
        ${whereClause}
        ORDER BY p.id DESC
        LIMIT 100
      `;
    }

    const [rows] = await pool.query(query, params);

    const formattedRows = rows.map(row => ({
      id: row.id,
      user_email: row.user_email,
      nickname: row.nickname,
      content: row.content,
      image: row.image,
      created_at: row.created_at,
      placeId: row.placeId || '',
      place_name: row.placeName || row.location_name || '성지순례 장소',
      placeName: row.placeName || row.location_name || '성지순례 장소'
    }));

    return res.status(200).json(formattedRows);
  } catch (error) {
    console.error("❌ [GET /feeds] DB 에러 발생:", error);
    return res.status(500).json([]);
  }
});

app.post('/feeds', upload.any(), async (req, res) => {
  try {
    const { userEmail, nickname, content, placeId, placeName, locationName, latitude, longitude, image } = req.body;
    let imageUrl = null;

    if (image && image.startsWith('data:image')) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const filename = `photo_${Date.now()}.png`;
      const uploadPath = path.join(__dirname, 'uploads', filename);

      if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
        fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
      }

      fs.writeFileSync(uploadPath, base64Data, 'base64');
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
    } else if (req.files && req.files.length > 0) {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.files[0].filename}`;
    } else if (image) {
      imageUrl = image;
    }

    let finalLocationName = placeName || locationName;
    let finalLatitude = latitude ? Number(latitude) : null;
    let finalLongitude = longitude ? Number(longitude) : null;

    if ((!finalLocationName || finalLocationName === '알 수 없는 장소') && placeId && placeId !== 'undefined' && !isNaN(placeId)) {
      const [spotRows] = await pool.query(
        "SELECT place_name, latitude, longitude FROM spots WHERE id = ?", 
        [Number(placeId)]
      );
      if (spotRows && spotRows.length > 0) {
        finalLocationName = spotRows[0].place_name;
        finalLatitude = spotRows[0].latitude ? Number(spotRows[0].latitude) : finalLatitude;
        finalLongitude = spotRows[0].longitude ? Number(spotRows[0].longitude) : finalLongitude;
      }
    }

    if (!finalLocationName) finalLocationName = '알 수 없는 장소';

    const [result] = await pool.query(
      `INSERT INTO posts
        (user_email, nickname, content, location_name, latitude, longitude, photo_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userEmail || null,
        nickname || '익명',
        content || '',
        finalLocationName,
        finalLatitude,
        finalLongitude,
        imageUrl
      ]
    );

    // 피드 등록과 동시에 방문 기록 저장
    const numericPlaceId = Number(placeId);
    if (numericPlaceId && !isNaN(numericPlaceId) && userEmail && userEmail !== 'null') {
      try {
        const [userExists] = await pool.query('SELECT id FROM users WHERE email = ?', [userEmail]);
        if (userExists.length > 0) {
          await pool.query(
            'INSERT INTO visit_history (user_email, spot_id, visit_date, created_at) VALUES (?, ?, CURDATE(), NOW())',
            [userEmail, numericPlaceId]
          );
          console.log(`[방문 기록 자동 저장] 유저: ${userEmail}, 장소 ID: ${numericPlaceId}`);
        }
      } catch (visitErr) {
        console.log('⚠️ 방문 기록 저장 실패 (피드는 정상 등록):', visitErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "리뷰 등록 성공!",
      id: result.insertId,
      image: imageUrl
    });
  } catch (error) {
    console.error("❌ [POST /feeds] 치명적 서버 에러:", error);
    return res.status(500).json({ success: false, message: "서버 에러가 발생했습니다." });
  }
});

// 피드 수정
app.put('/feeds/:id', async (req, res) => {
  const { id } = req.params;
  const { content, userEmail } = req.body;
  try {
    const [result] = await pool.query(
      'UPDATE posts SET content = ? WHERE id = ?',
      [content, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '수정할 피드를 찾을 수 없습니다.' });
    }
    return res.status(200).json({ success: true, message: '피드가 수정되었습니다.' });
  } catch (error) {
    console.error('❌ [PUT /feeds] DB 에러:', error);
    return res.status(500).json({ success: false, message: '서버 에러' });
  }
});

// 피드 삭제
app.delete('/feeds/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM posts WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '삭제할 피드를 찾을 수 없습니다.' });
    }
    return res.status(200).json({ success: true, message: '피드가 삭제되었습니다.' });
  } catch (error) {
    console.error('❌ [DELETE /feeds] DB 에러:', error);
    return res.status(500).json({ success: false, message: '서버 에러' });
  }
});


// ==========================================
// 5. 서버 가동 및 IP 터미널 출력
// ==========================================
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