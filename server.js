const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// 사진 업로드 폴더 설정 (public/uploads)
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

const otpStore = {}; 
// 본인의 웹 앱 URL을 입력하세요.
// process.env를 사용하면 코드를 숨긴 채 외부 서버 설정값에서 주소를 끌어옵니다.
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "로컬_테스트용_앱스크립트_주소입력(선택)";
function initStorage() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    if (!fs.existsSync(CATEGORIES_FILE)) fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(['청소', '도배']));
    if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, JSON.stringify({}));
    
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
}
initStorage();

function readData(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return []; }
}
function writeData(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Multer 설정 (디스크 저장소 지정 및 파일명 규칙 설정)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// [신규] 이미지 파일 업로드 API
app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    }
    // 프론트엔드에서 띄울 수 있는 상대 경로 반환
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl: imageUrl });
});

app.post('/api/request-otp', async (req, res) => {
    const { email } = req.body;
    const usersDB = readData(USERS_FILE);
    if (usersDB.find(u => u.email === email)) return res.json({ success: false, message: '이미 가입된 이메일입니다.' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = otp; 
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ type: 'otp', email, otp })
        });
        const result = await response.json();
        if (result.success) res.json({ success: true, message: '인증번호가 이메일로 발송되었습니다.' });
        else res.json({ success: false, message: '메일 발송 실패' });
    } catch (error) {
        res.json({ success: false, message: '메일 발송 서버에 연결할 수 없습니다.' });
    }
});

app.post('/api/register', (req, res) => {
    const { userId, password, name, email, otp } = req.body;
    if (otpStore[email] !== otp) return res.json({ success: false, message: '인증번호가 일치하지 않거나 만료되었습니다.' });
    
    const usersDB = readData(USERS_FILE);
    if (usersDB.find(u => u.userId === userId)) return res.json({ success: false, message: '이미 존재하는 아이디입니다.' });

    const newUser = {
        id: `usr_${Date.now()}`, userId, password, name, email,
        is_expert: false, region: 'N/A', categories: '', bio: 'N/A', experience: 'N/A',
        applied_at: new Date().toISOString()
    };
    usersDB.push(newUser);
    writeData(USERS_FILE, usersDB);
    delete otpStore[email]; 
    res.json({ success: true, message: '회원가입이 완료되었습니다. 로그인을 진행해 주세요.' });
});

app.post('/api/login', (req, res) => {
    const { userId, password } = req.body;
    const user = readData(USERS_FILE).find(u => u.userId === userId && u.password === password);
    if (!user) return res.json({ success: false, message: '아이디 또는 비밀번호가 일치하지 않습니다.' });
    res.json({ success: true, user, message: '로그인에 성공했습니다.' });
});

app.post('/api/apply', (req, res) => {
    const { userId, region, categories, bio, experience } = req.body;
    const usersDB = readData(USERS_FILE);
    const categoriesDB = readData(CATEGORIES_FILE);

    let categoriesChanged = false;
    categories.forEach(category => {
        if (!categoriesDB.includes(category) && category.trim() !== '') {
            categoriesDB.push(category.trim());
            categoriesChanged = true;
        }
    });
    if (categoriesChanged) writeData(CATEGORIES_FILE, categoriesDB);

    const userIndex = usersDB.findIndex(u => u.userId === userId);
    if (userIndex === -1) return res.json({ success: false, message: '회원 정보를 찾을 수 없습니다.' });

    usersDB[userIndex].is_expert = true;
    usersDB[userIndex].region = region;
    usersDB[userIndex].categories = categories.join(', ');
    usersDB[userIndex].bio = bio || 'N/A';
    usersDB[userIndex].experience = experience || 'N/A';
    usersDB[userIndex].applied_at = new Date().toISOString();

    writeData(USERS_FILE, usersDB);
    res.json({ success: true, message: '전문가 정보가 성공적으로 등록(수정)되었습니다.', user: usersDB[userIndex] });
});

app.get('/api/search-experts', (req, res) => {
    const { region, category, excludeUserId } = req.query;
    const experts = readData(USERS_FILE).filter(u => 
        u.is_expert && 
        u.region === region && 
        u.categories.includes(category) &&
        u.userId !== excludeUserId
    );
    res.json({ success: true, experts });
});

app.get('/api/regions', (req, res) => {
    const regions = [...new Set(readData(USERS_FILE).filter(u => u.is_expert && u.region !== 'N/A').map(u => u.region))];
    res.json({ success: true, regions });
});
app.get('/api/categories', (req, res) => res.json({ success: true, categories: readData(CATEGORIES_FILE) }));

app.post('/api/request-chat', async (req, res) => {
    const { expertId, requesterId } = req.body;
    const usersDB = readData(USERS_FILE);

    const expert = usersDB.find(u => u.id === expertId); 
    const requester = usersDB.find(u => u.userId === requesterId);

    if (!expert || !requester) {
        return res.json({ success: false, message: '사용자 정보를 찾을 수 없습니다.' });
    }

    const chatRoomId = `room_${Date.now()}`;
    const chatLink = `http://localhost:3000/chat.html?room=${chatRoomId}`;

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'chat',
                expertEmail: expert.email,
                expertName: expert.name,
                requesterEmail: requester.email,
                requesterName: requester.name,
                chatLink: chatLink
            })
        });
        
        const result = await response.json();
        if (result.success) {
            res.json({ success: true, message: '채팅 참여 링크가 양측 이메일로 전송되었습니다.' });
        } else {
            res.json({ success: false, message: '이메일 발송에 실패했습니다.' });
        }
    } catch (error) {
        res.json({ success: false, message: '메일 서버 통신 중 오류가 발생했습니다.' });
    }
});

app.get('/api/chats', (req, res) => {
    const { room } = req.query;
    const chatsDB = readData(CHATS_FILE);
    const messages = chatsDB[room] || [];
    res.json({ success: true, messages });
});

// [수정됨] 채팅 메시지 저장 시 type(텍스트/이미지) 구분 추가
app.post('/api/chats', (req, res) => {
    const { room, senderId, senderName, type, message } = req.body;
    const chatsDB = readData(CHATS_FILE);

    if (!chatsDB[room]) {
        chatsDB[room] = [];
    }

    const newMessage = {
        senderId,
        senderName,
        type: type || 'text',
        message,
        timestamp: new Date().toISOString()
    };

    chatsDB[room].push(newMessage);
    writeData(CHATS_FILE, chatsDB);

    res.json({ success: true });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));