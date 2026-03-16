const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, shell } = require('electron');
const path =                            require('path');
const os =                              require('os');
const fs =                              require('fs');
const net =                             require('net');
const axios =                           require('axios');
const AdmZip =                          require('adm-zip');
const { Client, Authenticator } =       require('minecraft-launcher-core');
const { Auth } =                        require('msmc');
const util =                            require('minecraft-server-util');
const { execSync, exec, spawn, spawnSync } =       require('child_process');
const ut =                              require('util');
const { autoUpdater } =                 require('electron-updater');
                                        require('dotenv').config();
const DiscordRPC =                      require('discord-rpc');

/*
TODO:
- Integracja z modrinchem
- HavenSync
- Wlasny mod dla HavenPacka
- Integracja z Discordem (DONE!)
- Podtrzymywanie sesji, by nie wygasła (DONE!)
- Poprawić / Dodać animacje
- Dodać dźwięki launchera

*/

const launcher = new Client();
const CF_API_KEY = process.env.CF_API_KEY || app.getAppMetrics()[0]?.context?.CF_API_KEY || require('./package.json').CF_API_KEY;
const execPromise = ut.promisify(exec);

const DISCORD_CLIENT_ID = '1482869286241566740';
let rpcClient;

function initDiscordRPC() {
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    rpcClient.on('ready', () => {
        setDiscordActivity('W menu', 'Przegląda paczki');
        console.log('Discord initialized. ID:', DISCORD_CLIENT_ID);
    });
    rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch(e => console.warn('Discord RPC Warning:', e.message));
}

function setDiscordActivity(state, details, startTimestamp = new Date()) {
    if (!rpcClient) return;
    rpcClient.setActivity({
        details: details,
        state: state,
        startTimestamp,
        largeImageKey: 'logo',
        largeImageText: 'HavenLauncher',
        instance: false,
    }).catch(() => {});
}

let LAUNCHER_PATH;
if (process.platform === 'win32') {
    LAUNCHER_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'HavenLauncher');
} else if (process.platform === 'darwin') {
    LAUNCHER_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'HavenLauncher');
} else {
    LAUNCHER_PATH = path.join(os.homedir(), '.havenlauncher')
}
const JAVA_CONFIG = {
    '8': {
        url: 'https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/adoptium',
        folder: 'java8'
    },
    '17': {
        url: 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/adoptium',
        folder: 'java17'
    },
    '21': {
        url: 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/adoptium',
        folder: 'java21'
    }
};
const JAVA_DIR      = path.join(LAUNCHER_PATH, 'runtime');
const JAVA_EXE      = process.platform === 'win32'
                    ? path.join(JAVA_DIR, 'bin', 'java.exe')
                    : path.join(JAVA_DIR, 'bin', 'java');
const configPath    = path.join(LAUNCHER_PATH, 'config.json');
const instancesPath = path.join(LAUNCHER_PATH, 'instances');
const accountsPath  = path.join(LAUNCHER_PATH, 'accounts.json');
const userPacksPath = path.join(LAUNCHER_PATH, 'custom_instances.json');
const errorLogPath  = path.join(LAUNCHER_PATH, 'error_logs.txt');
const logsPath      = path.join(LAUNCHER_PATH, 'logs');
const currentLogFile = path.join(logsPath, 'launcher_logs.txt');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 5;

if (!fs.existsSync(LAUNCHER_PATH)) {
    fs.mkdirSync(LAUNCHER_PATH, { recursive: true });
}
if (!fs.existsSync(instancesPath)) {
    fs.mkdirSync(instancesPath, { recursive: true });
}
if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath, { recursive: true });
}

let logWindow;
let gameProcess;
let tray = null;
let logBuffer = [];
const MAX_LOGS = 1000;
const activeDownloads = new Set();
let logQueue = [];
let logFlushTimer = null;
const LOG_FLUSH_INTERVAL_MS = 80;
const LOG_FLUSH_BATCH = 200;
const LOG_QUEUE_LIMIT = 5000;

function queueLogToWindow(lines) {
    if (!lines) return;
    const incoming = Array.isArray(lines) ? lines : [lines];
    for (const line of incoming) {
        if (!line || String(line).trim() === '') continue;
        logQueue.push(String(line));
    }
    if (logQueue.length > LOG_QUEUE_LIMIT) {
        logQueue.splice(0, logQueue.length - LOG_QUEUE_LIMIT);
    }
    if (!logWindow || logWindow.isDestroyed()) return;
    if (logFlushTimer) return;
    logFlushTimer = setTimeout(flushLogQueue, LOG_FLUSH_INTERVAL_MS);
}

function flushLogQueue() {
    logFlushTimer = null;
    if (!logWindow || logWindow.isDestroyed()) return;
    if (logQueue.length === 0) return;
    const batch = logQueue.splice(0, LOG_FLUSH_BATCH);
    logWindow.webContents.send('mc-log', batch);
    if (logQueue.length > 0) {
        logFlushTimer = setTimeout(flushLogQueue, LOG_FLUSH_INTERVAL_MS);
    }
}

// ===== FILE LOGGING SYSTEM =====
function getTimestamp() {
    const now = new Date();
    return now.toISOString();
}

function rotateLogFiles() {
    try {
        if (!fs.existsSync(currentLogFile)) return;
        
        const stats = fs.statSync(currentLogFile);
        if (stats.size < MAX_LOG_SIZE) return;

        // Find existing backup files
        const existingBackups = [];
        for (let i = 1; i <= MAX_LOG_FILES; i++) {
            const backupFile = path.join(logsPath, `launcher_logs.${i}.txt`);
            if (fs.existsSync(backupFile)) {
                existingBackups.push(i);
            }
        }

        // Shift existing files
        for (let i = Math.min(...existingBackups, MAX_LOG_FILES - 1); i >= 1; i--) {
            const oldFile = path.join(logsPath, `launcher_logs.${i}.txt`);
            const newFile = path.join(logsPath, `launcher_logs.${i + 1}.txt`);
            if (fs.existsSync(oldFile)) {
                fs.renameSync(oldFile, newFile);
            }
        }

        // Rotate current log
        const backupFile = path.join(logsPath, `launcher_logs.1.txt`);
        fs.renameSync(currentLogFile, backupFile);
    } catch (err) {
        console.error('[LOG ROTATION] Error:', err);
    }
}

function logToFile(message, level = 'INFO') {
    try {
        // Check and rotate if needed
        if (fs.existsSync(currentLogFile)) {
            const stats = fs.statSync(currentLogFile);
            if (stats.size >= MAX_LOG_SIZE) {
                rotateLogFiles();
            }
        }

        const timestamp = getTimestamp();
        const logLine = `[${timestamp}] [${level}] ${message}\n`;
        
        fs.appendFileSync(currentLogFile, logLine, 'utf-8');
    } catch (err) {
        console.error('[LOG FILE ERROR]', err);
    }
}

function initializeLoggingSystem() {
    // Override console methods
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        originalLog.apply(console, args);
        logToFile(message, 'INFO');
    };

    console.error = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        originalError.apply(console, args);
        logToFile(message, 'ERROR');
    };

    console.warn = function(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        originalWarn.apply(console, args);
        logToFile(message, 'WARN');
    };

    logToFile('========== HavenLauncher Started ==========');
    logToFile(`Platform: ${process.platform}`);
    logToFile(`App Version: ${app.getVersion()}`);
}

// Initialize logging system
initializeLoggingSystem();
// ===== END FILE LOGGING SYSTEM =====

const modpacksPath  = path.join(__dirname, 'modpacks.json');
const MODPACKS      = JSON.parse(fs.readFileSync(modpacksPath, 'utf-8'));
let USER_MODPACKS;
let ALL_MODPACKS;

function setupAutoUpdater(win) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.log("Updater timeout - kontynuuję uruchamianie.");
            updateStatus(win, 'Nie udało się sprawdzić aktualizacji, startowanie...');
            resolve();
        }, 20000);

        autoUpdater.allowPrerelease = true;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        const finish = () => {
            clearTimeout(timeout);
            resolve();
        };

        autoUpdater.on('checking-for-update', () => {
            updateStatus(win, 'Szukanie aktualizacji...');
        });
        autoUpdater.on('error', (err) => {
            updateStatus(win, `Błąd aktualizacji: ${err.message.substring(0, 20)}...`);
            fs.writeFileSync(errorLogPath, err.stack || err.err.toString(), 'utf-8');
            console.error(err);
            finish();
        });

        autoUpdater.on('download-progress', (progressObj) => {
            let percent = Math.round(progressObj.percent);
            updateStatus(win, `Aktualizowanie... (${percent}%)`);
        });
        autoUpdater.on('update-not-available', () => {
            updateStatus(win, 'Launcher jest aktualny.');
            finish();
        });
        autoUpdater.on('update-downloaded', (info) => {
            updateStatus(win, 'Uruchamiam ponownie...');
            setTimeout(() => {
                autoUpdater.quitAndInstall();
            }, 2000);
        });

        autoUpdater.checkForUpdates().catch(() => finish());
    })
}

function getRequiredJava(mcVersion) {
    const v = mcVersion.split('.').map(Number);

    if (v[1] > 20 || (v[1] === 20 && v[2] >= 5)) return JAVA_CONFIG['21'];
    if (v[1] >= 17) return JAVA_CONFIG['17'];
    return JAVA_CONFIG['8'];
}

async function getJavaPathWithConfig(config, event = null) {
    const runtimeRoot = path.join(LAUNCHER_PATH, 'runtime');
    const javaFolder = path.join(runtimeRoot, config.folder);
    
    const javaExe = process.platform === 'win32' ? 'javaw.exe' : 'java';
    
    let executablePath = null;
    if (fs.existsSync(javaFolder)) {
        const subDirs = fs.readdirSync(javaFolder);
        for (const sub of subDirs) {
            const fullPath = path.join(javaFolder, sub, 'bin', javaExe);
            if (fs.existsSync(fullPath)) {
                executablePath = fullPath;
                break;
            }
        }
    }

    if (executablePath) return executablePath;

    if (!fs.existsSync(runtimeRoot)) fs.mkdirSync(runtimeRoot, { recursive: true });
    const zipPath = path.join(runtimeRoot, `${config.folder}.zip`);

    await downloadFile(config.url, zipPath, event);

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(javaFolder, true);
    
    fs.unlinkSync(zipPath);

    const subDirsAfter = fs.readdirSync(javaFolder);
    for (const sub of subDirsAfter) {
        const fullPath = path.join(javaFolder, sub, 'bin', javaExe);
        if (fs.existsSync(fullPath)) return fullPath;
    }

    throw new Error("Nie udało się odnaleźć pliku wykonywalnego Javy po instalacji.");
}

async function getJavaPath(mcVersion, event = null) {
    const config = getRequiredJava(mcVersion);
    return getJavaPathWithConfig(config, event);
}

async function getJavaPathForLoader(mcVersion, loaderType, event = null) {
    if (loaderType === 'neoforge') {
        return getJavaPathWithConfig(JAVA_CONFIG['21'], event);
    }
    return getJavaPath(mcVersion, event);
}

