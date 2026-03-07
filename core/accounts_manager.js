async function initAccounts() {
    try {
        accounts = await window.api.getAccounts() || [];
        activeAccount = accounts.find(acc => acc.active) || accounts[0] || null;
        updateSidebarUI();
    } catch (e) { console.error("Błąd ładowania kont:", e); }
}
initAccounts();

function updateSidebarUI() {
    if (activeAccount) {
        sidebarNick.innerText = activeAccount.name;
        welcomeText.innerText = `Hej, ${activeAccount.name}`;
        welcomeSubText.innerText = 'Miło nam, że wróciłeś!';
        sidebarSkin.src = `https://minotar.net/helm/${activeAccount.name}/32.png`;
    } else {
        sidebarNick.innerText = "Logowanie";
        welcomeText.innerText = `Witaj w świecie Haven!`;
        welcomeSubText.innerText = 'Zaloguj się i ciesz się grą!';
        sidebarSkin.src = `https://minotar.net/helm/Steve/32.png`;
    }
}

document.getElementById('sidebarAccountBtn').onclick = () => {
    renderAccountsList();
    accountModal.style.display = 'flex';
}
document.getElementById('closeModalBtn').onclick = () => {
    accountModal.style.display = 'none';
};
accountModal.onclick = (e) => {
    if (e.target === accountModal) {
        accountModal.style.display = 'none';
    }
};

function renderAccountsList() {
    accountsList.innerHTML = '';
    accounts.forEach((acc, index) => {
        const item = document.createElement('div');
        item.className = `account-item ${acc.active ? 'active' : ''}`;
        item.innerHTML = `
            <div class="acc-info" onclick="selectAccount(${index})">
                <img src="https://minotar.net/helm/${acc.name}/32.png">
                <div>
                    <span>${acc.name}</span><br>
                    <span class="acc-type">${acc.type === 'premium' ? '👑 Premium' : 'Offline'}</span>
                </div>
            </div>
            <button class="acc-delete" onclick="deleteAccount(${index})">×</button>
        `;
        item.querySelector('.acc-info').onclick = () => {
            selectAccount(index);
            accountModal.style.display = 'none';
        };
        item.querySelector('.acc-delete').onclick = (e) => {
            e.stopPropagation();
            deleteAccount(index);
        }
        accountsList.appendChild(item);
    });
}

async function selectAccount(index) {
    accounts.forEach(a => a.active = false);
    accounts[index].active = true;
    activeAccount = accounts[index];
    await window.api.saveAccounts(accounts);
    updateSidebarUI();
    accountModal.style.display = 'none';
}

async function deleteAccount(index) {
    accounts.splice(index, 1);
    if (accounts.length > 0) {
        if (!accounts.some(a => a.active)) accounts[0].active = true;
    }
    activeAccount = accounts.find(a => a.active) || null;
    await window.api.saveAccounts(accounts);
    updateSidebarUI();
    renderAccountsList();
}

window.selectAccount = async (index) => {
    accounts.forEach(a => a.active = false);
    accounts[index].active = true;
    activeAccount = accounts[index];
    await window.api.saveAccounts(accounts);
    updateSidebarUI();
    renderAccountsList();
};

window.deleteAccount = async (index) => {
    accounts.splice(index, 1);
    if (accounts.length > 0) accounts[0].active = true;
    activeAccount = accounts.find(a => a.active) || null;
    await window.api.saveAccounts(accounts);
    updateSidebarUI();
    renderAccountsList();
};

document.getElementById('showAddOfflineBtn').onclick = async () => {
    modalMainSection.style.display = 'none';
    modalAddSection.style.display = 'block';
    offlineNickInput.focus();
};
document.getElementById('cancelOfflineBtn').onclick = () => {
    modalAddSection.style.display = 'none';
    modalMainSection.style.display = 'block';
    offlineNickInput.value = '';
};
document.getElementById('confirmOfflineBtn').onclick = async () => {
    const nick = offlineNickInput.value.trim();
    
    if (nick.length < 3) {
        alert("Nick musi mieć minimum 3 znaki!");
        return;
    }

    accounts.forEach(a => a.active = false);
    accounts.push({ type: 'offline', name: nick, active: true, auth: null });
    activeAccount = accounts[accounts.length - 1];

    await window.api.saveAccounts(accounts);

    updateSidebarUI();
    renderAccountsList();
    offlineNickInput.value = '';
    modalAddSection.style.display = 'none';
    modalMainSection.style.display = 'block';
    accountModal.style.display = 'none';
};
offlineNickInput.onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('confirmOfflineBtn').click();
};

const closeModal = () => {
    accountModal.style.display = 'none';
    modalAddSection.style.display = 'none';
    modalMainSection.style.display = 'block';
};

document.getElementById('closeModalBtn').onclick = closeModal;

document.getElementById('addPremiumBtn').onclick = async () => {
    const btn = document.getElementById('addPremiumBtn');
    btn.innerText = "Ładowanie...";
    
    const authData = await window.api.loginMicrosoft();
    btn.innerText = "👑 Premium";

    if (authData) {
        accounts.forEach(a => a.active = false);
        accounts.push({ type: 'premium', name: authData.name, active: true, auth: authData });
        activeAccount = accounts[accounts.length - 1];
        await window.api.saveAccounts(accounts);
        updateSidebarUI();
        renderAccountsList();
    }
};