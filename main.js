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
require('dotenv').config();

// ---

const launcher = new Client();
const LAUNCHER_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'HavenLauncher');
const configPath    = path.join(LAUNCHER_PATH, 'config.json');
const instancesPath = path.join(LAUNCHER_PATH, 'instances');
const accountsPath  = path.join(LAUNCHER_PATH, 'accounts.json');
const userPacksPath = path.join(LAUNCHER_PATH, 'custom_instances.json');

let logWindow;
let gameProcess;
let tray = null;

const modpacksPath  = path.join(__dirname, 'modpacks.json');
const MODPACKS      = JSON.parse(fs.readFileSync(modpacksPath, 'utf-8'));
const USER_MODPACKS = JSON.parse(fs.readFileSync(userPacksPath, 'utf-8'));
let ALL_MODPACKS;

function getAccounts() {
    if (fs.existsSync(accountsPath)) {
        return JSON.parse(fs.readFileSync(accountsPath, 'utf-8')); 
    }
    return [];
}

async function getFullModpackList() {
    try {
        const res = await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        const { latest, versions } = res.data;

        const vanillaVersions = {};

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
        return Object.assign({}, MODPACKS, vanillaVersions, USER_MODPACKS);
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
    win.webContents.openDevTools();
    win.loadFile('index.html');

    win.webContents.on('did-finish-load', async () => {
        win.webContents.send('load-settings', loadConfig());
        getFullModpackList().then(allPacks => {
            ALL_MODPACKS = allPacks;
            win.webContents.send('load-modpacks', ALL_MODPACKS);
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
    })
    logWindow.on('closed', () => {logWindow = null;});
}

ipcMain.on('save-settings', (event, data) => {
    fs.writeFileSync(configPath, JSON.stringify(data));
})

app.whenReady().then(createWindow);

ipcMain.handle('login-microsoft', async (event) => {
    try {
        console.log("Initalizing Microsoft login...");
        const authManager = new Auth("select_account");
        const xboxManager = await authManager.launch("electron");

        const token = await xboxManager.getMinecraft();

        return token.mclc();
    } catch (err) {
        console.error('Microsoft login error:', err);
        return null;
    }
});

ipcMain.on('launch-game', async (event, data) => {

    launcher.removeAllListeners();
    
    const win = BrowserWindow.fromWebContents(event.sender);

    console.log("Launching new Minecraft process...");
    const pack = ALL_MODPACKS[data.version];

    let finalAuth;
    if (data.premiumAuth) {
        finalAuth = data.premiumAuth;
    } else {
        finalAuth = Authenticator.getAuth(data.user);
    }

    if (!pack) {
        console.error('Could not find definition for', data.version);
        return;
    }

    let gameRoot;
    let launchVersion;

    if (pack.loader !== null) {
        gameRoot = path.join(instancesPath, pack.folderName);
        launchVersion = {
            number: pack.mcVersion,
            type: "release",
            custom: pack.loader
        };

        if (!fs.existsSync(gameRoot)) {
            console.warn(`Could not find: ${pack.folderName}. Starting download now...`);

            if (!fs.existsSync(instancesPath)) fs.mkdirSync(instancesPath, {recursive: true});

            const zipPath = path.join(instancesPath, pack.zipName);
            const downloadUrl = `https://havenmine.pl/launcher/api/${pack.zipName}`;

            try {
                await downloadFile(downloadUrl, zipPath, event);
                console.log('Downloaded! Now un-ziping the pack...');
                const zip = new AdmZip(zipPath);
                zip.extractAllTo(gameRoot, true);
                console.log('Done!');
                fs.unlinkSync(zipPath);
            } catch (err) {
                console.error("Download error: ", err);
                return;
            }
        }
    } else {
        gameRoot = path.join(os.homedir(), 'AppData', 'Roaming', 'HavenLauncher', 'game');
        launchVersion = {
            number: pack.mcVersion,
            type: "release"
        };
    }
    console.log(`Loading Minecraft ${data.version} for ${data.user}. Loaded memory: ${data.ram}GB RAM.`)
    if (logWindow) logWindow.close();
    createLogWindow();

    let opts = {
        authorization: finalAuth,
        root: gameRoot,
        version: launchVersion,
        memory: {
            max: `${data.ram}G`,
            min: "2G"
        },
        javaPath: "javaw",
        detached: false,
        skipAssetsCheck: false
    };

    launcher.launch(opts).then(child => {
        gameProcess = child;
        console.log("Proces gry przypisany pomyslnie:", child.pid);

        if (data.minimizeToTray) {
            createTray(win);
            win.hide();
            showTrayNotif();
        }
    }).catch(err => {
        if (logWindow) logWindow.webContents.send('mc-log', `[LAUNCHER/ERR] ${err.message}`);
    });
    const logFile = path.join(
        gameRoot,
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
                    if (line.trim() !== '' && logWindow) {
                        logWindow.webContents.send('mc-log', line);
                    }
                });
            });

            lastSize = stats.size;
        }
    };
    const interval = setInterval(watchLog, 300);
    launcher.on('debug', (e) => {
        if (e.includes("Launching with arguments")) return;
        console.log("[DEBUG]", e);
        if (logWindow) logWindow.webContents.send('mc-log', `[LAUNCHER] ${e}`);
    });
    launcher.on('data', (e) => {
        if (logWindow) logWindow.webContents.send('mc-log', e);
    });

    launcher.on('download', (e) => console.log("[POBIERANIE]", e));

    launcher.on('progress', (e) => {
        event.reply('download-progress', e);
    });

    launcher.on('close', (code) => {
        event.reply('game-closed');
        clearInterval(interval);
        if (win) {
            win.show();
        }
    })
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
        const CF_API_KEY = process.env.CF_API_KEY;

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

    const instanceFolder = path.join(instancesPath, folderName);
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

ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === logWindow) {
        logWindow.destroy();
        logWindow = null;
    } else if (win) {
        app.quit();
    }
});

ipcMain.on('open-local-files', () => {
    shell.openPath(LAUNCHER_PATH);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

async function downloadFile(url, outputPath, event) {
    const writer = fs.createWriteStream(outputPath);

    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    const totalBytes = parseInt(response.headers['content-length'], 10);
    let downloadedBytes = 0;

    response.data.on('data', (chunk) => {
        downloadedBytes += chunk.length;

        event.reply('download-progress', {
            task: downloadedBytes,
            total: totalBytes
        });
    });

    return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}