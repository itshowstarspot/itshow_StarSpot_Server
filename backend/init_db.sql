-- ==========================================
-- 1. 데이터베이스 생성 및 선택
-- ==========================================
CREATE DATABASE IF NOT EXISTS star_spot DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE star_spot;


-- ==========================================
-- 2. 기본 마스터 테이블 생성 (회원, 장소)
-- ==========================================

-- [유저 테이블]
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    favorite_idol VARCHAR(50) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [장소 정보 테이블]
CREATE TABLE IF NOT EXISTS spots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_name VARCHAR(50) NOT NULL,
    member_name VARCHAR(50) DEFAULT NULL,
    place_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    description TEXT,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(11, 7) NOT NULL,
    operating_hours VARCHAR(150),
    holiday VARCHAR(50),
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 3. 회원 및 장소 기반 하위 매핑 테이블 생성
-- ==========================================

-- [장소 즐겨찾기 테이블]
CREATE TABLE IF NOT EXISTS favorites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    spot_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_spot (user_email, spot_id)
);

-- [나만의 코스 마스터 테이블]
CREATE TABLE IF NOT EXISTS courses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    idol_id VARCHAR(100) NOT NULL DEFAULT 'default',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);

-- [나만의 코스 상세 장소 매핑 테이블]
CREATE TABLE IF NOT EXISTS course_spots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    spot_id INT NOT NULL,
    sequence_order INT NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
);

-- [방문 완료 기록 테이블]
CREATE TABLE IF NOT EXISTS visit_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    spot_id INT NOT NULL,
    visit_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE,
    FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
);

-- [성지순례 후기/피드 테이블]
CREATE TABLE IF NOT EXISTS posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255),
    nickname VARCHAR(50),
    idol_name VARCHAR(50),
    content TEXT,
    location_name VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    photo_path LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE
);


-- ==========================================
-- 4. 시스템 추천 코스 관련 테이블 생성
-- ==========================================

-- [추천 코스 마스터 테이블]
CREATE TABLE IF NOT EXISTS recommended_courses (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    idol_id VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- [추천 코스 상세 장소 매핑 테이블]
CREATE TABLE IF NOT EXISTS recommended_course_spots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recommended_course_id VARCHAR(50),
    spot_id INT,
    sequence_order INT NOT NULL,
    FOREIGN KEY (recommended_course_id) REFERENCES recommended_courses(id) ON DELETE CASCADE,
    FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE CASCADE
);


-- ==========================================
-- 5. 초기 데이터 삽입
-- ==========================================

-- [테스트 유저 데이터]
INSERT IGNORE INTO users (email, password, nickname, favorite_idol) VALUES
('test1@test.com', '1234', '민지맘', '뉴진스'),
('test2@test.com', '1234', '호시팬', '세븐틴'),
('test3@test.com', '1234', '윈터러버', '에스파'),
('test15@gmail.com', '1234', '정국이팬', '방탄소년단');

