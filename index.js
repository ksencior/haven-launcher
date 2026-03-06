const btn = document.getElementById('playBtn');
const selectVersionBtn = document.getElementById('selectVersionBtn');

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

const pBar = document.getElementById('pBar');
const pBarContainer = document.getElementById('pBarContainer');
const actionBar = document.querySelector('.action-bar');

const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const mainLayout = document.querySelector('.main-layout');

const ramSlider = document.getElementById('ramSlider');
const ramVal = document.getElementById('ramVal');

const accountModal = document.getElementById('accountModal');
const accountsList = document.getElementById('accountsList');
const modalMainSection = document.getElementById('modalMainSection');
const modalAddSection = document.getElementById('modalAddSection');
const offlineNickInput = document.getElementById('offlineNickInput');
const sidebarNick = document.getElementById('sidebarNick');
const sidebarSkin = document.getElementById('sidebarSkin');

const pingEl = document.getElementById('serverPing');
const playersEl = document.getElementById('serverPlayers');
const serverIp = 'pl04.nesv.pl:25484';

let accounts = [];
let activeAccount = null;
let selectedPack = null;

navItems.forEach(item => {
    item.onclick = () => {
        const pageId = `page-${item.getAttribute('data-page')}`;
        
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }
});

ramSlider.oninput = function() {
    ramVal.innerHTML = this.value + "GB";
}

function getCurrentSettings() {
    return {
        ram: ramSlider.value,
        version: selectedPack
    }
}

function selectVersion(modpack) {
    selectedPack = modpack;
    const modpacks = document.querySelectorAll('.modpackOption');
    modpacks.forEach((pack) = (p) => {
        p.classList.remove('selected');
        const name = p.dataset.modpackname;
        if (name === selectedPack) {
            p.classList.add('selected')
        }
    });
    selectVersionBtn.innerText = modpack;
}

async function fetchServerStatus() {
    try {
        // 1. Prawdziwy Ping z komputera gracza do serwera
        if (window.api && window.api.pingServer) {
            const ping = await window.api.pingServer(serverIp);
            
            pingEl.className = 'val';
            if (ping !== null) {
                pingEl.innerText = `${ping} ms`;
                if (ping < 50) pingEl.classList.add('good');
                else if (ping < 100) pingEl.classList.add('mid');
                else pingEl.classList.add('bad');
            } else {
                pingEl.innerText = "Offline";
                pingEl.classList.add('bad');
            }
        }

        // 2. Gracze online pobierani z publicznego API Minecrafta (zamiast TPS)
        const response = await fetch(`https://api.mcsrvstat.us/3/${serverIp}`);
        const data = await response.json();
        
        playersEl.className = 'val';
        if (data.online) {
            playersEl.innerText = `${data.players.online}/${data.players.max}`;
            playersEl.classList.add('good');
        } else {
            playersEl.innerText = "Niedostępne";
            playersEl.classList.add('bad');
        }

    } catch (e) {
        console.error("Błąd pobierania statusu serwera:", e);
        playersEl.innerText = "Błąd API";
        playersEl.className = 'val bad';
    }
}

fetchServerStatus();
setInterval(fetchServerStatus, 10000);

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
        sidebarSkin.src = `https://minotar.net/helm/${activeAccount.name}/32.png`;
    } else {
        sidebarNick.innerText = "Logowanie";
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

//VERSION BTN
selectVersionBtn.onclick = () => {
    const pageId = `page-tools`;
        
    navItems.forEach((i) => {
        i.classList.remove('active');
        if (i.dataset.page === "tools") {
            i.classList.add('active');
        }
    });

    pages.forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

// GRAJ BTN
btn.addEventListener('click', () => {
    const settings = getCurrentSettings();
    window.api.saveSettings(settings);

    if (!activeAccount) {
        accountModal.style.display = 'flex';
        return;
    }

    const gameOptions = {
        user: activeAccount.name,
        ram: settings.ram,
        version: selectedPack,
        premiumAuth: activeAccount.type === 'premium' ? activeAccount.auth : null
    }

    if (window.api) {
        window.api.startMC(gameOptions);
        btn.innerText = "Uruchomiono.."
        btn.disabled = true;
    } else {
        console.log('Dane do startu:', gameOptions);
    }
});

document.getElementById('closeBtn').onclick = () => {
    window.api.saveSettings(getCurrentSettings());

    mainLayout.style.display = 'none';
    actionBar.style.display = 'none';
    loadingScreen.style.display = 'flex';
    loadingText.innerText = 'Zamykanie...';

    setTimeout(() => {
        window.api.closeApp();
    }, 500);
};
document.getElementById('minBtn').onclick = () => window.api.minimizeApp();
document.getElementById('logsBtn').onclick = () => window.api.openLogs();
window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
        window.api.openLogs();
    }
});


