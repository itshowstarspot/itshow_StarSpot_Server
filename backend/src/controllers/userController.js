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
// 2. 로그인 (최애 아이돌 데이터 누락 버그 수정 완결본)
exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ message: "유저를 찾을 수 없습니다." });

        const isMatch = await bcrypt.compare(password, rows[0].password);
        if (!isMatch) return res.status(400).json({ message: "비밀번호가 틀렸습니다." });

        // 🌟 [핵심 수정] 로그인 성공 시 DB에 저장되어 있던 favorite_idol 정보도 반드시 프론트에 함께 내려줍니다.
        res.json({ 
            success: true, 
            message: "로그인 성공!", 
            user: { 
                email: rows[0].email, 
                nickname: rows[0].nickname,
                favorite_idol: rows[0].favorite_idol // 👈 이 한 줄이 없어서 모달이 뚫렸던 것입니다!
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. 지도 성지순례 후기 등록
exports.createPost = async (req, res) => {
    const { user_email, nickname, content, location_name, latitude, longitude, idol_name } = req.body;
    
    // multer로 업로드된 파일의 경로
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

// 4. 지도 데이터 조회 (필터링 기능 포함)
// GET /api/users/posts 또는 /api/users/posts?idol=뉴진스
// 아이돌 필터 + 이메일 필터 둘 다 가능하게!
exports.getPosts = async (req, res) => {
    const { idol, email } = req.query; // 이제 email도 쿼리에서 받아와
    
    try {
        let sql = 'SELECT * FROM posts WHERE 1=1'; // 조건 추가를 쉽게 하기 위한 트릭
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

// [보안 강화] 게시글 수정
exports.updatePost = async (req, res) => {
    const { id } = req.params;
    const { content, location_name, user_email } = req.body; // 수정 요청 시 본인 이메일도 받아옴

    try {
        // id가 맞고, 작성자 이메일도 맞아야만 업데이트 실행!
        const sql = 'UPDATE posts SET content = ?, location_name = ? WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(sql, [content, location_name, id, user_email]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "수정 권한이 없거나 해당 게시글이 없습니다." 
            });
        }
        res.json({ success: true, message: "본인 확인 완료! 수정되었습니다." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// [보안 강화] 게시글 삭제
exports.deletePost = async (req, res) => {
    const { id } = req.params;
    const { user_email } = req.body; // 삭제 요청 시 본인 이메일도 받아옴

    try {
        // id와 작성자 이메일이 모두 일치해야 삭제!
        const sql = 'DELETE FROM posts WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(sql, [id, user_email]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ 
                success: false, 
                message: "삭제 권한이 없거나 해당 게시글이 없습니다." 
            });
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