-- [장소(spots) 초기 데이터 20개]
INSERT IGNORE INTO `spots`
(`id`, `group_name`, `member_name`, `place_name`, `category`, `description`, `operating_hours`, `holiday`, `address`, `latitude`, `longitude`, `image_url`)
VALUES
-- BTS 정국 (1~4)
(1, '방탄소년단', '정국', '우돈청', 'restaurant', '정국이 구칠즈 멤버들과 함께 식사한 곳', '매일 16시 - (익일) 01시', '정보없음', '서울특별시 강남구 언주로 170길 37', 37.5266100, 127.0367000, 'https://i.postimg.cc/g00mQhZL/jungkook1.png'),
(2, '방탄소년단', '정국', '꽃새우 영번지 역삼점', 'restaurant', '정국이 왔다간 해산물요리 전문점', '매일 15시 - 24시', '연중무휴', '서울특별시 강남구 언주로 536', 37.5061900, 127.0413000, 'https://i.postimg.cc/PqqT9Dwp/jungkook2.png'),
(3, '방탄소년단', '정국', '개미마을', 'playground', 'LOVE YOURSELF 정국 포스터 촬영지', '매일 00시 - 24시', '연중무휴', '서울특별시 서대문구 세검정로4길 100-58', 37.5902200, 126.9533000, 'https://i.postimg.cc/wBBgZNmL/jungkook3.png'),
(4, '방탄소년단', '정국', '함경도찹쌀순대', 'restaurant', '진과 정국이 방문한 순대국 맛집', '매일 00시 - 24시', '연중무휴', '서울특별시 송파구 송파대로28길 32', 37.4946700, 127.1214000, 'https://i.postimg.cc/GppdVDyP/jungkook4.png'),
-- 이즈나 방지민 (5~7)
(5, 'Izna', '방지민', '자연도소금빵 성수점', 'cafe', '추석 연휴에 소금빵을 웨이팅하던 지민 목격', '매일 09시 - 22시', '연중무휴', '서울특별시 성동구 연무장길 56-1', 37.5423020, 127.0554580, 'https://i.postimg.cc/NjDQdD51/jimin1.png'),
(6, 'Izna', '방지민', '서울만남의광장휴게소', 'playground', '사랑이의 소원권으로 에버랜드에 가기 전 집합 장소', '매일 6시 반 - 20시 반', '연중무휴', '서울특별시 서초구 양재대로 12길 73-71', 37.4596450, 127.0426250, 'https://i.postimg.cc/nLLpgmDD/jimin2.png'),
(7, 'Izna', '방지민', '마망젤라또 성수점', 'cafe', '리센느 인스타에 올라온 두바이쫀득젤라또를 먹는 지민', '매일 11시 반 - 21시', '연중무휴', '서울특별시 성동구 연무장9길 8 1층', 37.5429360, 127.0559780, 'https://i.postimg.cc/mrrBJ9Hm/jimin3.png'),
-- 에스파 카리나 (8~10)
(8, 'aespa', '카리나', '실비옥', 'restaurant', '지젤과 카리나가 방문한 식당', '매일 11시 - 22시 40분', '연중무휴', '서울특별시 성동구 아차산로 126', 37.5434990, 127.0580540, 'https://i.postimg.cc/zff86hg0/karina1.png'),
(9, 'aespa', '카리나', '롯데월드 어드벤처', 'playground', '원터와 카리나가 간 놀이공원', '매일 12시 - 22시', '연중무휴', '서울특별시 송파구 올림픽로 240', 37.5111310, 127.0981200, 'https://i.postimg.cc/3wbYTwXL/karina2.png'),
(10, 'aespa', '카리나', '오잇 oeat', 'cafe', '카카리나와 지젤이 방문한 크로플 전문 카페', '매일 11시 - 22시', '연중무휴', '서울특별시 용산구 신흥로 95', 37.5455360, 126.9850910, 'https://i.postimg.cc/SKKk3990/karina3.png'),
-- 데이식스 영케이 (11~13)
(11, 'DAY6', '영케이', '추암해수욕장', 'playground', '완전체로 KBS 예능 프로그램 1박 2일 출연 촬영지', '매일 00시 - 24시', '연중무휴', '강원특별자치도 동해시 추암동 474-20', 37.4778290, 129.1595110, 'https://i.postimg.cc/W4fTv4GH/youngk1.png'),
(12, 'DAY6', '영케이', '캐리비안베이', 'playground', '워크맨 81화 캐리비안베이 알바 촬영', '매일 11시 - 22시', '연중무휴', '경기도 용인시 처인구 포곡읍 에버랜드로 199', 37.2971090, 127.2009880, 'https://i.postimg.cc/43Fsg3vk/youngk2.png'),
(13, 'DAY6', '영케이', '빨간떡', 'restaurant', '영케이의 개인 채널인 YBC에서 소개한 떡볶이 집', '매일 10시 - 20시', '연중무휴', '서울특별시 구로구 도림로20길', 37.4884540, 126.8935270, 'https://i.postimg.cc/KYsx2YP6/youngk3.png'),
-- 이영지 (14~16)
(14, '이영지', NULL, '대박곱창 본점', 'restaurant', '이영지의 야곱 성지 2등 픽', '매일 00시 - 24시', '연중무휴', '서울특별시 양천구 오목로 170 1층', 37.5248450, 126.8561770, 'https://i.postimg.cc/xddnhmzw/youngji1.png'),
(15, '이영지', NULL, '울타리곱창', 'restaurant', '이영지 또간집 1등 야채곱창', '매일 11시 - 22시', '연중무휴', '서울 중랑구 중화동 298-21', 37.5959310, 127.0763430, 'https://i.postimg.cc/mr6BsrYm/youngji2.png'),
(16, '이영지', NULL, '불멸의 쭈꾸미', 'restaurant', '집 계약을 연장하게 만든 쭈꾸미 맛집', '매일 11시 - 23시', '매주 월요일', '서울 양천구 목동동로 63 대영프라자 지하1층 112호', 37.5153170, 126.8623110, 'https://i.postimg.cc/25XrD5Qc/youngji3.png'),
-- NCT 재현 (17~20)
(17, 'NCT', '재현', '볼링볼링', 'playground', '190205 채널NCT 재현의 볼링 연습 장소', '매일 00시 - 24시', '연중무휴', '서울특별시 중구 청계천로 400 롯데캐슬베네치아 메가몰동 지하1층', 37.5707700, 127.0198000, 'https://i.postimg.cc/fLQbSLP1/jaehyun1.png'),
(18, 'NCT', '재현', '도쿄수플레', 'cafe', '태용이와 재현만의 수플레를 만든 곳', '매일 11시 - 22시', '연중무휴', '서울특별시 강남구 압구정로10길 35 1층', 37.5212800, 127.0222000, 'https://i.postimg.cc/0Q1NKQ3q/jaehyun2.png'),
(19, 'NCT', '재현', '커피탐이나', 'cafe', 'JCC에서 쟈니와 재현이 바리스타 체험을 한 카페', '매일 11시 - 22시', '명절(당일)', '서울특별시 마포구 잔다리로3안길 31', 37.5501700, 126.9194000, 'https://i.postimg.cc/vBwmxBjM/jaehyun3.png'),
(20, 'NCT', '재현', '잠수교', 'playground', 'NCT127 Hello! #SEOUL 포토북 장소', '매일 00시 - 24시', '연중무휴', '서울특별시 서초구 반포동', 37.5146600, 126.9964000, 'https://i.postimg.cc/zBYfHBMr/jaehyun4.png');


