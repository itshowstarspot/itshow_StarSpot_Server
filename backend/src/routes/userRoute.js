const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const multer = require('multer');
const path = require('path');

// 1. 사진 저장 설정 (multer)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // 사진이 저장될 폴더
    },
    filename: function (req, file, cb) {
        // 파일 이름이 겹치지 않게 날짜를 붙여서 저장
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// 2. 회원가입 & 로그인
router.post('/signup', userController.signup); 
router.post('/login', userController.login);

// 3. 유저 정보 조회 (프로필)
router.get('/profile/:email', userController.getUserProfile);

// 4. 최애 아이돌 수정
router.patch('/update-idol', userController.updateFavoriteIdol);

// 5. 지도 성지순례 후기 등록 & 조회
// ★ 중요: upload.single('photo')가 반드시 들어가야 req.body를 읽을 수 있어!
router.post('/posts', upload.single('photo'), userController.createPost); 
router.get('/posts', userController.getAllPosts);

module.exports = router;