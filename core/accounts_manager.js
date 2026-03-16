async function initAccounts() {
    try {
        accounts = await window.api.getAccounts() || [];
        let changed = false;
        accounts = accounts.map(acc => {
            const updated = ensureAccountId(acc);
            if (updated !== acc) changed = true;
            return updated;
        });
        activeAccount = accounts.find(acc => acc.active) || accounts[0] || null;
        window.activeAccount = activeAccount || null;
        if (changed) await window.api.saveAccounts(accounts);
        updateSidebarUI();
    } catch (e) { console.error("Błąd ładowania kont:", e); }
}
initAccounts();

function generateLocalId() {
    try {
        if (crypto?.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return `loc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureAccountId(account) {
    if (!account || account.accountId) return account;
    const acc = { ...account };
    if (acc.type === "premium") {
        acc.accountId = acc.auth?.uuid || acc.auth?.profile?.id || acc.auth?.id || generateLocalId();
    } else {
        acc.accountId = generateLocalId();
    }
    return acc;
}

function updateSidebarUI() {
    let username = 'Steve';
    let accountId = null;
    let accountType = null;
    if (activeAccount) {
        username = activeAccount.name;
        accountId = activeAccount.accountId || null;
        accountType = activeAccount.type || null;
        window.activeAccount = activeAccount;
        sidebarNick.innerText = activeAccount.name;
        welcomeText.innerText = `Hej, ${activeAccount.name}`;
        welcomeSubText.innerText = 'Miło nam, że wróciłeś!';
        sidebarSkin.src = `https://minotar.net/helm/${activeAccount.name}/32.png`;
    } else {
        username = 'Steve';
        sidebarNick.innerText = "Logowanie";
        welcomeText.innerText = `Witaj w świecie Haven!`;
        welcomeSubText.innerText = 'Zaloguj się i ciesz się grą!';
        sidebarSkin.src = `https://minotar.net/helm/Steve/32.png`;
    }
    const event = new CustomEvent('accountChanged', { detail: { username, accountId, accountType } });
    document.dispatchEvent(event);
    window.dispatchEvent(event);
}

const closeModal = () => {
    accountModal.style.display = 'none';
    modalAddSection.style.display = 'none';
    modalMainSection.style.display = 'block';
    offlineNickInput.value = '';

    const errorDiv = document.getElementById('account-modal-error');
    if (errorDiv) errorDiv.style.display = 'none';
};

document.getElementById('sidebarAccountBtn').onclick = () => {
    renderAccountsList();
    accountModal.style.display = 'flex';
}
document.getElementById('closeModalBtn').onclick = closeModal;
accountModal.addEventListener('click', (e) => { if (e.target === accountModal) closeModal(); });

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
            // selectAccount wywoła closeModal
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
    window.activeAccount = activeAccount;
    await window.api.saveAccounts(accounts);
    updateSidebarUI();    
    closeModal();
}

async function deleteAccount(index) {
    accounts.splice(index, 1);
    if (accounts.length > 0) {
        if (!accounts.some(a => a.active)) accounts[0].active = true;
    }
    activeAccount = accounts.find(a => a.active) || null;
    window.activeAccount = activeAccount || null;
    await window.api.saveAccounts(accounts);
    updateSidebarUI();
    renderAccountsList();
}

window.selectAccount = async (index) => {
    accounts.forEach(a => a.active = false);
    accounts[index].active = true;
    activeAccount = accounts[index];
    window.activeAccount = activeAccount;
    await window.api.saveAccounts(accounts);
    updateSidebarUI();
    renderAccountsList();
};

window.deleteAccount = async (index) => {
    accounts.splice(index, 1);
    if (accounts.length > 0) accounts[0].active = true;
    activeAccount = accounts.find(a => a.active) || null;
    window.activeAccount = activeAccount || null;
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
    let nick = offlineNickInput.value.trim();

    function showError(msg) {
        offlineNickInput.style.borderColor = '#e74c3c';
        offlineNickInput.disabled = true;
        offlineNickInput.value = msg;
        setTimeout(() => {
            offlineNickInput.style.borderColor = '#333';
            offlineNickInput.disabled = false;
            offlineNickInput.value = nick;
        }, 2000);
    }
    
    if (nick.length < 3) {
        showError('Nick musi mieć więcej niż 3 znaki.');
        return;
    }
    if (String(nick).includes(' ')) {
        nick = String(nick).replace(' ', '_');
        offlineNickInput.value = nick;
    }
    if (!/^[A-Za-z0-9_]+$/.test(nick)) {
        showError('Nick może mieć tylko litery, cyfry i _.');
        return;
    }
    if (nick.length > 16) {
        showError('Nick musi mieć mniej niż 17 znaków.');
        return;
    }


    accounts.forEach(a => a.active = false);
    accounts.push({ type: 'offline', name: nick, active: true, auth: null, accountId: generateLocalId() });
    activeAccount = accounts[accounts.length - 1];
    window.activeAccount = activeAccount;

    await window.api.saveAccounts(accounts);

    updateSidebarUI();    
    renderAccountsList();
    closeModal();
};
offlineNickInput.onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('confirmOfflineBtn').click();
};

document.getElementById('addPremiumBtn').onclick = async () => {
    const btn = document.getElementById('addPremiumBtn');
    btn.innerText = "Ładowanie...";
    
    const authData = await window.api.loginMicrosoft();
    btn.innerText = "👑 Premium";

    if (authData) {
        accounts.forEach(a => a.active = false);
        accounts.push({ type: 'premium', name: authData.name, active: true, auth: authData, accountId: (authData.uuid || authData.profile?.id || authData.id || generateLocalId()) });
        activeAccount = accounts[accounts.length - 1];
        window.activeAccount = activeAccount;
        await window.api.saveAccounts(accounts);
        updateSidebarUI();
        renderAccountsList();
    }
};