function getSystemJavaVersion() {
    try {
        const child = spawnSync('java', ['-version'], { encoding: 'utf-8' });
        const output = child.stderr || child.stdout;

        if (!output) return null;

        const versionMatch = output.match(/(?:java|openjdk) version "(\d+)/i);
        if (versionMatch) {
            const ver = parseInt(versionMatch[1]);
            return ver;
        }

        if (output.includes('version "1.8"')) return 8
    } catch (e) {
        console.warn(e);
        return null;
    }
    return null;
}

function buildLibraryArtifactInfo(lib) {
    const artifact = lib.downloads?.artifact;
    if (artifact?.path && artifact.url) {
        return { path: artifact.path, url: artifact.url };
    }

    if (!lib.name) return null;
    const [namePart, extPart] = String(lib.name).split('@');
    const parts = namePart.split(':');
    if (parts.length < 3) return null;

    const [group, artifactId, version, classifier] = parts;
    const ext = extPart || 'jar';
    const basePath = `${group.replace(/\./g, '/')}/${artifactId}/${version}/`;
    const fileName = `${artifactId}-${version}${classifier ? '-' + classifier : ''}.${ext}`;
    const path = basePath + fileName;
    const baseUrl = lib.url ? String(lib.url).replace(/\/?$/, '/') : 'https://libraries.minecraft.net/';
    return { path, url: baseUrl + path, baseUrl };
}

async function downloadLibraryWithFallbacks(info, lib, outputPath, event) {
    const candidates = [];
    if (info?.url) candidates.push(info.url);

    const base = info?.baseUrl || '';
    if (base.includes('files.minecraftforge.net/maven') || base.includes('maven.minecraftforge.net')) {
        candidates.push(`https://maven.minecraftforge.net/${info.path}`);
    }

    candidates.push(`https://libraries.minecraft.net/${info.path}`);
    candidates.push(`https://maven.minecraftforge.net/${info.path}`);

    const tried = new Set();
    for (const url of candidates) {
        if (!url || tried.has(url)) continue;
        tried.add(url);
        try {
            await downloadFile(url, outputPath, event);
            return true;
        } catch (e) {
            console.warn(`[LIBS] Failed to download ${url}: ${e.message}`);
        }
    }
    return false;
}

async function ensureLibrariesFromProfile(profile, gameRoot, event) {
    if (!profile || !Array.isArray(profile.libraries)) return;
    for (const lib of profile.libraries) {
        if (!isLibraryAllowed(lib)) continue;
        const info = buildLibraryArtifactInfo(lib);
        if (!info?.path || !info?.url) continue;
        const libPath = path.join(gameRoot, 'libraries', info.path);
        if (!fs.existsSync(libPath)) {
            if (!fs.existsSync(path.dirname(libPath))) fs.mkdirSync(path.dirname(libPath), { recursive: true });
            const ok = await downloadLibraryWithFallbacks(info, lib, libPath, event);
            if (!ok) {
                throw new Error(`Failed to download library ${info.path}`);
            }
        }
    }
}

async function setupJava(win, requiredVersion = 17) {
    if (fs.existsSync(JAVA_EXE)) {
        return JAVA_EXE;
    }

    updateStatus(win, "Sprawdzanie środowiska Java...");
    const systemVersion = getSystemJavaVersion();
    
    if (systemVersion >= requiredVersion) {
        console.log(`Znaleziono pasujaca Jave systemowa (v${systemVersion}).`);
        return 'java'; 
    }

    updateStatus(win, "Pobieranie środowiska Java...");

    const javaUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.8.1%2B1/OpenJDK17U-jre_x64_windows_hotspot_17.0.8.1_1.zip";
    const zipPath = path.join(LAUNCHER_PATH, 'java.zip');

    try {
        await downloadFile(javaUrl, zipPath, { sender: win.webContents });
        updateStatus(win, "Instalowanie Javy...");
        const zip = new AdmZip(zipPath);

        const zipEntries = zip.getEntries();
        const rootFolder = zipEntries[0].entryName.split('/')[0];

        zip.extractAllTo(LAUNCHER_PATH, true);

        const extractedPath = path.join(LAUNCHER_PATH, rootFolder);
        if (fs.existsSync(JAVA_DIR)) fs.rmSync(JAVA_DIR, { recursive: true });
        fs.renameSync(extractedPath, JAVA_DIR);

        fs.unlinkSync(zipPath);
        return JAVA_EXE;
    } catch (error) {
        console.error("Blad Javy:", error);
        updateStatus(win, 'Błąd podczas instalowania Javy!');
        throw error;
    }
}

function getAccounts() {
    if (fs.existsSync(accountsPath)) {
        return JSON.parse(fs.readFileSync(accountsPath, 'utf-8')); 
    }
    return [];
}

async function getFullModpackList() {
    try {
        if (!fs.existsSync(userPacksPath)) {
            USER_MODPACKS = [];
        } else {
            USER_MODPACKS = JSON.parse(fs.readFileSync(userPacksPath, 'utf-8'));
        }

        const res = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        const { latest, versions } = res.data;

        const vanillaVersions = {};
        const userPacks = {};

        versions.forEach(v => {
            if (v.type === 'release') {
                const isLatest = v.id === latest.release;
                const title = isLatest? `Najnowsza wersja (${v.id})` : `Vanilla - ${v.id}`;

                vanillaVersions[title] = {
                    "mcVersion": v.id,
                    "loader": null,
                    "zipName": null,
                    "folderName": "game",
                    "latest": isLatest
                }
            }
        });

        USER_MODPACKS.forEach(uPack => {
            userPacks[uPack.name] = {
                "mcVersion": uPack.mcVersion,
                "id": uPack.id,
                "loader": uPack.loader,
                "zipName": null,
                "folderName": uPack.folderName,
                "isCustom": true
            }
        });
        return Object.assign({}, MODPACKS, vanillaVersions, userPacks);
    } catch (err) {
        console.error("Error while fetching the Minecraft verison:", err);
        return MODPACKS;
    }
}

function saveAccounts(accounts) {
    fs.writeFileSync(accountsPath, JSON.stringify(accounts, null, 4));
}

function loadConfig() {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath));
    }
    return {nick: '', ram: 4, version: '1.21.10'};
}

function createTray(win) {
    if (tray) return;
    tray = new Tray(path.join(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Otwórz HavenLauncher', click: () => win.show() },
        { type: 'separator' },
        { label: 'Zakończ', click: () => {
            app.isQuitting = true;
            app.quit();
        }}
    ]);
    tray.setToolTip('HavenLauncher');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => win.show());
}

function validateConfigs() {
    const defaultConfig = { 
        ram: 4, 
        minimizeToTray: false, 
        tyldaConsole: false, 
        particlesEnabled: true,
        soundsEnabled: true,
        version: 'HavenPack 1.20.4' 
    };

    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 4));
    } else {
        try {
            JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch (e) {
            // Jeśli plik jest uszkodzony (np. nagłe wyłączenie kompa), nadpisz domyślnym
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 4));
        }
    }
}
validateConfigs();

function cleanupPartialDownloads() {
    if (activeDownloads.size === 0) return;
    for (const filePath of activeDownloads) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (err) {
            console.warn('[DOWNLOAD CLEANUP] Failed to remove partial file:', filePath, err?.message || err);
        }
    }
    activeDownloads.clear();
}

function showTrayNotif() {
    if (Notification.isSupported()) {
        const notif = new Notification({
            title: "HavenLauncher",
            body: 'Gra się uruchamia. Launcher działa teraz w tle.',
            silent: false,
            icon: path.join(__dirname, 'icon.png')
        });
        notif.show();
    }
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        frame: false,
        resizable: false
    });
    //win.webContents.openDevTools();
    win.loadFile('index.html');

    win.webContents.on('did-finish-load', async () => {
        if (app.isPackaged) {
            await setupAutoUpdater(win);
        } else {
            updateStatus(win, 'Pomijam sprawdzanie aktualizacji...');
        }
        let javaPathToUse;
        try {
            javaPathToUse = await setupJava(win, 17);
        } catch (err) {
            console.error(err);
            return;
        }
        updateStatus(win, 'Ładowanie ustawień...')
        win.webContents.send('load-settings', loadConfig());
        updateStatus(win, 'Pobieranie listy modyfikacji...');
        getFullModpackList().then(allPacks => {
            ALL_MODPACKS = allPacks;
            win.webContents.send('load-modpacks', ALL_MODPACKS);
            updateStatus(win, 'Witaj ponownie!');
            win.webContents.send('app-ready', {
                appVersion: app.getVersion()
            });
        });
    });
}

function createLogWindow() {
    logWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        title: "HavenLauncher - Konsola",
        backgroundColor: "#000000",
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true
        },
        frame: false
    });
    logWindow.loadFile('logs.html');
    logWindow.webContents.on('did-finish-load', async () => {
        logWindow.webContents.send('load-settings', loadConfig());
        if (logQueue.length > 0) {
            flushLogQueue();
        }
    })
    logWindow.on('closed', () => {logWindow = null;});
}

async function getFabricProfile(mcVersion, loaderVersion = null) {
    try {
        if (!loaderVersion) {
            const loaderUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
            const loaders = (await axios.get(loaderUrl)).data;
            if (!loaders || loaders.length === 0) return null;

            loaderVersion = loaders[0].loader.version;
        }
        if (String(loaderVersion).startsWith('fabric-')) loaderVersion = String(loaderVersion).replace('fabric-', '');
        console.log(`LoaderVersion: ${loaderVersion}`)
        const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
        const profileResponse = await axios.get(profileUrl);

        return {
            id: `fabric-loader-${loaderVersion}-${mcVersion}`,
            data: profileResponse.data
        };
    } catch (err) {
        console.error("Błąd pobierania profilu Fabric:", err);
        return null;
    }
}

async function setupFabric(version, instanceFolder, loaderVersion = null) {
    const profile = await getFabricProfile(version, loaderVersion);
    if (!profile) return false;

    const versionDir    = path.join(instanceFolder, 'versions', profile.id);
    const jsonPath      = path.join(versionDir, `${profile.id}.json`);

    if (!fs.existsSync(versionDir)) {
        fs.mkdirSync(versionDir, { recursive: true });
    }

    fs.writeFileSync(jsonPath, JSON.stringify(profile.data, null, 4));
    return profile.id;
}

async function installFabricApi(mcVersion, instanceFolder) {
    const FabricAPI_ID = 306612;
    const modsDir = path.join(instanceFolder, 'mods');

    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

    try {
        const res = await axios.get(`https://api.curseforge.com/v1/mods/${FabricAPI_ID}/files?gameVersion=${mcVersion}&modLoaderType=4`, {
            headers: { 'x-api-key': CF_API_KEY }
        });

        const file = res.data.data.find(f => f.releaseType === 1) || res.data.data[0];

        if (file) {
            const outputPath = path.join(modsDir, file.fileName);
            await downloadFile(file.downloadUrl, outputPath);
            return true;
        }
    } catch (error) {
        console.error(error);
    }
    return false;
}

// Helper to construct classpath from JSON profile
function isLibraryAllowed(lib) {
    if (!lib.rules || !Array.isArray(lib.rules)) return true;
    const osName = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'osx' : 'linux');
    let allowed = false;
    for (const rule of lib.rules) {
        const ruleOs = rule.os?.name;
        const matchesOs = !ruleOs || ruleOs === osName;
        if (!matchesOs) continue;
        if (rule.action === 'allow') allowed = true;
        if (rule.action === 'disallow') allowed = false;
    }
    return allowed;
}

function buildClassPathFromProfiles(profiles, gameRoot) {
    try {
        const libPaths = [];
        const seen = new Set();
        let chosenJopt = null;
        const isPreRelease = (name) => /alpha|beta|rc/i.test(name);

        for (const profile of profiles) {
            if (!profile || !profile.libraries) continue;

            for (const lib of profile.libraries) {
                if (!isLibraryAllowed(lib)) continue;

                const artifactInfo = buildLibraryArtifactInfo(lib);
                if (!artifactInfo || !artifactInfo.path) continue;

                const libName = lib.name || '';
                if (libName.includes('jopt-simple')) {
                    const libPath = path.join(gameRoot, 'libraries', artifactInfo.path);
                    if (!fs.existsSync(libPath)) continue;
                    if (!chosenJopt) {
                        chosenJopt = { path: libPath, name: libName };
                    } else {
                        const currentIsPre = isPreRelease(chosenJopt.name);
                        const nextIsPre = isPreRelease(libName);
                        if (currentIsPre && !nextIsPre) {
                            chosenJopt = { path: libPath, name: libName };
                        }
                    }
                    continue;
                }

                const libPath = path.join(gameRoot, 'libraries', artifactInfo.path);
                if (fs.existsSync(libPath) && !seen.has(libPath)) {
                    seen.add(libPath);
                    libPaths.push(libPath);
                }
            }

            // Add version jar for each profile (if present)
            if (profile.id) {
                const versionJar = path.join(gameRoot, 'versions', profile.id, `${profile.id}.jar`);
                if (fs.existsSync(versionJar) && !seen.has(versionJar)) {
                    seen.add(versionJar);
                    libPaths.push(versionJar);
                }
            }
        }

        if (chosenJopt && !seen.has(chosenJopt.path)) {
            seen.add(chosenJopt.path);
            libPaths.push(chosenJopt.path);
        }

        return libPaths.join(path.delimiter); // Windows uses ';'
    } catch (err) {
        console.error('[CLASSPATH] Error building classpath:', err);
        return '';
    }
}

