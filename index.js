const btn = document.getElementById('playBtn');
const input = document.getElementById('nick');
const skinHead = document.getElementById('skinHead');

const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');

const pBar = document.getElementById('pBar');
const pBarContainer = document.getElementById('pBarContainer');

// Elementy ekranu ładowania/zamykania
const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const mainLayout = document.querySelector('.main-layout');

navItems.forEach(item => {
    item.onclick = () => {
        const pageId = `page-${item.getAttribute('data-page')}`;
        
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        pages.forEach(p => p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
    }
});

const ramSlider = document.getElementById('ramSlider');
const ramVal = document.getElementById('ramVal');
const versionSelect = document.getElementById('version-select');

ramSlider.oninput = function() {
    ramVal.innerHTML = this.value + "GB";
}

input.addEventListener('input', (e) => {
    const nick = e.target.value.trim();
    if(nick.length > 2) {
        skinHead.src = `https://minotar.net/helm/${nick}/128.png`;
    } else {
        skinHead.src = `https://minotar.net/helm/Steve/128.png`;
    }
});

function getCurrentSettings() {
    return {
        nick: input.value,
        ram: ramSlider.value,
        version: versionSelect.value
    }
}

const pingEl = document.getElementById('serverPing');
const playersEl = document.getElementById('serverPlayers');
const serverIp = 'pl04.nesv.pl:25484';

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

// Uruchomienie od razu i odświeżanie co 10 sekund (żeby nie zabić API)
fetchServerStatus();
setInterval(fetchServerStatus, 10000);

btn.addEventListener('click', () => {
    const settings = getCurrentSettings();
    window.api.saveSettings(settings);

    const gameOptions = {
        user: settings.nick,
        ram: settings.ram,
        version: settings.version
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
    pBarContainer.style.display = 'block'; // Pokazujemy pasek
    const percent = Math.round((data.task / data.total) * 100);
    
    pBar.style.width = percent + "%";

    if (percent >= 100) {
        setTimeout(() => { pBarContainer.style.display = 'none'; }, 3000);
    }
});
window.api.onLoadSettings((config) => {
    input.value = config.nick;
    ramSlider.value = config.ram;
    ramVal.innerHTML = config.ram + "GB";
    versionSelect.value = config.version;

    if (config.nick) {
        skinHead.src = `https://minotar.net/helm/${config.nick}/128.png`;
    }

    // Ukryj ekran ładowania i pokaż główną zawartość aplikacji
    loadingScreen.style.display = 'none';
    mainLayout.style.display = 'flex';
});
window.api.onLoadModpacks((modpacks) => {
    const select = document.getElementById('version-select');
    select.innerHTML = '';

    Object.keys(modpacks).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name;
        select.appendChild(option);
    });
});
window.api.onGameClosed(() => {
    btn.innerText = 'GRAJ';
    btn.disabled = false;
})
