const db = require('../config/db');
const bcrypt = require('bcrypt');

// 1. 회원가입
exports.signup = async (req, res) => {
    const { email, password, nickname, favorite_idol } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (email, password, nickname, favorite_idol) VALUES (?, ?, ?, ?)';
        await db.execute(sql, [email, hashedPassword, nickname, favorite_idol]);
        res.status(201).json({ success: true, message: "회원가입 성공!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "회원가입 실패: " + err.message });
    }
};

// 2. 로그인
exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ message: "유저를 찾을 수 없습니다." });

        const isMatch = await bcrypt.compare(password, rows[0].password);
        if (!isMatch) return res.status(400).json({ message: "비밀번호가 틀렸습니다." });

        res.json({ 
            success: true, 
            message: "로그인 성공!", 
            user: { 
                email: rows[0].email, 
                nickname: rows[0].nickname,
                favorite_idol: rows[0].favorite_idol 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. 지도 성지순례 후기 등록
exports.createPost = async (req, res) => {
    const { user_email, nickname, content, location_name, latitude, longitude, idol_name } = req.body;
    const photo_path = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const sql = `
            INSERT INTO posts (user_email, nickname, content, location_name, latitude, longitude, photo_path, idol_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(sql, [user_email, nickname, content, location_name, latitude, longitude, photo_path, idol_name]);
        res.status(201).json({ success: true, message: "성지순례 지도가 업데이트되었습니다!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "등록 실패: " + err.message });
    }
};

// 4. 지도 데이터 조회
exports.getPosts = async (req, res) => {
    const { idol, email } = req.query; 
    
    try {
        let sql = 'SELECT * FROM posts WHERE 1=1'; 
        let params = [];

        if (idol) {
            sql += ' AND idol_name = ?';
            params.push(idol);
        }
        if (email) {
            sql += ' AND user_email = ?';
            params.push(email);
        }

        sql += ' ORDER BY created_at DESC';
        const [rows] = await db.execute(sql, params);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 게시글 수정
exports.updatePost = async (req, res) => {
    const { id } = req.params;
    const { content, location_name, user_email } = req.body;

    try {
        const sql = 'UPDATE posts SET content = ?, location_name = ? WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(sql, [content, location_name, id, user_email]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: "수정 권한이 없거나 해당 게시글이 없습니다." });
        }
        res.json({ success: true, message: "본인 확인 완료! 수정되었습니다." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 게시글 삭제
exports.deletePost = async (req, res) => {
    const { id } = req.params;
    const { user_email } = req.body;

    try {
        const sql = 'DELETE FROM posts WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(sql, [id, user_email]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: "삭제 권한이 없거나 해당 게시글이 없습니다." });
        }
        res.json({ success: true, message: "본인 확인 완료! 삭제되었습니다." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. 유저 프로필 조회
exports.getUserProfile = async (req, res) => {
    const { email } = req.params;
    try {
        const [rows] = await db.execute('SELECT email, nickname, favorite_idol FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 6. 최애 아이돌 수정
exports.updateFavoriteIdol = async (req, res) => {
    const { email, favorite_idol } = req.body;
    try {
        await db.execute('UPDATE users SET favorite_idol = ? WHERE email = ?', [favorite_idol, email]);
        res.json({ success: true, message: "최애 아이돌이 업데이트되었습니다!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 🌟 userController.js 파일 안에서 이 함수를 찾아 완전히 대체하세요!
exports.getUserFavorites = async (req, res) => {
    const userEmail = req.query.userEmail || req.query.email;

    if (!userEmail) {
        // 프론트엔드 map 에러를 방지하기 위해 빈 배열([])을 담아 보냅니다.
        return res.status(400).json([]); 
    }

    try {
        const sql = `
            SELECT s.*, true AS isFavorite
            FROM favorites f
            JOIN spots s ON f.spot_id = s.id
            WHERE f.user_email = ?
        `;
        const [rows] = await db.execute(sql, [userEmail]);
        
        // 🌟 rows가 없거나 배열이 아니면 빈 배열 []을 반환하도록 강제 안심 장치 설정
        res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error("즐겨찾기 조회 중 DB 에러:", err);
        res.status(500).json([]); // 에러 발생 시에도 프론트 붕괴를 막기 위해 빈 배열 반환
    }
};