async function ensureVanillaVersion(mcVersion, gameRoot, event) {
    const versionsDir = path.join(gameRoot, 'versions');
    const versionDir = path.join(versionsDir, mcVersion);
    const versionJsonPath = path.join(versionDir, `${mcVersion}.json`);

    if (!fs.existsSync(versionJsonPath)) {
        console.log(`[VANILLA] Missing base version ${mcVersion}. Downloading version JSON...`);
        const manifest = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        const versionEntry = manifest.data.versions.find(v => v.id === mcVersion);
        if (!versionEntry) {
            throw new Error(`Vanilla version ${mcVersion} not found in manifest`);
        }
        if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });
        await downloadFile(versionEntry.url, versionJsonPath, event);
    }

    const versionProfile = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));

    // Download client jar
    const clientJarPath = path.join(versionDir, `${mcVersion}.jar`);
    if (!fs.existsSync(clientJarPath) && versionProfile.downloads?.client?.url) {
        console.log(`[VANILLA] Downloading client jar for ${mcVersion}...`);
        await downloadFile(versionProfile.downloads.client.url, clientJarPath, event);
    }

    // Download asset index (objects may already exist)
    if (versionProfile.assetIndex?.url && versionProfile.assetIndex?.id) {
        const indexesDir = path.join(gameRoot, 'assets', 'indexes');
        const indexPath = path.join(indexesDir, `${versionProfile.assetIndex.id}.json`);
        if (!fs.existsSync(indexesDir)) fs.mkdirSync(indexesDir, { recursive: true });
        if (!fs.existsSync(indexPath)) {
            console.log(`[VANILLA] Downloading asset index ${versionProfile.assetIndex.id}...`);
            await downloadFile(versionProfile.assetIndex.url, indexPath, event);
        }
        const assetsMarker = path.join(gameRoot, 'assets', `.index-${versionProfile.assetIndex.id}.complete`);
        if (!fs.existsSync(assetsMarker)) {
            await ensureAssetsFromIndex(indexPath, gameRoot, event);
            try {
                fs.writeFileSync(assetsMarker, new Date().toISOString());
            } catch (e) {
                console.warn(`[VANILLA] Failed to write assets marker: ${e.message}`);
            }
        }
    }

    // Download libraries and extract natives
    if (Array.isArray(versionProfile.libraries)) {
        const osName = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'osx' : 'linux');
        const arch = process.arch === 'x64' ? '64' : (process.arch === 'ia32' ? '32' : process.arch);
        const nativesDir = path.join(gameRoot, 'natives');
        if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });

        for (const lib of versionProfile.libraries) {
            if (!isLibraryAllowed(lib)) continue;

            const artifact = lib.downloads?.artifact;
            if (artifact?.path && artifact.url) {
                const libPath = path.join(gameRoot, 'libraries', artifact.path);
                if (!fs.existsSync(libPath)) {
                    if (!fs.existsSync(path.dirname(libPath))) fs.mkdirSync(path.dirname(libPath), { recursive: true });
                    await downloadFile(artifact.url, libPath, event);
                }
            }

            if (lib.natives && lib.natives[osName]) {
                const classifierKey = String(lib.natives[osName]).replace('${arch}', arch);
                const nativeInfo = lib.downloads?.classifiers?.[classifierKey];
                if (nativeInfo?.path && nativeInfo.url) {
                    const nativeJarPath = path.join(gameRoot, 'libraries', nativeInfo.path);
                    if (!fs.existsSync(nativeJarPath)) {
                        if (!fs.existsSync(path.dirname(nativeJarPath))) fs.mkdirSync(path.dirname(nativeJarPath), { recursive: true });
                        await downloadFile(nativeInfo.url, nativeJarPath, event);
                    }

                    try {
                        const zip = new AdmZip(nativeJarPath);
                        for (const entry of zip.getEntries()) {
                            if (entry.isDirectory) continue;
                            if (entry.entryName.startsWith('META-INF/')) continue;
                            zip.extractEntryTo(entry, nativesDir, false, true);
                        }
                    } catch (e) {
                        console.warn(`[VANILLA] Failed to extract natives from ${nativeJarPath}: ${e.message}`);
                    }
                }
            }
        }
    }
}

async function ensureAssetsFromIndex(indexPath, gameRoot, event) {
    try {
        if (!fs.existsSync(indexPath)) return;
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const objects = index.objects || {};
        const objectEntries = Object.values(objects);

        if (!objectEntries.length) return;

        const objectsDir = path.join(gameRoot, 'assets', 'objects');
        if (!fs.existsSync(objectsDir)) fs.mkdirSync(objectsDir, { recursive: true });

        console.log(`[ASSETS] Ensuring ${objectEntries.length} asset objects...`);

        let completed = 0;
        const concurrency = 8;
        let currentIndex = 0;

        const downloadNext = async () => {
            while (currentIndex < objectEntries.length) {
                const entry = objectEntries[currentIndex++];
                const hash = entry && entry.hash;
                if (!hash || hash.length < 2) {
                    completed++;
                    continue;
                }

                const subdir = hash.substring(0, 2);
                const objectPath = path.join(objectsDir, subdir, hash);
                if (fs.existsSync(objectPath)) {
                    completed++;
                    continue;
                }

                if (!fs.existsSync(path.dirname(objectPath))) {
                    fs.mkdirSync(path.dirname(objectPath), { recursive: true });
                }

                const url = `https://resources.download.minecraft.net/${subdir}/${hash}`;
                try {
                    await downloadFile(url, objectPath, event);
                } catch (e) {
                    console.warn(`[ASSETS] Failed to download ${hash}: ${e.message}`);
                }

                completed++;
                if (completed % 1000 === 0) {
                    console.log(`[ASSETS] Progress ${completed}/${objectEntries.length}`);
                }
            }
        };

        const workers = [];
        for (let i = 0; i < concurrency; i++) {
            workers.push(downloadNext());
        }
        await Promise.all(workers);

        console.log('[ASSETS] Asset objects check completed.');
    } catch (e) {
        console.error('[ASSETS] Error while ensuring assets:', e.message);
    }
}

async function ensureAssetsForVersion(mcVersion, gameRoot, event) {
    try {
        const versionsDir = path.join(gameRoot, 'versions');
        const versionDir = path.join(versionsDir, mcVersion);
        const versionJsonPath = path.join(versionDir, `${mcVersion}.json`);

        if (!fs.existsSync(versionJsonPath)) {
            await ensureVanillaVersion(mcVersion, gameRoot, event);
            return;
        }

        const versionProfile = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'));
        if (versionProfile.assetIndex?.url && versionProfile.assetIndex?.id) {
            const indexesDir = path.join(gameRoot, 'assets', 'indexes');
            const indexPath = path.join(indexesDir, `${versionProfile.assetIndex.id}.json`);
            if (!fs.existsSync(indexesDir)) fs.mkdirSync(indexesDir, { recursive: true });
            if (!fs.existsSync(indexPath)) {
                console.log(`[ASSETS] Downloading asset index ${versionProfile.assetIndex.id}...`);
                await downloadFile(versionProfile.assetIndex.url, indexPath, event);
            }
            const assetsMarker = path.join(gameRoot, 'assets', `.index-${versionProfile.assetIndex.id}.complete`);
            if (!fs.existsSync(assetsMarker)) {
                await ensureAssetsFromIndex(indexPath, gameRoot, event);
                try {
                    fs.writeFileSync(assetsMarker, new Date().toISOString());
                } catch (e) {
                    console.warn(`[ASSETS] Failed to write assets marker: ${e.message}`);
                }
            }
        }
    } catch (e) {
        console.error('[ASSETS] Error while ensuring assets for version:', e.message);
    }
}

function resolveArgumentValues(arg, vars, features = {}) {
    const replaceVars = (val) => val.replace(/\$\{([^}]+)\}/g, (m, key) => {
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : m;
    });

    if (typeof arg === 'string') return [replaceVars(arg)];
    if (!arg || typeof arg !== 'object') return [];

    // Handle rules if present (minimal OS-aware handling)
    if (arg.rules && Array.isArray(arg.rules)) {
        const osName = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'osx' : 'linux');
        let allowed = false;
        for (const rule of arg.rules) {
            const ruleOs = rule.os?.name;
            const matchesOs = !ruleOs || ruleOs === osName;
            const ruleFeatures = rule.features || {};
            const featuresMatch = Object.keys(ruleFeatures).every(
                key => Boolean(features[key]) === Boolean(ruleFeatures[key])
            );
            const matches = matchesOs && featuresMatch;
            if (rule.action === 'allow' && matches) allowed = true;
            if (rule.action === 'disallow' && matches) return [];
        }
        if (!allowed) return [];
    }

    if (Array.isArray(arg.value)) return arg.value.map(replaceVars);
    if (typeof arg.value === 'string') return [replaceVars(arg.value)];
    return [];
}

function getLibraryPathsByName(profiles, gameRoot, nameMatchers) {
    const paths = [];
    const seen = new Set();
    let chosenJopt = null;
    const isPreRelease = (name) => /alpha|beta|rc/i.test(name);

    for (const profile of profiles) {
        if (!profile || !profile.libraries) continue;
        for (const lib of profile.libraries) {
            if (!isLibraryAllowed(lib)) continue;
            const name = lib.name || '';
            if (!nameMatchers.some(m => name.includes(m))) continue;
            const artifact = lib.downloads?.artifact;
            if (!artifact?.path) continue;

            if (name.includes('jopt-simple')) {
                const p = path.join(gameRoot, 'libraries', artifact.path);
                if (!fs.existsSync(p)) continue;
                if (!chosenJopt) {
                    chosenJopt = { path: p, name };
                } else {
                    const currentIsPre = isPreRelease(chosenJopt.name);
                    const nextIsPre = isPreRelease(name);
                    if (currentIsPre && !nextIsPre) {
                        chosenJopt = { path: p, name };
                    }
                }
                continue;
            }

            const p = path.join(gameRoot, 'libraries', artifact.path);
            if (fs.existsSync(p) && !seen.has(p)) {
                seen.add(p);
                paths.push(p);
            }
        }
    }

    if (chosenJopt && !seen.has(chosenJopt.path)) {
        seen.add(chosenJopt.path);
        paths.push(chosenJopt.path);
    }

    return paths;
}

async function ensureLoggingConfig(profile, gameRoot, event) {
    const logging = profile?.logging?.client;
    if (!logging || !logging.file?.id || !logging.file?.url) return null;

    const logDir = path.join(gameRoot, 'assets', 'log_configs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, logging.file.id);

    if (!fs.existsSync(logPath)) {
        try {
            await downloadFile(logging.file.url, logPath, event);
        } catch (e) {
            console.warn(`[LOGGING] Failed to download log config: ${e.message}`);
        }
    }

    return logPath;
}

function normalizeGameLogLine(line) {
    if (!line) return null;
    const trimmed = String(line).trim();
    if (!trimmed) return null;

    const cdataStart = trimmed.indexOf('<![CDATA[');
    if (cdataStart !== -1) {
        const cdataEnd = trimmed.indexOf(']]>', cdataStart);
        if (cdataEnd !== -1) {
            const msg = trimmed.substring(cdataStart + 9, cdataEnd).trim();
            return msg || null;
        }
    }

    if (trimmed.startsWith('<log4j:') || trimmed.startsWith('</log4j:')) {
        return null;
    }

    return trimmed;
}

function detectNeoForgeMods(instanceFolder) {
    try {
        const modsDir = path.join(instancesPath, instanceFolder, 'mods');
        if (!fs.existsSync(modsDir)) return false;
        const files = fs.readdirSync(modsDir);
        return files.some(file => {
            if (!file.endsWith('.jar')) return false;
            if (file.endsWith('.disabled.jar') || file.endsWith('.jar.disabled')) return false;
            return /(^|[-_.])neoforge([-.]|$)/i.test(file) || /(^|[-_.])neo([-.]|$)/i.test(file);
        });
    } catch (e) {
        console.error('[MODS] Error while detecting NeoForge mods:', e.message);
        return false;
    }
}

function getEffectiveLoader(pack) {
    if (!pack || !pack.loader) return 'vanilla';
    const loaderValue = String(pack.loader).toLowerCase();
    if (loaderValue.includes('neoforge')) return 'neoforge';
    if (loaderValue.includes('fabric')) return 'fabric';
    if (loaderValue.includes('forge')) return 'forge';
    if (pack.folderName && detectNeoForgeMods(pack.folderName)) return 'neoforge';
    return 'custom';
}

async function findForgeReplacementForProject(projectId, mcVersion) {
    try {
        const res = await axios.get(`https://api.curseforge.com/v1/mods/${projectId}/files`, {
            headers: { 'x-api-key': CF_API_KEY },
            params: {
                gameVersion: mcVersion,
                modLoaderType: 1
            }
        });
        const files = res.data?.data || [];
        if (!files.length) return null;

        const sorted = files.slice().sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate));
        return sorted[0] || null;
    } catch (e) {
        console.error(`[CF] Failed to find Forge replacement for project ${projectId}:`, e.message);
        return null;
    }
}

