const btn = document.getElementById('playBtn');
const selectVersionBtn = document.getElementById('selectVersionBtn');
const welcomeText = document.querySelector('.welcome-text h2');
const welcomeSubText = document.querySelector('.welcome-text p');

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
const trayCheck = document.getElementById('trayCheck');
const tyldaCheck = document.getElementById('tyldaCheck');
const localFilesBtn = document.getElementById('openLocalFiles');
const particlesCheck = document.getElementById('particlesCheck')

const accountModal = document.getElementById('accountModal');
const accountsList = document.getElementById('accountsList');
const modalMainSection = document.getElementById('modalMainSection');
const modalAddSection = document.getElementById('modalAddSection');
const offlineNickInput = document.getElementById('offlineNickInput');
const sidebarNick = document.getElementById('sidebarNick');
const sidebarSkin = document.getElementById('sidebarSkin');

const modpacksModal = document.getElementById('createPackModal');
const modpacksBtnOpen = document.getElementById('createCustomPackBtn');
const modpacksBtnClose = document.getElementById('closeModpackModalBtn');
const modpacksBtnConfirm = document.getElementById('confirmCreatePackBtn');

const pingEl = document.getElementById('serverPing');
const playersEl = document.getElementById('serverPlayers');
const serverIp = 'pl04.nesv.pl:25484';

let accounts = [];
let activeAccount = null;
let selectedPack = null;
let particlesInitialized = false;

navItems.forEach(item => {
    item.onclick = () => {
        const pageId = `page-${item.getAttribute('data-page')}`;
        
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }
});

async function fetchServerStatus() {
    const data = await window.api.pingServer(serverIp);
    if (data.online) {
        pingEl.classList.remove('good');
        pingEl.classList.remove('mid');
        pingEl.classList.remove('bad');
        playersEl.classList.remove('good');
        playersEl.classList.remove('bad');
        pingEl.innerHTML = `${data.latency}ms`;
        playersEl.innerText = `${data.players}/${data.maxPlayers}`;
        if (data.latency < 50) pingEl.classList.add('good');
        else if (data.latnecy >= 50 && data.latency < 100) pingEl.classList.add('mid');
        else pingEl.classList.add('bad');
        playersEl.classList.add('good');
    } else {
        pingEl.innerHTML    = `Offline`;
        playersEl.innerText = `Offline`;
        pingEl.classList.add('bad');
        playersEl.classList.add('bad');
    }
}

fetchServerStatus();
let serverInterval = setInterval(fetchServerStatus, 10000);

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
        premiumAuth: activeAccount.type === 'premium' ? activeAccount.auth : null,
        minimizeToTray: settings.minimizeToTray
    }

    if (window.api) {
        window.api.startMC(gameOptions);
        toggleParticles(false);
        serverInterval = null;
        btn.innerText = "Uruchomiono.."
        btn.disabled = true;
    } else {
        console.log('Dane do startu:', gameOptions);
    }
});

document.getElementById('closeBtn').onclick = () => {
    window.api.saveSettings(getCurrentSettings());

    loadingScreen.style.display = 'flex';
    loadingScreen.style.opacity = '0';
    loadingText.innerText = 'Zapisywanie i zamykanie...';
    setTimeout(() => {
        loadingScreen.style.opacity = '1';
    }, 10);
    setTimeout(() => {
        window.api.closeApp();
    }, 1000);
};
document.getElementById('minBtn').onclick = () => window.api.minimizeApp();
document.getElementById('logsBtn').onclick = () => {
    window.api.saveSettings(getCurrentSettings());
    window.api.openLogs();
}
window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
        const settings = getCurrentSettings();
        if (settings.tyldaConsole) {
            window.api.saveSettings(getCurrentSettings());
            window.api.openLogs();
        }
    }
});
localFilesBtn.onclick = () => window.api.openLocalFiles();

function toggleParticles(enabled) {
    const container = document.getElementById('particles-js');
    if (enabled) {
        container.style.display = 'block';
        document.querySelector('.content').style.background = 'transparent';
        if (!particlesInitialized) {
            particlesJS("particles-js", {
                particles: {
                    number: { value: 80, density: { enable: true, value_area: 800 } },
                    color: { value: "#b929b9" }, // Twój kolor akcentu
                    shape: { type: "circle" },
                    opacity: { value: 0.5, random: true },
                    size: { value: 3, random: true },
                    line_linked: { 
                        enable: true, 
                        distance: 150, 
                        color: "#b929b9", 
                        opacity: 0.4, 
                        width: 1 
                    },
                    move: { enable: true, speed: 0.75, direction: "none", random: false }
                },
                interactivity: { detect_on: "canvas", events: { onhover: { enable: false } } },
                retina_detect: true
            });
            particlesInitialized = true;
        }
    } else {
        container.style.display = 'none';
        document.querySelector('.content').style.background = 'radial-gradient(circle at top right, #1a0a1a, #0c0c0c)';
    }
}

async function renderPopularMods() {
    const container = document.getElementById('popularModsContainer');

    if (!container) return;

    const mods = await window.api.getPopularMods();

    if (!mods || mods.length === 0) {
        if (!mods) container.innerHTML = '<p style="color: var(--text-dim);">Wystąpił błąd.</p>';
        console.error('Błąd wczytywania modyfikacji (brak zwrotnego info)');
        return;
    }

    container.innerHTML = '';

    mods.forEach(mod => {
        const card = document.createElement('div');
        card.className = 'mod-card';

        const iconUrl = mod.logo ? mod.logo.thumbnailUrl : 'icon.png';
        const downloads = (mod.downloadCount / 1000000).toFixed(1);
        const name = (mod.name.length >= 15) ? mod.name.substring(0, 15) + '..' : mod.name;
        card.innerHTML = `
            <img src="${iconUrl}" alt="${name}">
            <div class="mod-info">
                <span>${name}</span>
                <small>⬇ ${downloads}M</small>
                <button class="btn-small">Zainstaluj</button>
            </div>
        `;
        container.appendChild(card);
    });
}
renderPopularMods();

window.api.onProgress((data) => {
    pBarContainer.style.display = 'block';
    const percent = Math.round((data.task / data.total) * 100);
    
    pBar.style.width = percent + "%";

    if (percent >= 100) {
        setTimeout(() => { pBarContainer.style.display = 'none'; }, 3000);
    }
});

window.api.onGameClosed(() => {
    btn.innerText = 'GRAJ';
    btn.disabled = false;
    toggleParticles(particlesCheck.checked);
    serverInterval = setInterval(fetchServerStatus, 10000);
})

window.api.onLoadingStatus((text) => {
    if (loadingText) loadingText.innerText = text;
});
window.api.onAppReady(() => {
    loadingScreen.style.opacity = '0';
    mainLayout.style.display = 'flex';
    actionBar.style.display = 'flex';
    toggleParticles(particlesCheck.checked);
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
});

// -- wyszukiwanie paczek --
const searchInput = document.getElementById('searchInput');

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const sections = document.querySelectorAll('.category-section');

        sections.forEach(section => {
            const packs = section.querySelectorAll('.modpackOption');
            let visibleCount = 0;

            packs.forEach(pack => {
                const name = pack.dataset.modpackname.toLowerCase();
                if (name.includes(query)) {
                    pack.style.display = 'block';
                    visibleCount++;
                } else {
                    pack.style.display = 'none';
                }
            });

            if (visibleCount === 0) {
                section.style.display = 'none';
            } else {
                section.style.display = 'block';
                if (query.length > 0) {
                    section.classList.remove('collapsed');
                }
            }
        });
    });
}