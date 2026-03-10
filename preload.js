const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startMC: (options) => ipcRenderer.send('launch-game', options),
    saveSettings: (data) => ipcRenderer.send('save-settings', data),
    onLoadSettings: (callback) => ipcRenderer.on('load-settings', (event, data) => callback(data)),
    closeApp: () => ipcRenderer.send('window-close'),
    minimizeApp: () => ipcRenderer.send('window-minimize'),
    onProgress: (callback) => ipcRenderer.on('download-progress', (event, data) => callback(data)),
    onGameClosed: (callback) => ipcRenderer.on('game-closed', () => callback()),
    onLog: (callback) => ipcRenderer.on('mc-log', (event, data) => callback(data)),
    killGame: () => ipcRenderer.send('kill-game'),
    closeLogs: () => ipcRenderer.send('close-logs'),
    openLogs: () => ipcRenderer.send('open-logs'),
    pingServer: (ip) => ipcRenderer.invoke('ping-server', ip),
    onLoadModpacks: (callback) => ipcRenderer.on('load-modpacks', (event, data) => callback(data)),
    loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
    getAccounts: () => ipcRenderer.invoke('get-accounts'),
    saveAccounts: (accounts) => ipcRenderer.invoke('save-accounts', accounts),
    openLocalFiles: () => ipcRenderer.send('open-local-files'),
    getPopularMods: () => ipcRenderer.invoke('get-popular-mods'),
    createCustomInstance: (data) => ipcRenderer.invoke('create-custom-instance', data),
    refreshModpacks: () => ipcRenderer.send('refresh-modpacks'),
    onLoadingStatus: (callback) => ipcRenderer.on('loading-status', (event, data) => callback(data)),
    onAppReady: (callback) => ipcRenderer.on('app-ready', () => callback()),
    getSystemRam: () => ipcRenderer.invoke('get-system-ram'),
    searchMods: (data) => ipcRenderer.invoke('search-mods', data),
    deleteModpack: (packId) => ipcRenderer.invoke('delete-modpack', packId)
});