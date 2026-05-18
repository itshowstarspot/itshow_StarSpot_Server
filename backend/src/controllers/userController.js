const db = require('../config/db');
const bcrypt = require('bcrypt');

// 1. 회원가입 (기존 유지)
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

// 2. 로그인 (기존 유지)
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
            user: { email: rows[0].email, nickname: rows[0].nickname } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. 지도 성지순례 후기 등록 (신규 추가!)
exports.createPost = async (req, res) => {
    const { user_email, nickname, content, location_name, latitude, longitude } = req.body;
    
    // multer로 업로드된 파일의 경로 (프레임 합성 사진)
    const photo_path = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const sql = `
            INSERT INTO posts (user_email, nickname, content, location_name, latitude, longitude, photo_path)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await db.execute(sql, [user_email, nickname, content, location_name, latitude, longitude, photo_path]);
        res.status(201).json({ success: true, message: "성지순례 지도가 업데이트되었습니다!" });
    } catch (err) {
        res.status(500).json({ success: false, message: "등록 실패: " + err.message });
    }
};

// 4. 지도 전체 데이터 조회 (신규 추가!)
exports.getAllPosts = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM posts ORDER BY created_at DESC');
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. 유저 프로필 조회 (추가)
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

// 6. 최애 아이돌 수정 (추가)
exports.updateFavoriteIdol = async (req, res) => {
    const { email, favorite_idol } = req.body;
    try {
        await db.execute('UPDATE users SET favorite_idol = ? WHERE email = ?', [favorite_idol, email]);
        res.json({ success: true, message: "최애 아이돌이 업데이트되었습니다!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};