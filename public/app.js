window.currentApplicationData = null;
window.isExistingMode = false;
window.existingUserData = null;

// [초기화] 페이지 로드 시 로컬 저장소를 확인하여 권한 부여
document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('loggedInUser');
    if (userJson) {
        window.existingUserData = JSON.parse(userJson);
        window.isExistingMode = window.existingUserData.is_expert;
        
        document.getElementById('loginPromptBlock').style.display = 'none';
        document.getElementById('loggedInBlock').style.display = 'block';
        document.getElementById('loggedInName').innerText = window.existingUserData.name;
    } else {
        document.getElementById('loginPromptBlock').style.display = 'block';
        document.getElementById('loggedInBlock').style.display = 'none';
    }
});

// 미로그인 시 리다이렉트 처리 (파라미터 전달)
function goToServicePage() {
    window.location.href = 'service.html?redirect=apply';
}

function startApplication() {
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    document.getElementById('step2').classList.add('active');

    const modifyBlock = document.getElementById('regionModifyBlock');
    const inputBlock = document.getElementById('regionInputBlock');

    if (window.isExistingMode && window.existingUserData.region !== 'N/A') {
        document.getElementById('currentRegionText').innerText = window.existingUserData.region;
        modifyBlock.classList.remove('hidden-block');
        inputBlock.classList.add('hidden-block');
    } else {
        modifyBlock.classList.add('hidden-block');
        inputBlock.classList.remove('hidden-block');
    }
}

function handleRegionModifyChoice(wantsToModify) {
    if (wantsToModify) {
        document.getElementById('regionInputBlock').classList.remove('hidden-block');
    } else {
        document.getElementById('inputRegion').value = window.existingUserData.region;
        nextStep(3);
    }
}

function loadCategories() {
    fetch('/api/categories')
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const container = document.getElementById('categoryList');
                container.innerHTML = '';
                data.categories.forEach(cat => {
                    const label = document.createElement('label');
                    label.style.display = 'block';
                    label.style.marginBottom = '5px';
                    const isChecked = window.isExistingMode && window.existingUserData.categories.includes(cat) ? 'checked' : '';
                    label.innerHTML = `<input type="checkbox" name="categories" value="${cat}" ${isChecked}> ${cat}`;
                    container.appendChild(label);
                });
            }
        });
}

function nextStep(stepNumber) {
    if (stepNumber === 3) {
        if (!document.getElementById('inputRegion').value.trim()) return alert('지역을 입력해주세요.');
        loadCategories();
    }
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

function prevStep(stepNumber) {
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step${stepNumber}`).classList.add('active');
}

function addEtcField() {
    const container = document.getElementById('etcContainer');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'etc-input';
    input.placeholder = '기타 전문분야 입력';
    input.style.marginTop = '5px';
    container.appendChild(input);
    container.appendChild(document.createElement('br'));
}

function generateSummary() {
    const region = document.getElementById('inputRegion').value.trim();
    const checkedCats = [];
    
    document.querySelectorAll('input[name="categories"]:checked').forEach(cb => checkedCats.push(cb.value));
    document.querySelectorAll('.etc-input').forEach(input => {
        const val = input.value.trim();
        if (val !== '' && !checkedCats.includes(val)) checkedCats.push(val);
    });

    if (checkedCats.length === 0) return alert('최소 하나 이상의 카테고리를 선택하거나 입력해주세요.');

    window.currentApplicationData = { region, categories: checkedCats };

    document.getElementById('summaryArea').innerHTML = `
        <p><strong>이름:</strong> ${window.existingUserData.name}</p>
        <p><strong>활동 지역:</strong> ${region}</p>
        <p><strong>등록 전문 분야:</strong> ${checkedCats.join(', ')}</p>
    `;

    if (window.isExistingMode) {
        document.getElementById('inputBio').value = window.existingUserData.bio !== 'N/A' ? window.existingUserData.bio : '';
        document.getElementById('inputExperience').value = window.existingUserData.experience !== 'N/A' ? window.existingUserData.experience : '';
    }
    nextStep(4);
}

function submitApplication() {
    const finalPayload = {
        userId: window.existingUserData.userId, // 권한 연동을 위해 아이디 전송
        region: window.currentApplicationData.region,
        categories: window.currentApplicationData.categories,
        bio: document.getElementById('inputBio').value.trim(),
        experience: document.getElementById('inputExperience').value.trim()
    };

    fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            // 성공 시 로컬 저장소에 갱신된 회원 정보 덮어쓰기
            localStorage.setItem('loggedInUser', JSON.stringify(data.user));
            location.reload();
        } else alert(data.message);
    });
}