-- ==========================================
-- 6. 추천 코스 및 장소 매핑 초기 데이터
-- ==========================================

INSERT IGNORE INTO recommended_courses (id, title, idol_id, description, created_at) VALUES
('rec-jk-1', '정국 강남 맛집 투어', 'jungkook', '정국이 멤버들과 자주 찾던 강남 식당들을 따라가보세요', '2026-01-01 00:00:00'),
('rec-jk-2', '정국 이태원 코스', 'jungkook', '이태원에서 정국의 발자취를 따라가보세요', '2026-01-02 00:00:00');

INSERT IGNORE INTO recommended_course_spots (recommended_course_id, spot_id, sequence_order) VALUES
('rec-jk-1', 1, 1),
('rec-jk-1', 2, 2),
('rec-jk-1', 3, 3),
('rec-jk-2', 1, 1),
('rec-jk-2', 2, 2);


-- ==========================================
-- 7. 테스트용 활동 이력/피드 데이터
-- ==========================================

INSERT IGNORE INTO posts (user_email, nickname, idol_name, content, location_name, latitude, longitude, photo_path) VALUES
('test1@test.com', '민지맘', '뉴진스', '하이브 사옥 앞 전광판 인증샷!', '하이브', 37.5233000, 126.9655000, '/uploads/sample1.jpg'),
('test2@test.com', '호시팬', '세븐틴', '여기 세븐틴 응원봉 들고 오기 딱 좋아요!', '광화문 광장', 37.5759000, 126.9768000, '/uploads/sample2.jpg'),
('test3@test.com', '윈터러버', '에스파', '윈터가 왔던 카페 드디어 방문!', '성수동 카페', 37.5445000, 127.0560000, '/uploads/sample3.jpg');

INSERT IGNORE INTO visit_history (user_email, spot_id, visit_date, created_at)
VALUES ('test15@gmail.com', 14, CURDATE(), NOW());
