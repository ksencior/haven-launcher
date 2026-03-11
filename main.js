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
const { execSync, exec, spawn } =       require('child_process');
const ut =                              require('util');
                                        require('dotenv').config();
// ---

const launcher = new Client();
const CF_API_KEY = process.env.CF_API_KEY || app.getAppMetrics()[0]?.context?.CF_API_KEY || require('./package.json').CF_API_KEY;
const execPromise = ut.promisify(exec);

let LAUNCHER_PATH;
if (process.platform === 'win32') {
    LAUNCHER_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'HavenLauncher');
} else if (process.platform === 'darwin') {
    LAUNCHER_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'HavenLauncher');
} else {
    LAUNCHER_PATH = path.join(os.homedir(), '.havenlauncher')
}
const configPath    = path.join(LAUNCHER_PATH, 'config.json');
const instancesPath = path.join(LAUNCHER_PATH, 'instances');
const accountsPath  = path.join(LAUNCHER_PATH, 'accounts.json');
const userPacksPath = path.join(LAUNCHER_PATH, 'custom_instances.json');

if (!fs.existsSync(LAUNCHER_PATH)) {
    fs.mkdirSync(LAUNCHER_PATH, { recursive: true });
}
if (!fs.existsSync(instancesPath)) {
    fs.mkdirSync(instancesPath, { recursive: true });
}

let logWindow;
let gameProcess;
let tray = null;