function tryAutoDisableModuleConflict(instanceFolder, line) {
    try {
        if (!instanceFolder || !line) return false;
        const match = String(line).match(/to module\s+([A-Za-z0-9_.-]+)/i);
        if (!match) return false;
        const moduleName = match[1];

        const modsDir = path.join(instancesPath, instanceFolder, 'mods');
        if (!fs.existsSync(modsDir)) return false;

        const normalize = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = normalize(moduleName);
        if (!target) return false;

        const files = fs.readdirSync(modsDir);
        for (const file of files) {
            if (!file.endsWith('.jar')) continue;
            if (file.endsWith('.disabled.jar') || file.endsWith('.jar.disabled')) continue;

            const base = normalize(path.basename(file, '.jar'));
            if (!base || !base.includes(target)) continue;

            const from = path.join(modsDir, file);
            const to = from + '.disabled';
            try {
                fs.renameSync(from, to);
                const msg = `[MODS] Auto-disabled ${file} due to module conflict (${moduleName}). Restart required.`;
                console.warn(msg);
                queueLogToWindow(msg);
                return true;
            } catch (e) {
                console.error(`[MODS] Failed to auto-disable ${file}: ${e.message}`);
            }
        }
    } catch (e) {
        console.error('[MODS] Error while auto-disabling module conflict:', e.message);
    }
    return false;
}

async function spawnForgeGame(opts) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('[FORGE-SPAWN] Starting spawnForgeGame...');
            const { javaPath, gameRoot, gameDir, versionId, ramGB, authToken, uuid, username, forgeArgs, instanceFolder, mcVersion } = opts;
            console.log(`[FORGE-SPAWN] Options received: versionId=${versionId}, javaPath=${javaPath}`);
            
            console.log('[FORGE-SPAWN] Constructing version JSON path...');
            const versionJsonPath = path.join(gameRoot, 'versions', versionId, `${versionId}.json`);
            console.log(`[FORGE-SPAWN] Version JSON path: ${versionJsonPath}`);
            
            if (!fs.existsSync(versionJsonPath)) {
                const err = new Error(`Version JSON file not found at: ${versionJsonPath}`);
                console.error('[FORGE-SPAWN]', err.message);
                return reject(err);
            }
            
            console.log('[FORGE-SPAWN] Reading and parsing version JSON...');
            const profileContent = fs.readFileSync(versionJsonPath, 'utf-8');
            console.log(`[FORGE-SPAWN] JSON file size: ${profileContent.length} bytes`);
            const profile = JSON.parse(profileContent);
            console.log('[FORGE-SPAWN] JSON parsed successfully');

            let baseProfile = null;
            if (profile.inheritsFrom) {
                const baseJsonPath = path.join(gameRoot, 'versions', profile.inheritsFrom, `${profile.inheritsFrom}.json`);
                if (fs.existsSync(baseJsonPath)) {
                    try {
                        baseProfile = JSON.parse(fs.readFileSync(baseJsonPath, 'utf-8'));
                        console.log(`[FORGE-SPAWN] Loaded base profile: ${profile.inheritsFrom}`);
                    } catch (e) {
                        console.warn('[FORGE-SPAWN] Failed to parse base profile JSON:', e.message);
                    }
                } else {
                    console.warn(`[FORGE-SPAWN] Base profile JSON not found: ${baseJsonPath}`);
                }
            }
            let vanillaProfile = null;
            if (mcVersion) {
                const vanillaJsonPath = path.join(gameRoot, 'versions', mcVersion, `${mcVersion}.json`);
                if (fs.existsSync(vanillaJsonPath)) {
                    try {
                        vanillaProfile = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf-8'));
                        console.log(`[FORGE-SPAWN] Loaded vanilla profile: ${mcVersion}`);
                    } catch (e) {
                        console.warn('[FORGE-SPAWN] Failed to parse vanilla profile JSON:', e.message);
                    }
                }
            }

            const librariesPath = path.join(gameRoot, 'libraries');
            const assetsPath = path.join(gameRoot, 'assets');
            const assetsIndexPath = path.join(assetsPath, 'indexes');
            
            const mainClass = profile.mainClass || 'net.minecraft.client.main.Main';
            console.log('[FORGE-SPAWN] Building classpath...');
            const profilesForClasspath = [];
            if (vanillaProfile) profilesForClasspath.push(vanillaProfile);
            if (baseProfile) profilesForClasspath.push(baseProfile);
            profilesForClasspath.push(profile);
            let classpath = buildClassPathFromProfiles(profilesForClasspath, gameRoot);

            const isJava8 = typeof javaPath === 'string' && /\\java8\\|jdk8|1\.8/i.test(javaPath);
            
            // Fix for ResolutionException (Split Package) on newer Forge (1.17+)
            if (!isJava8 && mcVersion) {
                const vanillaJar = path.join(gameRoot, 'versions', mcVersion, `${mcVersion}.jar`);
                if (classpath.includes(vanillaJar)) {
                    console.log(`[FORGE-SPAWN] Removing vanilla jar from classpath to prevent split package: ${vanillaJar}`);
                    classpath = classpath.split(path.delimiter).filter(p => p !== vanillaJar).join(path.delimiter);
                }
            }
            console.log(`[FORGE-SPAWN] Classpath built: ${classpath.length} chars`);
            
            console.log(`[FORGE-SPAWN] Constructing command for: ${versionId}`);
            console.log(`[FORGE-SPAWN] Main class: ${mainClass}`);
            console.log(`[FORGE-SPAWN] Libraries path: ${librariesPath}`);

            // Ensure logging config is available and build path for ${path} replacement
            const logConfigPath = await ensureLoggingConfig(baseProfile || profile, gameRoot, opts.event);

            const vars = {
                library_directory: librariesPath,
                classpath_separator: path.delimiter,
                version_name: versionId,
                game_directory: gameDir,
                assets_root: assetsPath,
                assets_index_name: profile.assets || baseProfile?.assets || '1.20.1',
                auth_player_name: username,
                auth_uuid: uuid,
                auth_access_token: authToken,
                user_type: 'mojang',
                version_type: profile.type || baseProfile?.type || 'release',
                auth_xuid: '',
                clientid: '',
                classpath: classpath,
                path: logConfigPath || ''
            };

            const features = {
                is_demo_user: false,
                has_custom_resolution: false,
                has_quick_plays_support: false,
                is_quick_play_singleplayer: false,
                is_quick_play_multiplayer: false,
                is_quick_play_realms: false
            };

            const collectArgs = (args, legacyArgs) => {
                const result = [];
                if (Array.isArray(args)) {
                    for (const a of args) {
                        result.push(...resolveArgumentValues(a, vars, features));
                    }
                } else if (typeof legacyArgs === 'string') {
                    const parts = legacyArgs.split(' ').filter(Boolean);
                    for (const part of parts) {
                        result.push(...resolveArgumentValues(part, vars, features));
                    }
                }
                return result;
            };

            const baseJvmArgs = collectArgs(baseProfile?.arguments?.jvm, null);
            const baseGameArgs = collectArgs(baseProfile?.arguments?.game, baseProfile?.minecraftArguments);
            const profileJvmArgs = collectArgs(profile?.arguments?.jvm, null);
            const profileGameArgs = collectArgs(profile?.arguments?.game, profile?.minecraftArguments);

            const loggingArg = baseProfile?.logging?.client?.argument || profile?.logging?.client?.argument;
            const loggingJvmArgs = loggingArg ? resolveArgumentValues(loggingArg, vars) : [];
            
            const jvmArgs = [
                `-Xmx${ramGB}G`,
                `-Xms2G`,
                `-XX:+UseG1GC`,
                `-XX:MaxGCPauseMillis=30`,
                `-XX:+ParallelRefProcEnabled`,
                `-XX:G1ReservePercent=20`,
                `-XX:G1HeapRegionSize=16M`,
                
                // Forge properties
                `-Djava.library.path=${path.join(gameRoot, 'natives')}`,
                `-Dminecraft.launcher.brand=HavenLauncher`,
                `-Dminecraft.launcher.version=0.6.1-beta`,
                `-Dlog4j.configurationFile=${path.join(gameRoot, 'settings', 'logging.xml')}`,
                
                // Try bootstrap libs property
                `-Dbootstrap.libs=${librariesPath}`,
                
                ...baseJvmArgs,
                ...profileJvmArgs,
                ...loggingJvmArgs,
                ...(forgeArgs || []),
            ];

            const filteredJvmArgs = [];
            for (let i = 0; i < jvmArgs.length; i++) {
                const arg = jvmArgs[i];
                if (!arg) continue;
                if (typeof arg === 'string') {
                    if (arg.startsWith('--sun-misc-unsafe-memory-access=')) continue;
                    if (isJava8 && arg === '--add-opens') {
                        i += 1; // skip the module target as well
                        continue;
                    }
                }
                filteredJvmArgs.push(arg);
            }
            
            if (!classpath) {
                console.warn('[FORGE-SPAWN] Warning: empty classpath');
            }
            
            const gameArgs = [...baseGameArgs, ...profileGameArgs];

            const hasOption = (opt) => {
                const idx = gameArgs.indexOf(opt);
                return idx !== -1 && typeof gameArgs[idx + 1] !== 'undefined';
            };

            // Drop any args with unresolved placeholders
            for (let i = gameArgs.length - 1; i >= 0; i--) {
                if (typeof gameArgs[i] === 'string' && gameArgs[i].includes('${')) {
                    gameArgs.splice(i, 1);
                }
            }

            // Remove options that require a value but are missing one
            const requiresValue = new Set([
                '--width',
                '--height',
                '--quickPlayPath',
                '--quickPlaySingleplayer',
                '--quickPlayMultiplayer',
                '--quickPlayRealms'
            ]);
            for (let i = 0; i < gameArgs.length; i++) {
                const opt = gameArgs[i];
                if (requiresValue.has(opt)) {
                    if (typeof gameArgs[i + 1] === 'undefined' || gameArgs[i + 1].startsWith('--')) {
                        gameArgs.splice(i, 1);
                        i -= 1;
                    }
                }
            }

            // Deduplicate single-value options (legacy LaunchWrapper is strict)
            const singleValueOptions = new Set([
                '--gameDir',
                '--assetsDir',
                '--assetIndex',
                '--version',
                '--uuid',
                '--accessToken',
                '--userType',
                '--username',
                '--clientId',
                '--xuid'
            ]);
            const seenSingle = new Set();
            for (let i = gameArgs.length - 2; i >= 0; i--) {
                const opt = gameArgs[i];
                if (!singleValueOptions.has(opt)) continue;
                const key = opt;
                if (seenSingle.has(key)) {
                    gameArgs.splice(i, 2);
                    continue;
                }
                seenSingle.add(key);
            }

            // Ensure critical auth fields exist (without duplicating)
            if (!hasOption('--username')) gameArgs.push('--username', username);
            if (!hasOption('--uuid')) gameArgs.push('--uuid', uuid);
            if (!hasOption('--accessToken')) gameArgs.push('--accessToken', authToken);
            if (!hasOption('--userType')) gameArgs.push('--userType', 'mojang');
            
            const args = [...filteredJvmArgs];

            // Nowszy Forge (1.17+) używa module-path w argumentach profilu.
            // Wymuszenie pełnego -cp powoduje konflikty (scanning mod candidates crash).
            const hasClassPath = args.some(x => x === '-cp' || x === '-classpath' || x === '--class-path');
            const hasModulePath = args.some(x => x === '-p' || x === '--module-path');

            if (!hasClassPath && !hasModulePath) {
                args.push('-cp', classpath);
            }
            
            args.push(mainClass, ...gameArgs);
            
            console.log(`[FORGE-SPAWN] Spawning Java: ${javaPath}`);
            console.log(`[FORGE-SPAWN] With ${args.length} arguments`);
            console.log(`[FORGE-SPAWN] CWD: ${gameDir}`);
            console.log(`[FORGE-SPAWN] First argument: ${filteredJvmArgs[0]}`);
            console.log(`[FORGE-SPAWN] Main class index in args: ${args.indexOf(mainClass)}`);
            
            const child = spawn(javaPath, args, {
                cwd: gameDir,
                detached: false,
                stdio: ['pipe', 'pipe', 'pipe']
            });
            
            console.log(`[FORGE-SPAWN] Process spawned with PID: ${child.pid}`);
            
            child.stdout.on('data', (data) => {
                const lines = data.toString().split(/\r?\n/).filter(l => l.trim());
                lines.forEach(line => {
                    const normalized = normalizeGameLogLine(line);
                    if (!normalized) return;
                    //tryAutoDisableModuleConflict(instanceFolder, normalized);
                    console.log(`[GAME] ${normalized}`);
                    queueLogToWindow(normalized);
                });
            });
            
            child.stderr.on('data', (data) => {
                const lines = data.toString().split(/\r?\n/).filter(l => l.trim());
                lines.forEach(line => {
                    const normalized = normalizeGameLogLine(line);
                    if (!normalized) return;
                    //tryAutoDisableModuleConflict(instanceFolder, normalized);
                    console.error(`[GAME] ${normalized}`);
                    queueLogToWindow(`[ERROR] ${normalized}`);
                });
            });
            
            child.on('error', (err) => {
                console.error(`[FORGE-SPAWN] Process error: ${err.message}`, err);
            });
            
            console.log('[FORGE-SPAWN] Resolving with child process');
            resolve(child);
        } catch (err) {
            console.error('[FORGE-SPAWN] Exception caught:', err);
            console.error('[FORGE-SPAWN] Error message:', err?.message);
            console.error('[FORGE-SPAWN] Error stack:', err?.stack);
            console.error('[FORGE-SPAWN] Full error object:', JSON.stringify(err, null, 2));
            reject(new Error(`Failed to spawn Forge: ${err?.message || JSON.stringify(err)}`));
        }
    });
}

