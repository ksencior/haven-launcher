# 🎮 HavenLauncher

![Electron](https://img.shields.io/badge/Electron-25+-blue?logo=electron)
![Node](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey)
![Status](https://img.shields.io/badge/Status-Active-success)

Modern custom Minecraft launcher built with **Electron + Node.js**, powered by `minecraft-launcher-core`.

---

## ✨ Features

- 🚀 Launch Vanilla Minecraft versions  
- 💾 Configurable RAM allocation  
- 📃 Live game console (reads `latest.log`)  
- ❌ Force-kill game process (no zombie `javaw.exe`)  
- 📊 Download progress bar  
- 🎨 Custom frameless UI  
- 👤 Dynamic skin preview (minotar)  

---

## 📂 Project Structure
- main.js → Electron main process
- preload.js → IPC bridge
- index.html/js → Main UI
- logs.html → Game console window

---

## ⚙️ How It Works

- Uses `minecraft-launcher-core` to download & launch the game  
- Reads `latest.log` in real time for **100% accurate logs**  
- Uses `taskkill /T /F` on Windows to properly terminate Java  

Game data location:
`%AppData%/HavenLauncher/`

---

## 🚀 Installation

```bash
git clone https://github.com/your-username/HavenLauncher.git
cd HavenLauncher
npm install
npm start
```

## 🛠 Requirements

- Node.js 18+
- Windows
- Java installed

## 📌 Status

Core features stable:

✔ Full game logs
✔ Clean process handling
✔ Persistent settings