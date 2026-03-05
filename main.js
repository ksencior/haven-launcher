const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();

const configPath = path.join(os.homedir(), 'AppData', 'Roaming', 'HavenLauncher', 'config.json');

let logWindow;
let gameProcess;

function loadConfig() {
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath));
    }
    return {nick: '', ram: 4, version: '1.21.10'};
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
    });

    win.loadFile('index.html');

    win.webContents.on('did-finish-load', () => {
        win.webContents.send('load-settings', loadConfig());
    });
}

function createLogWindow() {
    logWindow = new BrowserWindow({
        width: 1000,
        height: 600,
        title: "HavenLauncher - Konsola",
        backgroundColor: "#000000",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true
        },
        frame: false
    });
    logWindow.loadFile('logs.html');
    logWindow.on('closed', () => {logWindow = null;});
}

ipcMain.on('save-settings', (event, data) => {
    fs.writeFileSync(configPath, JSON.stringify(data));
})

app.whenReady().then(createWindow);

ipcMain.on('launch-game', (event, data) => {

    launcher.removeAllListeners();
    
    console.log("Launching new Minecraft process...");
    console.log(`Loading Minecraft ${data.version} for ${data.user}. Loaded memory: ${data.ram}GB RAM.`)
    if (logWindow) logWindow.close();
    createLogWindow();

    let opts = {
        authorization: Authenticator.getAuth(data.user),
        root: path.join(os.homedir(), 'AppData', 'Roaming', 'HavenLauncher'),
        version: {
            number: data.version,
            type: "release"
        },
        memory: {
            max: `${data.ram}G`,
            min: "2G"
        }
    };

    launcher.launch(opts).then(child => {
        gameProcess = child;
        console.log("Proces gry przypisany pomyslnie:", child.pid);
    }).catch(err => {
        if (logWindow) logWindow.webContents.send('mc-log', `[LAUNCHER/ERR] ${err.message}`);
    });
    const logFile = path.join(
        os.homedir(),
        'AppData',
        'Roaming',
        'HavenLauncher',
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
    })
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

ipcMain.handle('ping-server', async (event, host) => {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        
        socket.setTimeout(3000); // Max 3 sekundy czekania
        
        socket.on('connect', () => {
            const ping = Date.now() - start;
            socket.destroy();
            resolve(ping);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(null);
        });
        
        socket.on('error', () => {
            socket.destroy();
            resolve(null);
        });
        
        socket.connect(25565, host);
    });
});

ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win === logWindow) {
        logWindow.destroy();
        logWindow = null;
    } else if (win) {
        win.close();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});