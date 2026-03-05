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
    openLogs: () => ipcRenderer.send('open-logs')
});