async function getForgeVersion(mcVersion) {
    try {
        const url = 'https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json';
        console.log(`[FORGE-VERSION] Fetching for MC ${mcVersion} from ${url}`);
        const res = await axios.get(url);
        const promos = res.data.promos;

        let forgeVer = promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`];
        console.log(`[FORGE-VERSION] Found version: ${forgeVer || 'NONE'}`);
        
        if (!forgeVer) {
            const availableVersions = Object.keys(promos).filter(k => k.includes(mcVersion)).slice(0, 5);
            console.warn(`[FORGE-VERSION] No exact match. Available keys: ${availableVersions.join(', ')}`);
        }
        
        return forgeVer;
    } catch (err) {
        console.error("[FORGE-VERSION] Error fetching Forge version:", err.message);
        return null;
    }
}

async function getNeoForgeVersion(mcVersion) {
    try {
        const url = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';
        console.log(`[NEOFORGE-VERSION] Fetching for MC ${mcVersion} from ${url}`);
        const res = await axios.get(url);
        const xml = res.data || '';
        const versions = [...String(xml).matchAll(/<version>([^<]+)<\/version>/g)]
            .map(m => m[1])
            .filter(Boolean);

        if (!versions.length) return null;

        const mcParts = String(mcVersion).split('.');
        const prefix = mcParts.length >= 3 ? `${mcParts[1]}.${mcParts[2]}` : mcParts.slice(1).join('.');

        const releaseMatch = String(xml).match(/<release>([^<]+)<\/release>/);
        if (releaseMatch && releaseMatch[1] && releaseMatch[1].startsWith(prefix + '.')) {
            console.log(`[NEOFORGE-VERSION] Using release: ${releaseMatch[1]}`);
            return releaseMatch[1];
        }

        const candidates = versions.filter(v => v.startsWith(prefix + '.'));
        const chosen = candidates.length ? candidates[candidates.length - 1] : versions[versions.length - 1];
        console.log(`[NEOFORGE-VERSION] Selected: ${chosen}`);
        return chosen;
    } catch (err) {
        console.error('[NEOFORGE-VERSION] Error fetching NeoForge version:', err.message);
        return null;
    }
}

async function legacyInstallForgeFromInstaller(installerPath, mcVersion, forgeVersion, gameRoot, event) {
    try {
        const zip = new AdmZip(installerPath);
        const entry = zip.getEntry('install_profile.json');
        if (!entry) {
            throw new Error('install_profile.json not found in Forge installer');
        }

        const profile = JSON.parse(entry.getData().toString('utf-8'));
        const versionInfo = profile.versionInfo || profile.version || profile;
        const versionId = versionInfo.id || `${mcVersion}-forge-${forgeVersion}`;

        const versionDir = path.join(gameRoot, 'versions', versionId);
        if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

        const versionJsonPath = path.join(versionDir, `${versionId}.json`);
        fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo, null, 2));

        const universalUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-universal.jar`;
        const versionJarPath = path.join(versionDir, `${versionId}.jar`);
        if (!fs.existsSync(versionJarPath)) {
            await downloadFile(universalUrl, versionJarPath, event);
        }

        await ensureLibrariesFromProfile(versionInfo, gameRoot, event);

        return versionId;
    } catch (e) {
        console.error('[FORGE] Legacy install failed:', e.message);
        throw e;
    }
}

async function setupForge(version, gameRoot, forgeVersion = null, event, javaPath) {
    try {
        if (!forgeVersion) {
            console.log('[FORGE] Version not provided, fetching latest...');
            forgeVersion = await getForgeVersion(version);
        }
        if (!forgeVersion) throw new Error('Forge version not found for ' + version);
        
        console.log(`[FORGE] Installing Forge v${forgeVersion} for MC ${version}`);
        
        // Ensure game root structure exists
        if (!fs.existsSync(gameRoot)) {
            fs.mkdirSync(gameRoot, { recursive: true });
        }
        
        // Create dummy launcher_profiles.json - Forge installer needs this in the game root
        const profilesPath = path.join(gameRoot, 'launcher_profiles.json');
        if (!fs.existsSync(profilesPath)) {
            console.log(`[FORGE] Creating dummy launcher_profiles.json at: ${profilesPath}`);
            fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {} }));
        }

        const versionsDir = path.join(gameRoot, 'versions');
        if (!fs.existsSync(versionsDir)) {
            fs.mkdirSync(versionsDir, { recursive: true });
        }

        const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeVersion}/forge-${version}-${forgeVersion}-installer.jar`;
        console.log(`[FORGE] Downloading from: ${installerUrl}`);
        const installerPath = path.join(versionsDir, `forge-installer-${version}.jar`);
        await downloadFile(installerUrl, installerPath, event);
        console.log(`[FORGE] Downloaded to: ${installerPath}`);

        const javaCmd = javaPath;
        return new Promise((resolve, reject) => {
            console.log(`[FORGE] Running installer with Java: ${javaCmd}`);
            // Point installer to the game root where launcher_profiles.json exists
            const args = ['-Djava.net.preferIPv4Stack=true', '-jar', installerPath, '--installClient', gameRoot];
            const child = spawn(javaCmd, args, {
                cwd: gameRoot,
                env: { ...process.env }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log(`[FORGE/STDOUT] ${data}`);
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log(`[FORGE/STDERR] ${data}`);
            });
            child.on('close', async (code) => {
                console.log(`[FORGE] Installer exited with code: ${code}`);
                
                if (code === 0) {
                    console.log("[FORGE] Installation completed, searching for installed version...");
                    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);

                    console.log(`[FORGE] Looking in versions directory: ${versionsDir}`);
                    
                    if (!fs.existsSync(versionsDir)) {
                        return reject(new Error(`Versions directory not found: ${versionsDir}`));
                    }

                    const folders = fs.readdirSync(versionsDir);
                    console.log(`[FORGE] Available versions: ${folders.join(', ')}`);
                    
                    // Look for the specific Forge version we just installed
                    const expectedFolder = `${version}-forge-${forgeVersion}`;
                    const forgeFolder = folders.find(f => f === expectedFolder) || 
                                       folders.find(f => f.toLowerCase().includes('forge') && f.includes(version));
                    
                    console.log(`[FORGE] Looking for: ${expectedFolder}, Found: ${forgeFolder || 'NONE'}`);
                    
                    if (!forgeFolder) {
                        const allItems = fs.readdirSync(versionsDir, { withFileTypes: true });
                        const folders_info = allItems.map(item => `${item.name}${item.isDirectory() ? '/' : ''}`).join(', ');
                        return reject(new Error(`No Forge folder found. Available: ${folders_info}`));
                    }
                    
                    resolve(forgeFolder);
                } else {
                    console.error(`[FORGE] Installation failed with code ${code}`);
                    console.error(`[FORGE] STDOUT: ${stdout}`);
                    console.error(`[FORGE] STDERR: ${stderr}`);

                    if (String(stderr).includes('UnrecognizedOptionException') && String(stderr).includes('installClient')) {
                        try {
                            console.warn('[FORGE] Detected legacy installer. Falling back to manual install...');
                            const legacyId = await legacyInstallForgeFromInstaller(installerPath, version, forgeVersion, gameRoot, event);
                            if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
                            return resolve(legacyId);
                        } catch (legacyErr) {
                            return reject(legacyErr);
                        }
                    }

                    reject(new Error(`Forge installer failed with code ${code}: ${stderr || stdout}`));
                }
            });

            child.on('error', (error) => {
                console.error(`[FORGE] Process error: ${error.message}`);
                reject(error);
            });
        });
        
    } catch (err) {
        console.error('[FORGE] Installation error:', err.message);
        throw err;
    }
}

async function setupNeoForge(version, gameRoot, neoForgeVersion = null, event, javaPath) {
    try {
        if (!neoForgeVersion) {
            console.log('[NEOFORGE] Version not provided, fetching latest...');
            neoForgeVersion = await getNeoForgeVersion(version);
        }
        if (!neoForgeVersion) throw new Error('NeoForge version not found for ' + version);

        console.log(`[NEOFORGE] Installing NeoForge v${neoForgeVersion} for MC ${version}`);

        if (!fs.existsSync(gameRoot)) {
            fs.mkdirSync(gameRoot, { recursive: true });
        }

        const profilesPath = path.join(gameRoot, 'launcher_profiles.json');
        if (!fs.existsSync(profilesPath)) {
            console.log(`[NEOFORGE] Creating dummy launcher_profiles.json at: ${profilesPath}`);
            fs.writeFileSync(profilesPath, JSON.stringify({ profiles: {} }));
        }

        const versionsDir = path.join(gameRoot, 'versions');
        if (!fs.existsSync(versionsDir)) {
            fs.mkdirSync(versionsDir, { recursive: true });
        }

        const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoForgeVersion}/neoforge-${neoForgeVersion}-installer.jar`;
        console.log(`[NEOFORGE] Downloading from: ${installerUrl}`);
        const installerPath = path.join(versionsDir, `neoforge-installer-${version}.jar`);
        await downloadFile(installerUrl, installerPath, event);
        console.log(`[NEOFORGE] Downloaded to: ${installerPath}`);

        const javaCmd = javaPath;
        return new Promise((resolve, reject) => {
            console.log(`[NEOFORGE] Running installer with Java: ${javaCmd}`);
            const args = ['-Djava.net.preferIPv4Stack=true', '-jar', installerPath, '--installClient', gameRoot];
            const child = spawn(javaCmd, args, {
                cwd: gameRoot,
                env: { ...process.env }
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
                console.log(`[NEOFORGE/STDOUT] ${data}`);
            });
            child.stderr.on('data', (data) => {
                stderr += data.toString();
                console.log(`[NEOFORGE/STDERR] ${data}`);
            });
            child.on('close', (code) => {
                console.log(`[NEOFORGE] Installer exited with code: ${code}`);

                if (code === 0) {
                    console.log('[NEOFORGE] Installation completed, searching for installed version...');
                    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);

                    if (!fs.existsSync(versionsDir)) {
                        return reject(new Error(`Versions directory not found: ${versionsDir}`));
                    }

                    const folders = fs.readdirSync(versionsDir);
                    const expectedFolder = `${version}-neoforge-${neoForgeVersion}`;
                    const neoFolder = folders.find(f => f === expectedFolder) ||
                        folders.find(f => f.toLowerCase().includes('neoforge') && f.includes(version)) ||
                        folders.find(f => f.toLowerCase().includes('neoforge'));

                    console.log(`[NEOFORGE] Looking for: ${expectedFolder}, Found: ${neoFolder || 'NONE'}`);

                    if (!neoFolder) {
                        const allItems = fs.readdirSync(versionsDir, { withFileTypes: true });
                        const foldersInfo = allItems.map(item => `${item.name}${item.isDirectory() ? '/' : ''}`).join(', ');
                        return reject(new Error(`No NeoForge folder found. Available: ${foldersInfo}`));
                    }

                    resolve(neoFolder);
                } else {
                    console.error(`[NEOFORGE] Installation failed with code ${code}`);
                    console.error(`[NEOFORGE] STDOUT: ${stdout}`);
                    console.error(`[NEOFORGE] STDERR: ${stderr}`);
                    reject(new Error(`NeoForge installer failed with code ${code}: ${stderr || stdout}`));
                }
            });

            child.on('error', (error) => {
                console.error(`[NEOFORGE] Process error: ${error.message}`);
                reject(error);
            });
        });
    } catch (err) {
        console.error('[NEOFORGE] Installation error:', err.message);
        throw err;
    }
}

ipcMain.on('save-settings', (event, data) => {
    fs.writeFileSync(configPath, JSON.stringify(data));
})

app.whenReady().then(() => {
    createWindow();
    initDiscordRPC();
});
app.on('before-quit', cleanupPartialDownloads);
process.on('exit', cleanupPartialDownloads);

