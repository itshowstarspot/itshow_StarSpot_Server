const db = require('../config/db');
const bcrypt = require('bcrypt');

// 1. 회원가입
exports.signup = async (req, res) => {
    const { email, password, nickname, favorite_idol } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (email, password, nickname, favorite_idol) VALUES (?, ?, ?, ?)';
        await db.execute(sql, [email, hashedPassword, nickname, favorite_idol || null]);
        res.status(201).json({ success: true, message: "회원가입 성공!" });
    } catch (err) {
        console.error("회원가입 에러:", err);
        res.status(500).json({ success: false, message: "회원가입 실패: " + err.message });
    }
};

// 2. 로그인
exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) return res.status(400).json({ success: false, message: "유저를 찾을 수 없습니다." });

        const isMatch = await bcrypt.compare(password, rows[0].password);
        if (!isMatch) return res.status(400).json({ success: false, message: "비밀번호가 틀렸습니다." });

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
        console.error("로그인 에러:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 3. 유저 프로필 조회
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

// 4. 최애 아이돌 수정
exports.updateFavoriteIdol = async (req, res) => {
    const { email, favorite_idol } = req.body;
    try {
        await db.execute('UPDATE users SET favorite_idol = ? WHERE email = ?', [favorite_idol, email]);
        res.json({ success: true, message: "최애 아이돌이 업데이트되었습니다!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 5. 게시글 수정
exports.updatePost = async (req, res) => {
    const { id } = req.params;
    const { content, title, userEmail } = req.body; 

    try {
        const sql = 'UPDATE posts SET content = ?, title = ? WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(sql, [content, title || '', id, userEmail]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: "수정 권한이 없거나 해당 게시글이 없습니다." });
        }
        res.json({ success: true, message: "본인 확인 완료! 수정되었습니다." });
    } catch (err) {
        console.error("게시글 수정 중 서버 에러:", err);
        res.status(500).json({ error: err.message });
    }
};

// 6. 게시글 삭제
exports.deletePost = async (req, res) => {
    const { id } = req.params;
    const { userEmail } = req.body; 

    try {
        const sql = 'DELETE FROM posts WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(sql, [id, userEmail]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: "삭제 권한이 없거나 해당 게시글이 없습니다." });
        }
        res.json({ success: true, message: "본인 확인 완료! 삭제되었습니다." });
    } catch (err) {
        console.error("게시글 삭제 중 서버 에러:", err);
        res.status(500).json({ error: err.message });
    }
};

// 7. 즐겨찾기 목록 조회
exports.getUserFavorites = async (req, res) => {
    const userEmail = req.query.userEmail || req.query.email;

    if (!userEmail) {
        return res.status(200).json([]); 
    }

    try {
        // 💡 VARCHAR(50)로 바뀐 spot_id 체계에 맞춰서 spots 테이블과 매칭되도록 설계되었습니다.
        const sql = `
            SELECT s.*, true AS isFavorite
            FROM favorites f
            JOIN spots s ON f.spot_id = s.id
            WHERE f.user_email = ?
        `;
        const [rows] = await db.execute(sql, [userEmail]);
        res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error("즐겨찾기 조회 중 DB 에러:", err);
        res.status(200).json([]); 
    }
};

// 8. 즐겨찾기 추가
exports.addUserFavorite = async (req, res) => {
    const { userEmail, spotId } = req.body;

    if (!userEmail || !spotId) {
        return res.status(400).json({ success: false, message: '유저 이메일과 장소 ID는 필수입니다.' });
    }

    try {
        const sql = `INSERT INTO favorites (user_email, spot_id, created_at) VALUES (?, ?, NOW())`;
        await db.execute(sql, [userEmail, spotId]);
        res.status(201).json({ success: true, message: '즐겨찾기에 추가되었습니다. ⭐' });
    } catch (err) {
        console.error('즐겨찾기 추가 중 DB 에러:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 9. 즐겨찾기 삭제
exports.deleteUserFavorite = async (req, res) => {
    const { userEmail, spotId } = req.body;

    if (!userEmail || !spotId) {
        return res.status(400).json({ success: false, message: '유저 이메일과 장소 ID는 필수입니다.' });
    }

    try {
        const sql = `DELETE FROM favorites WHERE user_email = ? AND spot_id = ?`;
        const [result] = await db.execute(sql, [userEmail, spotId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '삭제할 즐겨찾기 내역이 없습니다.' });
        }
        res.status(200).json({ success: true, message: '즐겨찾기에서 삭제되었습니다. 🤍' });
    } catch (err) {
        console.error('즐겨찾기 삭제 중 DB 에러:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/* ── 코스 관련 로직 ── */

// 10. 코스 목록 조회
exports.getCourses = async (req, res) => {
    const idolId = req.query.idolId || 'leeyoungji';
    
    try {
        const sql = 'SELECT id, title, user_email AS userEmail, created_at FROM courses WHERE idol_id = ? ORDER BY created_at DESC';
        const [courses] = await db.execute(sql, [idolId]);

        for (let course of courses) {
            const spotSql = `
                SELECT s.id, s.place_name AS placeName, s.address 
                FROM course_spots cs
                JOIN spots s ON cs.spot_id = s.id
                WHERE cs.course_id = ?
                ORDER BY cs.sequence ASC
            `;
            const [spots] = await db.execute(spotSql, [course.id]);
            course.places = spots; 
        }

        res.status(200).json({ success: true, data: courses });
    } catch (err) {
        console.error("❌ 코스 목록 조회 중 서버 에러:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 11. 코스 등록
exports.createCourse = async (req, res) => {
    const { title, spotIds, selectedPlaces, idolId, userEmail } = req.body;

    let finalSpotIds = spotIds;
    if (selectedPlaces && Array.isArray(selectedPlaces)) {
        finalSpotIds = selectedPlaces.map(place => place.id || place.spot_id);
    }

    const finalIdolId = idolId || 'leeyoungji';

    if (!title || !finalSpotIds || finalSpotIds.length < 2 || !userEmail) {
        return res.status(400).json({ success: false, message: "데이터 누락 또는 장소 부족" });
    }

    try {
        const courseSql = 'INSERT INTO courses (title, user_email, idol_id, created_at) VALUES (?, ?, ?, NOW())';
        const [courseResult] = await db.execute(courseSql, [title, userEmail, finalIdolId]);
        const newCourseId = courseResult.insertId;

        const mappingSql = 'INSERT INTO course_spots (course_id, spot_id, sequence) VALUES (?, ?, ?)';
        for (let i = 0; i < finalSpotIds.length; i++) {
            await db.execute(mappingSql, [newCourseId, finalSpotIds[i], i + 1]);
        }

        res.status(201).json({ success: true, message: "코스가 성공적으로 등록되었습니다.", courseId: newCourseId });
    } catch (err) {
        console.error("❌ 코스 생성 중 DB 에러:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 12. 코스 삭제
exports.deleteCourse = async (req, res) => {
    const { id } = req.params;
    const userEmail = req.body.userEmail || req.query.userEmail;

    if (!userEmail) {
        return res.status(400).json({ success: false, message: "이메일 정보가 누락되었습니다." });
    }

    try {
        const deleteCourseSql = 'DELETE FROM courses WHERE id = ? AND user_email = ?';
        const [result] = await db.execute(deleteCourseSql, [id, userEmail]);

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: "삭제 권한이 없거나 없는 코스입니다." });
        }

        await db.execute('DELETE FROM course_spots WHERE course_id = ?', [id]);
        res.status(200).json({ success: true, message: "코스가 삭제되었습니다." });
    } catch (err) {
        console.error("❌ 코스 삭제 에러:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

/* ── 🌟 [새로 추가됨] 방문 기록(Visit History) 관련 핵심 로직 ── */

// 13. 사용자의 방문 기록 목록 조회 (GET /api/users/visit-history/:email)
exports.getVisitHistory = async (req, res) => {
    const { email } = req.params;

    try {
        // 💡 spot_id가 VARCHAR(50) 문자열이므로, spots.id 문자열과 일대일로 정확하게 JOIN 결합합니다.
        const sql = `
            SELECT 
                v.id,
                v.user_email,
                v.spot_id,
                DATE_FORMAT(v.visit_date, '%Y-%m-%d %H:%i:%s') AS date,
                v.place_name,
                s.member_name
            FROM visit_history v
            LEFT JOIN spots s ON v.spot_id = s.id
            WHERE v.user_email = ?
            ORDER BY v.visit_date DESC
        `;
        const [rows] = await db.execute(sql, [email]);
        res.status(200).json(Array.isArray(rows) ? rows : []);
    } catch (err) {
        console.error("❌ 방문 기록 조회 중 DB 서버 에러:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 14. 신규 방문 기록 등록 (POST /api/users/visit-history)
exports.createVisitHistory = async (req, res) => {
    const { email, spot_id, place_name, member_name, date } = req.body;

    if (!email || !spot_id || !place_name) {
        return res.status(400).json({ success: false, message: "필수 데이터(이메일, 장소 고유코드, 장소명)가 누락되었습니다." });
    }

    try {
        // 💡 프론트엔드가 보낸 'bjm-1' 같은 문자열형 고유 키를 spot_id 컬럼에 그대로 적재합니다.
        const sql = `
            INSERT INTO visit_history (user_email, spot_id, place_name, visit_date, created_at) 
            VALUES (?, ?, ?, ?, NOW())
        `;
        await db.execute(sql, [email, spot_id, place_name, date || new Date()]);
        res.status(201).json({ success: true, message: "성지순례 방문 인증 기록이 성공적으로 보존되었습니다! 🎉" });
    } catch (err) {
        console.error("❌ 방문 기록 생성 중 DB 서버 에러:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};