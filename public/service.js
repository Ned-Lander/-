let loggedInUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('loggedInUser');
    if (savedUser) {
        loggedInUser = JSON.parse(savedUser);
        document.getElementById('userStatus').innerText = `반갑습니다, ${loggedInUser.name}님!`;
        initSelectPage();
    }
});

function toggleAuthSubPage(target) {
    document.getElementById('loginId').value = ''; document.getElementById('loginPw').value = '';
    document.getElementById('regId').value = ''; document.getElementById('regPw').value = '';
    document.getElementById('regName').value = ''; document.getElementById('regEmail').value = '';
    document.getElementById('regOtp').value = ''; document.getElementById('regOtp').style.display = 'none';
    if (target === 'register') {
        document.getElementById('subLogin').classList.remove('show');
        document.getElementById('subRegister').classList.add('show');
    } else {
        document.getElementById('subRegister').classList.remove('show');
        document.getElementById('subLogin').classList.add('show');
    }
}

function handleLogin() {
    const userId = document.getElementById('loginId').value.trim();
    const password = document.getElementById('loginPw').value.trim();
    if (!userId || !password) return alert('아이디와 비밀번호를 모두 입력해주세요.');

    fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            loggedInUser = data.user;
            localStorage.setItem('loggedInUser', JSON.stringify(loggedInUser)); 
            if (new URLSearchParams(window.location.search).get('redirect') === 'apply') {
                window.location.href = 'index.html';
                return;
            }
            document.getElementById('userStatus').innerText = `반갑습니다, ${loggedInUser.name}님!`;
            initSelectPage();
        } else alert(data.message);
    });
}

function requestOTP() {
    const email = document.getElementById('regEmail').value.trim();
    if (!email || !email.includes('@')) return alert('유효한 이메일 주소를 입력해주세요.');
    alert('인증번호 발송을 요청했습니다. 잠시만 기다려주세요...');
    fetch('/api/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        if (data.success) document.getElementById('regOtp').style.display = 'block';
    });
}

function handleRegister() {
    const userId = document.getElementById('regId').value.trim();
    const password = document.getElementById('regPw').value.trim();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const otp = document.getElementById('regOtp').value.trim();

    if (!userId || !password || !name || !email || !otp) return alert('모든 정보를 입력하고 인증번호를 확인해주세요.');

    fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password, name, email, otp })
    })
    .then(res => res.json())
    .then(data => {
        alert(data.message);
        if (data.success) {
            toggleAuthSubPage('login');
            document.getElementById('loginId').value = userId;
        }
    });
}

function initSelectPage() {
    fetch('/api/regions').then(res => res.json()).then(data => {
        const regionSelect = document.getElementById('selectRegion');
        regionSelect.innerHTML = '<option value="">-- 지역을 선택하세요 --</option>';
        data.regions.forEach(r => regionSelect.innerHTML += `<option value="${r}">${r}</option>`);
    });
    fetch('/api/categories').then(res => res.json()).then(data => {
        const catSelect = document.getElementById('selectCategory');
        catSelect.innerHTML = '<option value="">-- 분야를 선택하세요 --</option>';
        data.categories.forEach(c => catSelect.innerHTML += `<option value="${c}">${c}</option>`);
    });
    switchPage('pageSelect');
}

function checkSelection() {
    const region = document.getElementById('selectRegion').value;
    const category = document.getElementById('selectCategory').value;
    document.getElementById('btnSearch').disabled = !(region && category);
}

// [수정됨] 본인 제외 파라미터(excludeUserId) 전송
function searchExperts() {
    const region = document.getElementById('selectRegion').value;
    const category = document.getElementById('selectCategory').value;
    const excludeId = loggedInUser ? loggedInUser.userId : '';

    fetch(`/api/search-experts?region=${encodeURIComponent(region)}&category=${encodeURIComponent(category)}&excludeUserId=${encodeURIComponent(excludeId)}`)
        .then(res => res.json())
        .then(data => {
            const listContainer = document.getElementById('expertList');
            listContainer.innerHTML = '';
            
            if (data.experts.length === 0) {
                listContainer.innerHTML = '<p style="color:#718096; margin: 20px 0;">해당 지역과 카테고리에 등록된 타 전문가가 없습니다.</p>';
            } else {
                data.experts.forEach(exp => {
                    listContainer.innerHTML += `
                        <div class="expert-card">
                            <h4>${exp.name} 전문가</h4>
                            <p><strong>지역:</strong> ${exp.region}</p>
                            <p><strong>전문분야:</strong> ${exp.categories}</p>
                            <p><strong>한줄소개:</strong> ${exp.bio}</p>
                            <p><strong>경력사항:</strong> ${exp.experience}</p>
                            <button class="btn-match" onclick="requestChat('${exp.id}', '${exp.name}')">전문가 선택 및 채팅하기</button>
                        </div>
                    `;
                });
            }
            switchPage('pageResult');
        });
}

// [신규] 매칭 요청 및 채팅 링크 발송 로직
function requestChat(expertId, expertName) {
    if(!loggedInUser) return alert("로그인이 필요합니다.");
    
    if(confirm(`${expertName} 전문가에게 매칭(채팅)을 요청하시겠습니까?`)) {
        // 사용자에게 처리 중임을 알림
        alert("이메일 전송을 준비 중입니다. 잠시만 기다려주세요...");

        fetch('/api/request-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                expertId: expertId,
                requesterId: loggedInUser.userId
            })
        })
        .then(res => res.json())
        .then(data => {
            // 발송 성공 시 요구사항대로 팝업 노출
            alert(data.message);
        })
        .catch(err => {
            console.error(err);
            alert('오류가 발생했습니다.');
        });
    }
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}
function goBackToSelect() { switchPage('pageSelect'); }
function logout() {
    loggedInUser = null;
    localStorage.removeItem('loggedInUser');
    document.getElementById('userStatus').innerText = '';
    document.getElementById('selectRegion').value = '';
    document.getElementById('selectCategory').value = '';
    document.getElementById('btnSearch').disabled = true;
    switchPage('pageAuth');
    toggleAuthSubPage('login');
}