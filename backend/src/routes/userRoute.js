const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// 1. 회원가입 & 로그인
router.post('/signup', userController.signup); 
router.post('/login', userController.login);

// 2. 유저 정보 조회 (프로필)
router.get('/profile/:email', userController.getUserProfile);

// 3. 최애 아이돌 수정
router.patch('/update-idol', userController.updateFavoriteIdol);

// 4. 지도 성지순례 후기 등록 & 조회 (추가된 기능)
// 만약 사진 업로드를 구현한다면 여기에 multer 설정을 추가해야 합니다.
router.post('/posts', userController.createPost); 
router.get('/posts', userController.getAllPosts);

// [중요] 모든 라우트 설정이 끝난 "맨 마지막"에 내보내야 합니다!
module.exports = router;