ipcMain.handle('login-microsoft', async (event) => {
    try {
        console.log("Initalizing Microsoft login...");
        const authManager = new Auth("select_account");
        const xboxManager = await authManager.launch("electron");

        const token = await xboxManager.getMinecraft();

        const mclcData = token.mclc();
        const refreshToken = token.getToken()?.refresh;

        if (!refreshToken) {
            console.error("[AUTH] Błąd logowania: Nie udało się uzyskać refresh tokenu z MSMC.");
            return null;
        }

        return { ...mclcData, refreshToken: refreshToken };
    } catch (err) {
        console.error('Microsoft login error:', err);
        return null;
    }
});

ipcMain.on('launch-game', async (event, data) => {

    launcher.removeAllListeners();
    logBuffer = [];

    const win = BrowserWindow.fromWebContents(event.sender);

    console.log("Launching new Minecraft process...");
    const packName = data.version;
    const pack = ALL_MODPACKS[packName];

    let finalAuth;
    if (data.premiumAuth) {
        finalAuth = data.premiumAuth;

        // Auto-refresh tokenu jeśli jest dostępny refreshToken
        if (finalAuth.refreshToken) {
            try {
                console.log("[AUTH] Próba odświeżenia sesji przy użyciu refresh tokenu...");
                const authManager = new Auth("select_account");
                const xboxManager = await authManager.refresh(finalAuth.refreshToken);
                const newToken = await xboxManager.getMinecraft();
                
                const newMclcData = newToken.mclc();
                // Używamy publicznej metody biblioteki, aby uzyskać token odświeżania
                const newRefreshToken = newToken.getToken()?.refresh;

                if (!newRefreshToken) {
                    // Jeśli Microsoft z jakiegoś powodu nie zwróci nowego refresh tokenu, zachowajmy stary.
                    // To mało prawdopodobne, ale zabezpiecza przed utratą możliwości odświeżania.
                    console.warn("[AUTH] Odpowiedź odświeżania nie zawierała nowego refresh tokenu. Używam starego.");
                    finalAuth = { ...newMclcData, refreshToken: finalAuth.refreshToken };
                } else {
                    finalAuth = { ...newMclcData, refreshToken: newRefreshToken };
                }

                // Aktualizacja w pliku accounts.json
                const accounts = getAccounts();
                const idx = accounts.findIndex(acc => acc.auth && acc.auth.uuid === finalAuth.uuid);
                if (idx !== -1) {
                    accounts[idx].auth = finalAuth;
                    accounts[idx].name = finalAuth.name;
                    saveAccounts(accounts);
                    console.log("[AUTH] Sesja odświeżona pomyślnie. Zapisano nowy token.");
                }
            } catch (e) {
                console.warn("[AUTH] Nie udało się odświeżyć sesji:", e?.message || JSON.stringify(e));
                // Powiadom renderer o błędzie i przerwij uruchamianie
                event.sender.send('auth-refresh-failed');
                return;
            }
        }
        // Jeśli konto premium nie ma refreshToken, to jest to stary format zapisu.
        // Poinformuj użytkownika, że musi się zalogować ponownie.
        else if (finalAuth.msmc || !finalAuth.refreshToken) {
            console.warn("[AUTH] Wykryto stary format zapisu konta. Wymagane ponowne zalogowanie.");
            event.sender.send('auth-refresh-failed');
            return;
        }
    } else {
        finalAuth = Authenticator.getAuth(data.user);
    }
    
    //console.log('[GAME-LAUNCH] finalAuth:', finalAuth);
    //console.log('[GAME-LAUNCH] finalAuth.profile:', finalAuth?.profile);

    if (!pack) {
        console.error('Could not find definition for', data.version);
        event.reply('game-closed');
        return;
    }
    const globalGameRoot = path.join(LAUNCHER_PATH, 'game');
    const loaderType = getEffectiveLoader(pack);
    let gameDir = pack.loader !== null
            ? path.join(instancesPath, pack.folderName)
            : globalGameRoot
    let launchVersion;
    if (loaderType === 'fabric') {
        const fabricProfile = await getFabricProfile(pack.mcVersion);
        const fabricVersionDir = path.join(globalGameRoot, 'versions', fabricProfile.id);

        if (!fs.existsSync(fabricVersionDir)) {
            const installedId = await setupFabric(pack.mcVersion, globalGameRoot);
            if (!installedId) {
                console.error("Failed to install Fabric.");
                return;
            }

            launchVersion = {
                number: pack.mcVersion,
                type: "release",
                custom: installedId
            }
        } else {
            launchVersion = {
                number: pack.mcVersion,
                type: "release",
                custom: fabricProfile.id
            }
        }
    } else if (loaderType === 'neoforge') {
        console.log(`[GAME-LAUNCH] Launching with NeoForge loader. Pack: ${packName}`);
        let neoInstalledId = pack.versionId;
        console.log(`[GAME-LAUNCH] pack.versionId: ${neoInstalledId}, pack.loader: ${pack.loader}`);

        if (!neoInstalledId && pack.loader && String(pack.loader).toLowerCase().includes('neoforge')) {
            console.log(`[GAME-LAUNCH] Using pack.loader as NeoForge version: ${pack.loader}`);
            neoInstalledId = pack.loader;
        }

        if (!neoInstalledId) {
            const versionsDir = path.join(globalGameRoot, 'versions');
            console.log(`[GAME-LAUNCH] Searching for NeoForge in: ${versionsDir}`);
            if (fs.existsSync(versionsDir)) {
                const folders = fs.readdirSync(versionsDir);
                const neoVersions = folders.filter(f => f.toLowerCase().includes('neoforge'));
                console.log(`[GAME-LAUNCH] Available NeoForge versions: ${neoVersions.join(', ')}`);
                neoInstalledId = folders.find(f => f.toLowerCase().includes('neoforge') && f.includes(pack.mcVersion));
                console.log(`[GAME-LAUNCH] Found NeoForge version for MC ${pack.mcVersion}: ${neoInstalledId || 'NONE'}`);
            }
        }

        if (!neoInstalledId) {
            console.log(`[GAME-LAUNCH] NeoForge not found, installing fresh...`);
            const installJavaPath = await getJavaPathForLoader(pack.mcVersion, 'neoforge', event);
            neoInstalledId = await setupNeoForge(pack.mcVersion, globalGameRoot, null, event, installJavaPath);
            
            if (!neoInstalledId) {
                throw new Error(`NeoForge installation failed for MC ${pack.mcVersion}`);
            }
            console.log(`[GAME-LAUNCH] NeoForge installed: ${neoInstalledId}`);
        } else {
            const neoVersionPath = path.join(globalGameRoot, 'versions', neoInstalledId);
            if (!fs.existsSync(neoVersionPath)) {
                console.log(`[GAME-LAUNCH] NeoForge version exists in metadata but not on disk, installing...`);
                const installJavaPath = await getJavaPathForLoader(pack.mcVersion, 'neoforge', event);
                neoInstalledId = await setupNeoForge(pack.mcVersion, globalGameRoot, null, event, installJavaPath);
                
                if (!neoInstalledId) {
                    throw new Error(`NeoForge installation failed for MC ${pack.mcVersion}`);
                }
                console.log(`[GAME-LAUNCH] NeoForge installed: ${neoInstalledId}`);
            }
        }

        const baseVersionJson = path.join(globalGameRoot, 'versions', pack.mcVersion, `${pack.mcVersion}.json`);
        if (!fs.existsSync(baseVersionJson)) {
            console.log(`[GAME-LAUNCH] Base version ${pack.mcVersion} missing, downloading vanilla files...`);
            await ensureVanillaVersion(pack.mcVersion, globalGameRoot, event);
        }
        
        launchVersion = {
            number: pack.mcVersion,
            type: "release",
            custom: neoInstalledId
        }
        console.log(`[GAME-LAUNCH] Final launchVersion for NeoForge:`, launchVersion);
    } else if (loaderType === 'forge') {
        console.log(`[GAME-LAUNCH] Launching with Forge loader. Pack: ${packName}`);
        let forgeInstalledId = pack.versionId;
        console.log(`[GAME-LAUNCH] pack.versionId: ${forgeInstalledId}, pack.loader: ${pack.loader}`);

        // Jeśli pack.loader zawiera folder Forge'a, użyj go bezpośrednio
        if (!forgeInstalledId && pack.loader && String(pack.loader).toLowerCase().includes('forge')) {
            console.log(`[GAME-LAUNCH] Using pack.loader as Forge version: ${pack.loader}`);
            forgeInstalledId = pack.loader;
        }

        if (!forgeInstalledId) {
            const versionsDir = path.join(globalGameRoot, 'versions');
            console.log(`[GAME-LAUNCH] Searching for Forge in: ${versionsDir}`);
            if (fs.existsSync(versionsDir)) {
                const folders = fs.readdirSync(versionsDir);
                const forgeVersions = folders.filter(f => f.toLowerCase().includes('forge'));
                console.log(`[GAME-LAUNCH] Available Forge versions: ${forgeVersions.join(', ')}`);
                forgeInstalledId = folders.find(f => f.toLowerCase().includes('forge') && f.includes(pack.mcVersion));
                console.log(`[GAME-LAUNCH] Found Forge version for MC ${pack.mcVersion}: ${forgeInstalledId || 'NONE'}`);
            }
        }

        if (!forgeInstalledId) {
            console.log(`[GAME-LAUNCH] Forge not found, installing fresh...`);
            const installJavaPath = await getJavaPath(pack.mcVersion, event);
            forgeInstalledId = await setupForge(pack.mcVersion, globalGameRoot, null, event, installJavaPath);
            
            if (!forgeInstalledId) {
                throw new Error(`Forge installation failed for MC ${pack.mcVersion}`);
            }
            console.log(`[GAME-LAUNCH] Forge installed: ${forgeInstalledId}`);
        } else {
            const forgeVersionPath = path.join(globalGameRoot, 'versions', forgeInstalledId);
            if (!fs.existsSync(forgeVersionPath)) {
                console.log(`[GAME-LAUNCH] Forge version exists in metadata but not on disk, installing...`);
                const installJavaPath = await getJavaPath(pack.mcVersion, event);
                forgeInstalledId = await setupForge(pack.mcVersion, globalGameRoot, null, event, installJavaPath);
                
                if (!forgeInstalledId) {
                    throw new Error(`Forge installation failed for MC ${pack.mcVersion}`);
                }
                console.log(`[GAME-LAUNCH] Forge installed: ${forgeInstalledId}`);
            }
        }

        const baseVersionJson = path.join(globalGameRoot, 'versions', pack.mcVersion, `${pack.mcVersion}.json`);
        if (!fs.existsSync(baseVersionJson)) {
            console.log(`[GAME-LAUNCH] Base version ${pack.mcVersion} missing, downloading vanilla files...`);
            await ensureVanillaVersion(pack.mcVersion, globalGameRoot, event);
        }
        
        launchVersion = {
            number: pack.mcVersion,
            type: "release",
            custom: forgeInstalledId
        }
        console.log(`[GAME-LAUNCH] Final launchVersion for Forge:`, launchVersion);
    } else {
        if (pack.loader !== null) {
            launchVersion = {
                number: pack.mcVersion,
                type: "release",
                custom: pack.loader
            };

            if (!fs.existsSync(gameDir)) {
                console.warn(`Could not find: ${pack.folderName}. Starting download now...`);

                if (!fs.existsSync(instancesPath)) fs.mkdirSync(instancesPath, {recursive: true});

                const zipPath = path.join(instancesPath, pack.zipName);
                const downloadUrl = `https://havenmine.pl/launcher/api/${pack.zipName}`;

                try {
                    await downloadFile(downloadUrl, zipPath, event);
                    console.log('Downloaded! Now un-ziping the pack...');
                    const zip = new AdmZip(zipPath);
                    zip.extractAllTo(gameDir, true);
                    console.log('Done!');
                    fs.unlinkSync(zipPath);
                } catch (err) {
                    console.error("Download error: ", err);
                    return;
                }
            }
        } else {
            launchVersion = {
                number: pack.mcVersion,
                type: "release"
            };
        }
    }
    console.log(`Loading Minecraft ${data.version} for ${data.user}. Loaded memory: ${data.ram}GB RAM.`)
    if (logWindow) logWindow.destroy();
    createLogWindow();
    function broadcastLog(line) {
        if (!line || String(line).trim() === '') return;
        logBuffer.push(line);
        if (logBuffer.length > MAX_LOGS) logBuffer.shift();
        logToFile(line, 'GAME');
        queueLogToWindow(line);
    }
    const selectedJavaPath = await getJavaPathForLoader(pack.mcVersion, loaderType, event);
    await ensureAssetsForVersion(pack.mcVersion, globalGameRoot, event);

    const useJava8 = typeof selectedJavaPath === 'string' && /\\java8\\|jdk8|1\.8/i.test(selectedJavaPath);
    const forgeFixArgs = useJava8 ? [] : [
        "--add-opens", "java.base/java.util.concurrent=ALL-UNNAMED",
        "--add-opens", "java.base/java.lang.invoke=ALL-UNNAMED",
        "--add-opens", "java.base/java.lang=ALL-UNNAMED",
        "--add-opens", "java.base/java.util=ALL-UNNAMED",
        "--add-opens", "java.base/java.lang.reflect=ALL-UNNAMED"
    ];
    
    // Extra JVM args for Forge (module-path comes from version JSON arguments)
    let customArgs = [...forgeFixArgs];
    
    let opts = {
        authorization: finalAuth,
        root: globalGameRoot,
        version: launchVersion,
        javaPath: selectedJavaPath,
        memory: {
            max: `${data.ram}G`,
            min: "2G"
        },
        overrides: {
            detached: false,
            gameDirectory: gameDir,
            cwd: gameDir
        },
        skipAssetsCheck: false,
        customArgs: customArgs
    };

    try {
        let launchPromise;

        const useForgeCustomSpawn = loaderType === 'forge' || loaderType === 'neoforge';

        if (useForgeCustomSpawn) {
            console.log('[GAME-LAUNCH] Using custom Forge launcher');
            launchPromise = spawnForgeGame({
                javaPath: selectedJavaPath,
                gameRoot: globalGameRoot,
                gameDir: gameDir,
                versionId: launchVersion.custom,
                mcVersion: pack.mcVersion,
                ramGB: data.ram,
                authToken: finalAuth?.access_token || finalAuth?.accessToken || '',
                uuid: finalAuth?.uuid || finalAuth?.profile?.id || '',
                username: finalAuth?.name || finalAuth?.profile?.name || 'Player',
                forgeArgs: customArgs,
                event,
                instanceFolder: pack.folderName
            });
        } else {
            // Default to minecraft-launcher-core for non-Forge loaders
            launchPromise = launcher.launch(opts);
        }

        launchPromise.then((child) => {
            gameProcess = child;
            console.log("Proces gry przypisany pomyslnie:", child.pid);

            setDiscordActivity('W grze', `${packName}`, new Date());

            child.on('close', (code) => {
                event.reply('game-closed');
                clearInterval(interval);
                gameProcess = null;
                broadcastLog(`[LAUNCHER] Logs saved at ${path.join(gameDir, 'logs')}`);
                if (win) {
                    win.show();
                }
                if(logWindow) {
                    logWindow.show();
                }

                setDiscordActivity('W menu', 'Przegląda paczki');
            });

            if (data.minimizeToTray) {
                createTray(win);
                win.hide();
                showTrayNotif();
            }
        }).catch(err => {
            console.error('[GAME-LAUNCH] Launch error:', err);
            queueLogToWindow(`[LAUNCHER/ERR] ${err.message}`);
        });
    } catch (err) {
        console.error('[GAME-LAUNCH] Setup error:', err);
        console.error('[GAME-LAUNCH] Error stack:', err?.stack);
        queueLogToWindow(`[LAUNCHER/ERR] ${err?.message || JSON.stringify(err)}`);
    }
    const logFile = path.join(
        gameDir,
        'logs',
        'latest.log'
    );
    let lastSize = 0;

    if (fs.existsSync(logFile)) {
        lastSize = fs.statSync(logFile).size;
    }

    const watchLog = () => {
        if (!fs.existsSync(logFile)) return;

        const stats = fs.statSync(logFile);

        // jeśli plik został zresetowany (rozmiar mniejszy niż wcześniej)
        if (stats.size < lastSize) {
            lastSize = 0;
        }

        if (stats.size > lastSize) {
            const stream = fs.createReadStream(logFile, {
                start: lastSize,
                end: stats.size
            });

            stream.on('data', chunk => {
                const lines = chunk.toString().split(/\r?\n/);
                lines.forEach(line => {
                    if (line.trim() !== '') {
                        broadcastLog(line);
                    }
                });
            });

            lastSize = stats.size;
        }
    };
    const interval = setInterval(watchLog, 300);
    
    const useForgeCustomSpawn = loaderType === 'forge' || loaderType === 'neoforge';
    // Only attach launcher listeners if not using custom Forge spawn
    if (!useForgeCustomSpawn) {
        launcher.on('debug', (e) => {
            if (e.includes("Launching with arguments")) return;
            broadcastLog(`[LAUNCHER] ${e}`);
        });
        launcher.on('data', (e) => {
            broadcastLog(e);
        });

        launcher.on('download', (e) => console.log("[POBIERANIE]", e));

        launcher.on('progress', (e) => {
            event.reply('download-progress', e);
        });

        launcher.on('close', (code) => {
            event.reply('game-closed');
            clearInterval(interval);
            gameProcess = null;
            broadcastLog(`[LAUNCHER] Logs saved at ${path.join(gameDir, 'logs')}`);
            if (win) {
                win.show();
            }
            if(logWindow) {
                logWindow.show();
            }
        });
    }
});

