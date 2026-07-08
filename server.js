const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

const otpStore = {}; 
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "여기에_웹앱_URL을_붙여넣으세요";

// OpenAI 클라이언트 초기화 (환경 변수에서 키를 가져옴)
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key-to-prevent-crash'
});

function initStorage() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    if (!fs.existsSync(CATEGORIES_FILE)) fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(['청소', '도배', '영어 과외', '수학 과외', '간판', '방충망']));
    if (!fs.existsSync(CHATS_FILE)) fs.writeFileSync(CHATS_FILE, JSON.stringify({}));
    
    // [신규] 더미 데이터 자동 생성 로직
    const usersDB = readData(USERS_FILE);
    if (usersDB.length < 30) {
        const regions = ['서울특별시 강남구', '경기도 군포시', '경기도 수원시', '경기도 안양시'];
        const categories = ['청소', '도배', '영어 과외', '수학 과외', '간판', '방충망'];
        
        for (let i = 1; i <= 30; i++) {
            const newUser = {
                id: `usr_dummy_${i}`,
                userId: `expert${i}`,
                password: '123',
                name: `전문가${i}`,
                email: `dummy${i}@test.com`,
                is_expert: true,
                region: regions[i % regions.length],
                categories: categories[i % categories.length] + ', ' + categories[(i + 1) % categories.length],
                bio: `안녕하세요, ${i}번째 전문가입니다. 성실히 일하겠습니다.`,
                experience: `${i}년`,
                applied_at: new Date().toISOString()
            };
            usersDB.push(newUser);
        }
        writeData(USERS_FILE, usersDB);
        console.log("30명의 테스트 전문가 프로필이 생성되었습니다.");
    }

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

// [신규] AI 데이터 정규화 헬퍼 함수
async function standardizeWithAI(rawRegion, rawCategories, existingCategories) {
    // API 키가 실제로 등록되어 있지 않다면 원본 데이터 반환 (에러 방지)
    if (!process.env.OPENAI_API_KEY) {
        return { region: rawRegion, categories: rawCategories };
    }

    try {
        const prompt = `
        당신은 전문가 플랫폼의 데이터 정규화 AI입니다.
        아래 사용자가 입력한 지역명과 카테고리를 분석하여 일관된 형식으로 정규화하세요.

        [규칙]
        1. 지역(region): 대한민국의 표준 행정구역 단위(시/군/구)로 수정하세요. (예: "서울 강남" -> "서울특별시 강남구", "수원" -> "수원시")
        2. 카테고리(categories): 사용자가 입력한 배열을 다음의 [기존 카테고리] 목록과 비교하세요.
           - 의미가 동일한 단어가 있다면 기존 카테고리 명칭으로 통일하세요. (예: "방청소" -> "청소")
           - 기존 목록에 없는 완전히 새로운 분야라면, 가장 직관적이고 간결한 명사형 표준어로 다듬어주세요.
        
        [데이터]
        - 기존 카테고리: ${existingCategories.join(', ')}
        - 입력된 지역: ${rawRegion}
        - 입력된 카테고리: ${rawCategories.join(', ')}

        반드시 아래 JSON 형식으로만 답변하고 다른 텍스트는 절대 출력하지 마세요.
        {"region": "표준화된지역명", "categories": ["카테고리1", "카테고리2"]}
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        return {
            region: result.region || rawRegion,
            categories: result.categories || rawCategories
        };
    } catch (error) {
        console.error("AI API 통신 오류 (원본 데이터로 대체합니다):", error.message);
        return { region: rawRegion, categories: rawCategories };
    }
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.json({ success: false, message: '파일이 업로드되지 않았습니다.' });
    res.json({ success: true, imageUrl: `/uploads/${req.file.filename}` });
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

// [수정] 지원서 접수 시 AI 정규화 로직 적용
app.post('/api/apply', async (req, res) => {
    const { userId, region, categories, bio, experience } = req.body;
    const usersDB = readData(USERS_FILE);
    const categoriesDB = readData(CATEGORIES_FILE);

    const userIndex = usersDB.findIndex(u => u.userId === userId);
    if (userIndex === -1) return res.json({ success: false, message: '회원 정보를 찾을 수 없습니다.' });

    // AI 정규화 실행
    const standardizedData = await standardizeWithAI(region, categories, categoriesDB);

    // 정규화된 새로운 카테고리가 있다면 DB에 추가
    let categoriesChanged = false;
    standardizedData.categories.forEach(category => {
        if (!categoriesDB.includes(category) && category.trim() !== '') {
            categoriesDB.push(category.trim());
            categoriesChanged = true;
        }
    });
    if (categoriesChanged) writeData(CATEGORIES_FILE, categoriesDB);

    // DB 업데이트
    usersDB[userIndex].is_expert = true;
    usersDB[userIndex].region = standardizedData.region;
    usersDB[userIndex].categories = standardizedData.categories.join(', ');
    usersDB[userIndex].bio = bio || 'N/A';
    usersDB[userIndex].experience = experience || 'N/A';
    usersDB[userIndex].applied_at = new Date().toISOString();

    writeData(USERS_FILE, usersDB);
    res.json({ success: true, message: '전문가 정보가 성공적으로 등록되었습니다.', user: usersDB[userIndex] });
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

    if (!expert || !requester) return res.json({ success: false, message: '사용자 정보를 찾을 수 없습니다.' });

    const chatRoomId = `room_${Date.now()}`;
    const chatLink = `http://localhost:3000/chat.html?room=${chatRoomId}`;

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'chat',
                expertEmail: expert.email, expertName: expert.name,
                requesterEmail: requester.email, requesterName: requesterName,
                chatLink: chatLink
            })
        });
        const result = await response.json();
        if (result.success) res.json({ success: true, message: '채팅 참여 링크가 전송되었습니다.' });
        else res.json({ success: false, message: '이메일 발송에 실패했습니다.' });
    } catch (error) {
        res.json({ success: false, message: '메일 서버 오류' });
    }
});

app.get('/api/chats', (req, res) => {
    const { room } = req.query;
    const chatsDB = readData(CHATS_FILE);
    res.json({ success: true, messages: chatsDB[room] || [] });
});

app.post('/api/chats', (req, res) => {
    const { room, senderId, senderName, type, message } = req.body;
    const chatsDB = readData(CHATS_FILE);
    if (!chatsDB[room]) chatsDB[room] = [];
    
    chatsDB[room].push({ senderId, senderName, type: type || 'text', message, timestamp: new Date().toISOString() });
    writeData(CHATS_FILE, chatsDB);
    res.json({ success: true });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));