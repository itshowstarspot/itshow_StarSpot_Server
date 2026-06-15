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
// 2. API 라우터 설정
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

        // 💡 후기를 등록할 때도 VARCHAR 고유 코드가 들어갈 수 있도록 바인딩합니다.
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

// [팬 피드 전체 혹은 유저별 격리 조회]
router.get('/posts', async (req, res) => {
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

// [게시글 수정 & 삭제 - 컨트롤러와 1:1 단독 연결]
router.patch('/posts/:id', userController.updatePost);
router.delete('/posts/:id', userController.deletePost);

// [유저 계정별 즐겨찾기(Favorites) 연동 API 구역]
router.get('/favorites', userController.getUserFavorites); 
router.post('/favorites', userController.addUserFavorite); 
router.delete('/favorites', userController.deleteUserFavorite);


/* ── 🌟 [대대적 공사 완료] 방문 기록 구역 ── */

// 🎯 [방문 기록 조회] 이제 라우터에서 직접 쿼리를 실행하지 않고, 완벽하게 검증된 컨트롤러 함수로 직접 토스합니다!
router.get('/visit-history/:email', userController.getVisitHistory);

// 🎯 [방문 인증 등록] 마찬가지로 일관성 유지를 위해 컨트롤러 함수로 매핑을 통일시킵니다.
router.post('/visit-history', userController.createVisitHistory);

module.exports = router;