window.api.onProgress((data) => {
    pBarContainer.style.display = 'block';
    const percent = Math.round((data.task / data.total) * 100);
    
    pBar.style.width = percent + "%";

    if (percent >= 100) {
        setTimeout(() => { pBarContainer.style.display = 'none'; }, 3000);
    }
});
window.api.onLoadSettings((config) => {
    ramSlider.value = config.ram;
    ramVal.innerHTML = config.ram + "GB";
    if (config.version != null) {
        selectedPack = config.version;
    } else {
        selectedPack = 'HavenPack 1.20.4';
    }

    loadingScreen.style.display = 'none';
    mainLayout.style.display = 'flex';
    actionBar.style.display = 'flex';
});
window.api.onLoadModpacks((modpacks) => {
    const container = document.getElementById('modpacks-container');
    container.innerHTML = '';

    const groups = {
        "Polecane": [],
        "Paczki HavenMine": [],
        "Vanilla": [],
        "Inne": []
    };

    Object.keys(modpacks).forEach(name => {
        const packData = modpacks[name];
        const nameLC = name.toLowerCase();

        if (packData.latest) {
            groups["Polecane"].push({name, data: packData});
        } else if (nameLC.includes('havenpack')) {
            groups["Paczki HavenMine"].push({name, data: packData});
        } else if (nameLC.includes('vanilla')) {
            groups["Vanilla"].push({name, data: packData});
        } else {
            groups["Inne"].push({name, data: packData});
        }
    })

    Object.keys(groups).forEach(catName => {
        const categoryPacks = groups[catName];

        if (categoryPacks.length === 0) return;

        const section = document.createElement('div');
        section.className = 'category-section'
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerText = catName;
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'category-grid';

        categoryPacks.forEach(packObj => {
            const name = packObj.name;
            const packData = packObj.data;

            const packDiv = document.createElement('div');
            packDiv.className = 'modpackOption';
            packDiv.dataset.modpackname = name;

            let icon;
            let opis;
            if (name.toLowerCase().includes('havenpack')) {
                icon = '⭐';
                opis = 'Modpack specjalnie przygotowany przez administrację HavenMine!';
            } else if (name.toLowerCase().includes('vanilla')) {
                icon = '🌍';
                opis = 'Czysty Minecraft. Dla graczy, którzy nie potrzebują modyfikacji.'
            } else if (packData.latest) {
                icon = '🚀';
                opis = 'Zawsze aktualna wersja Minecrafta. '
            } else {
                icon = '📦';
                opis = 'Nieznana zmodyfikowana paczka modów.';
            }
            packDiv.innerHTML = `
            <div class="tool-card">
                <div class="tool-icon">${icon}</div>
                <div class="tool-info">
                    <h4>${name}</h4>
                    <p>${opis}</p>
                </div>
            </div>
            `;
            packDiv.onclick = () => selectVersion(name);
            grid.appendChild(packDiv);
        });
        section.appendChild(grid);
        container.appendChild(section);
    })

    selectVersion(selectedPack);
});
window.api.onGameClosed(() => {
    btn.innerText = 'GRAJ';
    btn.disabled = false;
})