const modpacksPath  = path.join(__dirname, 'modpacks.json');
const MODPACKS      = JSON.parse(fs.readFileSync(modpacksPath, 'utf-8'));
let USER_MODPACKS;
let ALL_MODPACKS;

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
        updateStatus(win, 'Sprawdzanie środowiska Java...');
        try {
        execSync(process.platform === 'win32' ? 'javaw -version' : 'java -version');
        } catch (e) {
            updateStatus(mainWindow, "BŁĄD: Nie znaleziono Javy!");
            return; 
        }
        updateStatus(win, 'Ładowanie ustawień...')
        win.webContents.send('load-settings', loadConfig());
        updateStatus(win, 'Pobieranie listy modyfikacji...');
        getFullModpackList().then(allPacks => {
            ALL_MODPACKS = allPacks;
            win.webContents.send('load-modpacks', ALL_MODPACKS);
            updateStatus(win, 'Witaj ponownie!');
            win.webContents.send('app-ready');
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

async function getFabricProfile(mcVersion) {
    try {
        const loaderUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`;
        const loaders = (await axios.get(loaderUrl)).data;
        if (!loaders || loaders.length === 0) return null;

        const latestLoader = loaders[0].loader.version;

        const profileUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${latestLoader}/profile/json`;
        const profileResponse = await axios.get(profileUrl);

        return {
            id: `fabric-loader-${latestLoader}-${mcVersion}`,
            data: profileResponse.data
        };
    } catch (err) {
        console.error("Błąd pobierania profilu Fabric:", err);
        return null;
    }
}

async function setupFabric(version, instanceFolder, event) {
    const profile = await getFabricProfile(version);
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

async function getForgeVersion(mcVersion) {
    try {
        const url = 'https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json';
        const res = await axios.get(url);
        const promos = res.data.promos;

        let forgeVer = promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`];
        return forgeVer;
    } catch (err) {
        console.error("Błąd pobierania info o Forge:", err);
        return null;
    }
}

async function setupForge(version, instanceFolder, event) {
    try {
        const forgeVer = await getForgeVersion(version);
        if (!forgeVer) {
            console.error('Nie znaleziono wersji Forge dla', version);
            return null;
        }

        const dummyProfilesPath = path.join(instanceFolder, 'launcher_profiles.json');
        if (!fs.existsSync(dummyProfilesPath)) {
            fs.writeFileSync(dummyProfilesPath, JSON.stringify({ profiles: {} }));
        }

        const installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${version}-${forgeVer}/forge-${version}-${forgeVer}-installer.jar`;
        const installerPath = path.join(instanceFolder, `forge-installer-${version}.jar`);
        await downloadFile(installerUrl, installerPath, event);

        const javaCmd = process.platform === 'win32' ? 'javaw' : 'java';
        return new Promise((resolve, reject) => {
            const args = ['-Djava.net.preferIPv4Stack=true', '-jar', installerPath, '--installClient', instanceFolder];
            const child = spawn(javaCmd, args, {
                cwd: instanceFolder
            });

            child.stdout.on('data', (data) => {
                console.log(`[Forge/INFO] ${data}`);
            });
            child.stderr.on('data', (data) => {
                console.log(`[Forge/ERROR] ${data}`);
            });
            child.on('close', (code) => {
                if (code === 0) {
                    console.log("Instalacja Forge zakończona sukcesem.");
                    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);

                    const versionsDir = path.join(instanceFolder, 'versions');
                    const folders = fs.readdirSync(versionsDir);
                    const forgeFolder = folders.find(f => f.toLowerCase().includes('forge'));
                    resolve(forgeFolder || null);
                } else {
                    reject(new Error(`Instalator Forge zakończył pracę z kodem ${code}`));
                }
            })
        });
        
    } catch (err) {
        console.error('Błąd podczas instalacji Forge:', err);
        return null;
    }
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
    const packName = data.version;
    const pack = ALL_MODPACKS[packName];

    let finalAuth;
    if (data.premiumAuth) {
        finalAuth = data.premiumAuth;
    } else {
        finalAuth = Authenticator.getAuth(data.user);
    }

    if (!pack) {
        console.error('Could not find definition for', data.version);
        event.reply('game-closed');
        return;
    }

    let gameRoot = pack.loader !== null
            ? path.join(instancesPath, pack.folderName)
            : path.join(LAUNCHER_PATH, 'game');
    let launchVersion;
    if (pack.loader === 'fabric') {
        const fabricProfile = await getFabricProfile(pack.mcVersion);
        const fabricVersionDir = path.join(gameRoot, 'versions', fabricProfile.id);

        if (!fs.existsSync(fabricVersionDir)) {
            const installedId = await setupFabric(pack.mcVersion, gameRoot, event);
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
    } else if (pack.loader === 'forge') {
        const versionsDir = path.join(gameRoot, 'versions');
        let forgeInstalledId = null;

        if (fs.existsSync(versionsDir)) {
            const folders = fs.readdirSync(versionsDir);
            forgeInstalledId = folders.find(f => f.toLowerCase().includes('forge'));
        }

        if (!forgeInstalledId) {
            forgeInstalledId = await setupForge(pack.mcVersion, gameRoot, event);
            if (!forgeInstalledId) {
                console.error('Nie udalo sie zainstalowac Forge.');
                return;
            }
        }
        launchVersion = {
            number: pack.mcVersion,
            type: "release",
            custom: forgeInstalledId
        }
    } else {
        if (pack.loader !== null) {
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
            launchVersion = {
                number: pack.mcVersion,
                type: "release"
            };
        }
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
        javaPath: process.platform === 'win32' ? 'javaw' : 'java',
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
        gameProcess = null;
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

ipcMain.handle('get-system-ram', () => {
    const totalMemoryGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
    return {
        total: totalMemoryGB,
        suggested: Math.min(Math.floor(totalMemoryGB / 2), 8)
    };
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

ipcMain.handle('install-mod', async (event, { modId, version, loader, instanceFolder }) => {
    try {
        const loaderType = loader === 'fabric' ? 4 : (loader=== 'forge' ? 1 : 0);

        const res = await axios.get(`https://api.curseforge.com/v1/mods/${modId}/files`, {
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

        const modFilePath = path.join(instancesPath, instanceFolder, 'mods', targetFile.fileName);

        await downloadFile(downloadUrl, modFilePath, event);

        return { success: true, fileName: targetFile.fileName };
    } catch (err) {
        console.error("Błąd podczas instalacji moda:", err);
        return { success: false, error: 'Błąd pobierania.' };
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
    console.log('Refreshing all modpacks.. Data recieved:', updatedModpacks);
    event.reply('load-modpacks', updatedModpacks);
});

ipcMain.on('open-local-files', () => {
    shell.openPath(LAUNCHER_PATH);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function updateStatus(win, text) {
    if (win) {
        win.webContents.send('loading-status', text);
    }
}

async function downloadFile(url, outputPath, event) {
    const writer = fs.createWriteStream(outputPath);

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

        if (event && event.sender) {
            event.sender.send('download-progress', {
                task: downloadedBytes,
                total: totalBytes
            });
        }
    });

    return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', (err) => {
            fs.unlink(outputPath, () => reject(err));
        });
        response.data.on('error', reject);
    });
}