ipcMain.handle('get-accounts', () => {
    return getAccounts();
});

ipcMain.handle('save-accounts', (event, accounts) => {
    saveAccounts(accounts);
});

ipcMain.on('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
});

ipcMain.on('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
});

ipcMain.on('kill-game', () => {
    if (gameProcess) {
        console.log('Wymuszanie zamkniecia instancji: ', gameProcess.pid);

        try {
            if (process.platform === 'win32') {
                require('child_process')
                .execSync(`taskkill /PID ${gameProcess.pid} /T /F`);
            } else {
                process.kill(-gameProcess.pid, 'SIGKILL');
            }
        } catch (err) {
            console.log('[ERROR] Blad przy zabijaniu:', err);
        }

        gameProcess = null;
        const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'));
        if (win) win.webContents.send('game-closed');
    }
})

ipcMain.handle('get-system-ram', () => {
    const totalMemoryGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
    return {
        total: totalMemoryGB,
        suggested: Math.min(Math.floor(totalMemoryGB / 2), 8)
    };
});

ipcMain.handle('get-log-history', () => {
    return logBuffer;
});

ipcMain.handle('get-logs-path', () => {
    return logsPath;
});

ipcMain.on('close-logs', () => {
    if (logWindow && !logWindow.isDestroyed()) {
        logWindow.destroy(); 
        logWindow = null;
    }
});

ipcMain.on('open-logs', () => {
    if (!logWindow || logWindow.isDestroyed()) {
        createLogWindow();
    } else {
        logWindow.show();
        logWindow.focus();
    }
});

ipcMain.handle('get-popular-mods', async () => {
    try {

        const res = await axios.get('https://api.curseforge.com/v1/mods/search', {
            headers: {
                'Accept': 'application/json',
                'x-api-key': CF_API_KEY
            },
            params: {
                gameId: 432,
                classId: 6,
                sortField: 2,
                sortOrder: 'desc',
                pageSize: 6
            }
        });

        return res.data.data;
    } catch (error) {
        console.error('Error while fetching CF mods:', error);
        return [];
    }
});

ipcMain.handle('create-custom-instance', async (event, packData) => {
    let customInstances = [];
    if (fs.existsSync(userPacksPath)) {
        customInstances = JSON.parse(fs.readFileSync(userPacksPath, 'utf-8'));
    }

    const folderName = packData.name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const instanceFolder = path.join(instancesPath, folderName);

    if (packData.loader === 'fabric') await installFabricApi(packData.version, instanceFolder);

    const newInstance = {
        id: folderName,
        name: packData.name,
        mcVersion: packData.version,
        loader: packData.loader !== 'vanilla' ? packData.loader : null,
        folderName: folderName,
        isCustom: true
    };

    customInstances.push(newInstance);

    fs.writeFileSync(userPacksPath, JSON.stringify(customInstances, null, 2));
    const modsFolder = path.join(instanceFolder, 'mods');
    fs.mkdirSync(modsFolder, {recursive: true} );

    return newInstance;
});
ipcMain.handle('ping-server', async (event, host) => {
    const parts = host.split(':');
    const ip = parts[0];
    const port = parts[1] ? parseInt(parts[1]) : 25565;

    try {
        const res = await util.status(ip, port, {
            timeout: 5000,
            enableSRV: true
        });

        return {
            online: true,
            latency: res.roundTripLatency,
            players: res.players.online,
            maxPlayers: res.players.max,
            version: res.version.name
        };
    } catch (error) {
        return {
            online: false,
            latency: null,
            players: 0
        }
    }
});

ipcMain.handle('get-ready-modpacks', async (event, { query = '' }) => {
    try {
        const params = {
            gameId: 432,
            classId: 4471,
            pageSize: 50,
            sortField: 2,
            sortOrder: 'desc',
            modLoaderTypes: '1,4'
        }
        if (query && query.length > 0) params.searchFilter = query;
        const res = await axios.get('https://api.curseforge.com/v1/mods/search', {
            params: params,
            headers: { 'x-api-key': CF_API_KEY }
        });
        console.log(`[GET-READY-MODPACKS] Found ${res.data.data.length} modpacks for query: "${query}"`);
        return res.data.data;
    } catch (error) {
        console.error('[GET-READY-MODPACKS] Error:', error.message);
        return [];
    }
});

ipcMain.handle('search-mods', async (event, {query, mcVersion, loader}) => {
    console.log(`Searching for ${query} for ${mcVersion} on ${loader}`);
    try {
        let loaderType;
        if (loader === 'fabric') {
            loaderType = 4 
        } else {
            loaderType = 1;
        }

        const res = await axios.get('https://api.curseforge.com/v1/mods/search', {
            params: {
                gameId: 432,
                searchFilter: query,
                gameVersion: mcVersion,
                modLoaderType: loaderType,
                classId: 6,
                pageSize: 20,
                sortField: 2,
                sortOrder: 'desc'
            },
            headers: { 'x-api-key': CF_API_KEY }
        });
        return res.data.data;
    } catch (err) {
        console.error('CF Error:', err);
        return [];
    }
});

ipcMain.handle('delete-modpack', async (event, packId) => {
    try {
        if (!fs.existsSync(userPacksPath)) return false;
        let userPacks = JSON.parse(fs.readFileSync(userPacksPath, 'utf-8'));

        const packToDelete = userPacks.find(p => p.id === packId);

        if (!packToDelete) {
            console.error('No pack found with id:', packId);
            return false;
        }

        if (gameProcess) {
            console.warn('Cancelling. Game is running.');
            return false;
        }

        const packPath = path.join(instancesPath, packToDelete.folderName);
        if (fs.existsSync(packPath)) {
            fs.rmSync(packPath, { recursive: true, force: true });
        }

        const updatedPacks = userPacks.filter(p => p.id !== packId);
        fs.writeFileSync(userPacksPath, JSON.stringify(updatedPacks, null, 4));

        return true;
    } catch (err) {
        console.error('Error while deleting the modpack:', err);
        return false;
    }
});

ipcMain.handle('get-installed-mods', async (event, instanceFolder) => {
    const modsPath = path.join(instancesPath, instanceFolder, 'mods');
    if (!fs.existsSync(modsPath)) return [];

    try {
        const files = fs.readdirSync(modsPath);
        return files.filter(file => file.endsWith('.jar') || file.endsWith('.jar.disabled'))
        .map(file => ({
            name: file.replace('.disabled', ''),
            filename: file,
            enabled: !file.endsWith('.disabled')
        }));
    } catch (err) {
        console.error(err);
        return [];
    }
});

ipcMain.handle('toggle-mod', async (event, { instanceFolder, filename, state }) => {
    const modsPath = path.join(instancesPath, instanceFolder, 'mods');
    const oldPath = path.join(modsPath, filename);

    let newFilename = filename;
    if (state === false && !filename.endsWith('.disabled')) {
        newFilename = filename + '.disabled';
    } else if (state === true && filename.endsWith('.disabled')) {
        newFilename = filename.replace('.disabled', '');
    }

    const newPath = path.join(modsPath, newFilename);

    try {
        if (oldPath !== newPath) {
            fs.renameSync(oldPath, newPath);
        }
        return { success: true, newFilename };
    } catch (err) {
        console.error(err);
        return { success: false };
    }
});

ipcMain.handle('open-external-link', (event, link) => {
    shell.openExternal(link);
});

