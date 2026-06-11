const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const db = require('../config/db'); 
const multer = require('multer');
const path = require('path');

// ==========================================
// 1. 사진 저장 설정 (multer)
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ==========================================
// 2. 임시 데이터 (테스트용 장소 데이터)
// ==========================================
const mockPlaces = [
    {
        id: "1",
        name: "카리나 추천 맛집 (성지순례)",
        address: "서울시 관악구 신림동",
        idolId: "karina", 
        category: "음식점",
        lat: 37.476,
        lng: 126.930,
        description: "성지순례 필수 코스! 맛있는 곳입니다."
    }
];

// ==========================================
// 3. API 라우터 설정
// ==========================================

// [회원가입 & 로그인]
router.post('/signup', userController.signup); 
router.post('/login', userController.login);

// [유저 정보 조회 (프로필)]
router.get('/profile/:email', userController.getUserProfile);

// [최애 아이돌 수정]
router.patch('/update-idol', userController.updateFavoriteIdol);

// [지도 성지순례 후기 등록 & 방문 기록 자동 추가]
router.post('/posts', upload.single('photo'), async (req, res) => {
    const { userEmail, spotId, title, content } = req.body; 
    const photo = req.file ? `/uploads/${req.file.filename}` : null;

    if (!userEmail || !spotId) {
        return res.status(400).json({ message: '유저 이메일과 장소 ID(spotId)는 필수 항목입니다.' });
    }

    try {
        const postQuery = `
            INSERT INTO posts (user_email, spot_id, title, content, photo_url, created_at) 
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        await db.execute(postQuery, [userEmail, spotId, title || '', content || '', photo]);

        const visitQuery = `
            INSERT INTO visit_history (user_email, spot_id, visit_date, created_at) 
            VALUES (?, ?, NOW(), NOW())
        `;
        await db.execute(visitQuery, [userEmail, spotId]);

        res.status(201).json({ message: '후기 등록 및 방문 인증이 완료되었습니다! ✨' });
    } catch (err) {
        console.error('DB 에러 발생:', err);
        res.status(500).json({ message: '등록 처리 중 서버 오류가 발생했습니다.' });
    }
});

// [★수정★ 팬 피드 전체 혹은 유저별 격리 조회]
router.get('/posts', async (req, res) => {
    // 프론트엔드가 보낸 유저 이메일 수급 (?userEmail=값 또는 ?email=값)
    const userEmail = req.query.userEmail || req.query.email; 

    try {
        let query = `
            SELECT 
                p.id, p.user_email, p.spot_id, p.title, p.content, p.photo_url,
                DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i') AS date,
                s.place_name, s.member_name
            FROM posts p
            LEFT JOIN spots s ON p.spot_id = s.id
        `;
        const params = [];

        // 🌟 유저 이메일이 파라미터로 명확히 들어왔을 때만 해당 유저 글만 필터링!
        if (userEmail) {
            query += ` WHERE p.user_email = ?`;
            params.push(userEmail);
        }

        query += ` ORDER BY p.created_at DESC`;

        const [rows] = await db.execute(query, params);
        res.status(200).json(rows);
    } catch (err) {
        console.error('피드 목록 조회 중 DB 에러 발생:', err);
        res.status(500).json({ message: '피드를 불러오는 중 오류가 발생했습니다.' });
    }
});

// [게시글 수정 & 삭제]
router.patch('/posts/:id', userController.updatePost);
router.delete('/posts/:id', userController.deletePost);

// ────────────────────────────────────────────────────────
// 🌟 [연동 완료] 유저 계정별 즐겨찾기(Favorites) 조회 API 연동
// ────────────────────────────────────────────────────────
// [게시글 수정 & 삭제]
router.patch('/posts/:id', userController.updatePost);
router.delete('/posts/:id', userController.deletePost);

// ────────────────────────────────────────────────────────
// 🌟 유저 계정별 즐겨찾기(Favorites) 연동 API 구역
// ────────────────────────────────────────────────────────
router.get('/favorites', userController.getUserFavorites);     // 👈 기존에 추가한 조회 API

// 🔴 [이것들을 새로 추가하세요!] 토글(추가/삭제)에 대응하는 라우터 설정
router.post('/favorites', userController.addUserFavorite);     // ✨ 추가 (POST)
router.delete('/favorites', userController.deleteUserFavorite);  // ✨ 삭제 (DELETE)


// [장소 관련 API]
router.get('/places', (req, res) => { /* ... */ });

// [방문 기록 조회] 특정 유저(이메일)의 성지순례 방문 리스트 가져오기
router.get('/visit-history/:userEmail', async (req, res) => {
    const { userEmail } = req.params;
    const query = `
        SELECT 
            vh.id,
            vh.spot_id AS place_id,
            IFNULL(s.place_name, '확인되지 않은 성지 장소') AS place_name,
            IFNULL(s.member_name, '') AS member_name,
            DATE_FORMAT(COALESCE(vh.visit_date, vh.created_at), '%Y-%m-%d %H:%i') AS date
        FROM visit_history vh
        LEFT JOIN spots s ON vh.spot_id = s.id
        WHERE vh.user_email = ?
        ORDER BY COALESCE(vh.visit_date, vh.created_at) DESC
    `;
    try {
        const [rows] = await db.execute(query, [userEmail]);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ message: '방문 기록을 불러오는 중 오류가 발생했습니다.' });
    }
});

// [방문 인증 등록]
router.post('/visit-history', async (req, res) => {
    const { userEmail, spotId, visitDate } = req.body;
    if (!userEmail || !spotId) return res.status(400).json({ message: '필수 항목 누락' });

    const query = `INSERT INTO visit_history (user_email, spot_id, visit_date, created_at) VALUES (?, ?, COALESCE(?, NOW()), NOW())`;
    try {
        await db.execute(query, [userEmail, spotId, visitDate || null]);
        res.status(201).json({ message: '성지순례 방문 인증 성공! 🎒' });
    } catch (err) {
        res.status(500).json({ message: '오류 발생' });
    }
});

module.exports = router;