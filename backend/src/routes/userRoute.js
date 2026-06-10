const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const multer = require('multer');
const path = require('path');

// ==========================================
// 1. 사진 저장 설정 (multer)
// ==========================================
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

// [지도 성지순례 후기 등록 & 조회]
router.post('/posts', upload.single('photo'), userController.createPost); 
router.get('/posts', userController.getPosts);

// [게시글 수정 & 삭제]
router.patch('/posts/:id', userController.updatePost);
router.delete('/posts/:id', userController.deletePost);

// [★연동 해결용★ 장소 관련 API]
// 프론트의 fetchPlacesByIdol 함수가 요청하는 엔드포인트입니다.
router.get('/places', (req, res) => {
    // 프론트에서 idolId 혹은 idId 어떤 것으로 보내든 둘 다 안전하게 받을 수 있도록 처리
    const idolId = req.query.idolId || req.query.idId; 
    
    // 해당 아이돌에 맞는 장소만 필터링
    const filteredPlaces = mockPlaces.filter(p => p.idolId === idolId);
    
    res.json(filteredPlaces);
});

// ==========================================
// 4. 모듈 내보내기 (반드시 파일 맨 최하단에 위치!)
// ==========================================
module.exports = router;