ipcMain.handle('install-ready-modpack', async (event, packData) => {
    try {
        const file = packData.latestFiles[0];
        if (!file) return { success: false, error: 'Brak plików paczki.' };

        let downloadUrl = file.downloadUrl;
        if (!downloadUrl) {
            const fileIdStr = file.id.toString();
            const part1 = fileIdStr.slice(0, 4);
            const part2 = fileIdStr.slice(4);
            downloadUrl = `https://edge.forgecdn.net/files/${part1}/${part2}/${file.fileName}`;
        }

        const safeName = packData.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const folderName = safeName + '_' + Date.now();
        const instanceFolder = path.join(instancesPath, folderName);
        const zipPath = path.join(instancesPath, `${folderName}_temp.zip`);

        if (!fs.existsSync(instancesPath)) fs.mkdirSync(instancesPath, { recursive: true });

        await downloadFile(downloadUrl, zipPath, event);

        const zip = new AdmZip(zipPath);
        const tempExtractDir = path.join(instancesPath, `${folderName}_extracted`);
        zip.extractAllTo(tempExtractDir, true);

        const manifestPath = path.join(tempExtractDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            throw new Error("Brak manifest.json w paczce!");
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        fs.mkdirSync(instanceFolder, { recursive: true });
        const mcVersion = manifest.minecraft.version;
        let loaderType = 'vanilla';
        let loaderVerison = null;
        let finalVersionId = mcVersion;

        const primaryLoader = manifest.minecraft.modLoaders.find(l => l.primary);
        if (primaryLoader) {
            const fullId = primaryLoader.id;
            console.log(`[INSTALL-MODPACK] Loader ID: ${fullId}, MC Version: ${mcVersion}`);
            if (fullId.startsWith('forge-')) {
                loaderType = 'forge';
                loaderVerison = fullId.replace('forge-', '');
                console.log(`[INSTALL-MODPACK] Installing Forge ${loaderVerison} for MC ${mcVersion}`);
                try {
                    // Install Forge to global game root so it has access to assets and vanilla profiles
                    const globalGameRoot = path.join(LAUNCHER_PATH, 'game');
                    if (!fs.existsSync(globalGameRoot)) fs.mkdirSync(globalGameRoot, { recursive: true });
                    
                    const installJavaPath = await getJavaPath(mcVersion, event);
                    finalVersionId = await setupForge(mcVersion, globalGameRoot, loaderVerison, event, installJavaPath);
                    if (!finalVersionId) {
                        throw new Error('Forge installation returned no version ID');
                    }
                    console.log(`[INSTALL-MODPACK] Forge installed successfully: ${finalVersionId}`);
                } catch (forgeErr) {
                    console.error(`[INSTALL-MODPACK] Forge installation failed:`, forgeErr.message);
                    throw new Error(`Błąd instalacji Forge'a: ${forgeErr.message}`);
                }
            } else if (fullId.startsWith('neoforge-')) {
                loaderType = 'neoforge';
                loaderVerison = fullId.replace('neoforge-', '');
                console.log(`[INSTALL-MODPACK] Installing NeoForge ${loaderVerison} for MC ${mcVersion}`);
                try {
                    const globalGameRoot = path.join(LAUNCHER_PATH, 'game');
                    if (!fs.existsSync(globalGameRoot)) fs.mkdirSync(globalGameRoot, { recursive: true });
                    
                    const installJavaPath = await getJavaPathForLoader(mcVersion, 'neoforge', event);
                    finalVersionId = await setupNeoForge(mcVersion, globalGameRoot, loaderVerison, event, installJavaPath);
                    if (!finalVersionId) {
                        throw new Error('NeoForge installation returned no version ID');
                    }
                    console.log(`[INSTALL-MODPACK] NeoForge installed successfully: ${finalVersionId}`);
                } catch (neoErr) {
                    console.error(`[INSTALL-MODPACK] NeoForge installation failed:`, neoErr.message);
                    throw new Error(`Błąd instalacji NeoForge: ${neoErr.message}`);
                }
            } else if (fullId.startsWith('fabric-')) {
                loaderType = 'fabric';
                loaderVerison = fullId.replace('fabric-', '');
                console.log(`[INSTALL-MODPACK] Installing Fabric ${loaderVerison} for MC ${mcVersion}`);
                try {
                    const globalGameRoot = path.join(LAUNCHER_PATH, 'game');
                    if (!fs.existsSync(globalGameRoot)) fs.mkdirSync(globalGameRoot, { recursive: true });
                    
                    finalVersionId = await setupFabric(mcVersion, globalGameRoot, loaderVerison);
                    if (!finalVersionId) {
                        throw new Error('Fabric installation returned no version ID');
                    }
                    console.log(`[INSTALL-MODPACK] Fabric installed successfully: ${finalVersionId}`);
                } catch (fabricErr) {
                    console.error(`[INSTALL-MODPACK] Fabric installation failed:`, fabricErr.message);
                    throw new Error(`Błąd instalacji Fabric'a: ${fabricErr.message}`);
                }
            }
        }

        let customInstances = [];
        if (fs.existsSync(userPacksPath)) {
            customInstances = JSON.parse(fs.readFileSync(userPacksPath, 'utf-8'));
        }

        const newInstance = {
            id: folderName,
            name: packData.name,
            mcVersion: mcVersion,
            loader: loaderType !== 'vanilla' ? finalVersionId : null,
            versionId: finalVersionId,
            folderName: folderName,
            isCustom: true
        };

        customInstances.push(newInstance);
        fs.writeFileSync(userPacksPath, JSON.stringify(customInstances, null, 2));
        
        const overridesDir = path.join(tempExtractDir, manifest.overrides || 'overrides');
        if (fs.existsSync(overridesDir)) {
            fs.cpSync(overridesDir, instanceFolder, { recursive: true });
        }

        const modsFolder = path.join(instanceFolder, 'mods');
        if (!fs.existsSync(modsFolder)) fs.mkdirSync(modsFolder, { recursive: true });
        const forgeReplacementCache = new Map();

        console.log(`Rozpoczęto pobieranie ${manifest.files.length} modów...`);
        const win = BrowserWindow.fromWebContents(event.sender);
        const packId = packData.id;
        const modsToDownload = manifest.files.length;
        let modsDownloaded = 0;
        for (const modData of manifest.files) {
            try {
                const res = await axios.get(`https://api.curseforge.com/v1/mods/${modData.projectID}/files/${modData.fileID}`, {
                    headers: { 'x-api-key': CF_API_KEY }
                });

                const modFile = res.data.data;
                let modDownloadUrl = modFile.downloadUrl;
                if (!modDownloadUrl) {
                    const fidStr = modFile.id.toString();
                    modDownloadUrl = `https://edge.forgecdn.net/files/${fidStr.slice(0, 4)}/${fidStr.slice(4)}/${modFile.fileName}`;
                }
                const modOutputPath = path.join(modsFolder, modFile.fileName);
                if (!fs.existsSync(modOutputPath)) {
                    await downloadFile(modDownloadUrl, modOutputPath);
                }
                modsDownloaded++;
                win.webContents.send('modpack-download', { modsDownloaded, modsToDownload, packId });
            } catch (modErr) {
                console.error(`Nie udalo sie pobrac moda ${modData.projectID}:`, modErr.message);
            }
        }

        fs.unlinkSync(zipPath);
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        return {success: true, instance: newInstance}
    } catch (err) {
        console.error("Błąd podczas instalacji modpacka:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('install-mod', async (event, { modId, version, loader, instanceFolder }) => {
    try {
        const loaderType = loader === 'fabric' ? 4 : (loader=== 'forge' ? 1 : 0);
        const modsPath = path.join(instancesPath, instanceFolder, 'mods');
        if (!fs.existsSync(modsPath)) fs.mkdirSync(modsPath, { recursive: true });

        const processedMods = new Set();
        let mainModFileName = null;

        async function downloadModWithDependencies(currentModId, isMainMod = false) {
            if (processedMods.has(currentModId)) return;
            processedMods.add(currentModId);

            console.log('Szukanie biblioteki o id:', currentModId);

            const res = await axios.get(`https://api.curseforge.com/v1/mods/${currentModId}/files`, {
                params: {
                    gameVersion: version,
                    modLoaderType: loaderType
                },
                headers: { 'x-api-key': CF_API_KEY }
            });
            const files = res.data.data;
            if (!files || files.length === 0) {
                return { success: false, error: 'Brak kompatybilnej wersji pliku.' };
            }

            const targetFile = files[0];
            let downloadUrl = targetFile.downloadUrl;

            if (!downloadUrl) {
                const fileIdStr = targetFile.id.toString();
                const part1 = fileIdStr.slice(0, 4);
                const part2 = fileIdStr.slice(4);
                downloadUrl = `https://edge.forgecdn.net/files/${part1}/${part2}/${targetFile.fileName}`;
            }

            const modFilePath = path.join(modsPath, targetFile.fileName);

            if (isMainMod) {
                mainModFileName = targetFile.fileName;
            }

            if (!fs.existsSync(modFilePath)) {
                await downloadFile(downloadUrl, modFilePath, event);
            } else {
                console.warn(`${targetFile.fileName} already exists. Skipping..`);
            }

            if (targetFile.dependencies && targetFile.dependencies.length > 0) {
                for (const dep of targetFile.dependencies) {
                    if (dep.relationType === 3 && dep.modId) {
                        console.log('Installing dependency:', dep.modId);
                        await downloadModWithDependencies(dep.modId, false);
                    }
                }
            }
        }

        await downloadModWithDependencies(modId, true);

        if (!mainModFileName) {
            return { success: false, error: 'Brak plikow dla glownego moda' };
        }

        return { success: true, fileName: mainModFileName };
    } catch (err) {
        console.error("Błąd podczas instalacji moda:", err);
        return { success: false, error: 'Błąd pobierania.' };
    }
});

ipcMain.handle('uninstall-mod', async (event, { instanceFolder, fileName }) => {
    try {
        console.log(instancesPath, instanceFolder, fileName)
        const jarFilePath = path.join(instancesPath, instanceFolder, 'mods', fileName);
        console.log('Usuwam', jarFilePath);
        if (!fs.existsSync(jarFilePath)) {
            return { success: false };
        }
        
        fs.rmSync(jarFilePath, { recursive: true, force: true });
        console.log('Usunieto:', jarFilePath);
        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false };
    }
});

ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === logWindow) {
        logWindow.destroy();
        logWindow = null;
    } else if (win) {
        app.quit();
    }
});

ipcMain.on('refresh-modpacks', async (event) => {
    const updatedModpacks = await getFullModpackList();
    ALL_MODPACKS = updatedModpacks;
    console.log('Refreshing all modpacks.. ');
    event.reply('load-modpacks', updatedModpacks);
});

ipcMain.on('open-local-files', () => {
    shell.openPath(LAUNCHER_PATH);
});

ipcMain.handle('open-logs-folder', () => {
    shell.openPath(logsPath);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (gameProcess) {
            console.log('Wymuszanie zamkniecia instancji: ', gameProcess.pid);

            try {
                if (process.platform === 'win32') {
                    require('child_process')
                    .execSync(`taskkill /PID ${gameProcess.pid} /T /F`);
                } else {
                    process.kill(-gameProcess.pid, 'SIGKILL');
                }
            } catch (err) {
                console.log('[ERROR] Blad przy zabijaniu:', err);
            }

            gameProcess = null;
            const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html'));
            if (win) win.webContents.send('game-closed');
        }
        app.quit();
    }
});

function updateStatus(win, text) {
    if (win) {
        win.webContents.send('loading-status', text);
    }
}

async function downloadFile(url, outputPath, event) {
    queueLogToWindow(`[LAUNCHER] Downloading from ${url}`);
    const tempPath = `${outputPath}.part`;
    activeDownloads.add(tempPath);
    const writer = fs.createWriteStream(tempPath);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'Accept': '*/*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    });

    const totalBytes = parseInt(response.headers['content-length'], 10);
    let downloadedBytes = 0;
    response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        if (event && event.sender && totalBytes > (25 * 1024 * 1024)) { // > 25 MB
            event.sender.send('download-progress', {
                task: downloadedBytes,
                total: totalBytes
            });
        }
    });

    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanupTemp = (err) => {
            if (settled) return;
            settled = true;
            try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch (e) {
                console.warn('[DOWNLOAD CLEANUP] Failed to remove temp file:', tempPath, e?.message || e);
            }
            activeDownloads.delete(tempPath);
            if (err) reject(err);
        };

        response.data.pipe(writer);
        writer.on('finish', () => {
            if (settled) return;
            try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                fs.renameSync(tempPath, outputPath);
                settled = true;
                activeDownloads.delete(tempPath);
                resolve();
            } catch (err) {
                cleanupTemp(err);
            }
        });
        writer.on('error', (err) => {
            console.error(err);
            cleanupTemp(err);
        });
        response.data.on('error', (err) => {
            console.error(err);
            cleanupTemp(err);
        });
        response.data.on('aborted', () => {
            cleanupTemp(new Error('Download aborted'));
        });
    });
}
