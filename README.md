# 🚀 HavenLauncher

![Electron](https://img.shields.io/badge/Electron-25+-blue?logo=electron)
![Node](https://img.shields.io/badge/Node.js-18+-green?logo=node.js)
![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey)
![Status](https://img.shields.io/badge/Status-Active-success)

**HavenLauncher** is a modern, lightweight, and stylish Minecraft launcher built with **Electron**. It is specifically designed for the HavenMine community, offering seamless integration with dedicated modpacks and an intuitive user experience.

---

## ✨ Key Features

- Automatic Modpack Installation: Downloads and extracts modpacks (like HavenPack) directly from the server API.
- Authentication System: Supports both Microsoft (Premium) accounts and Offline profiles.
- Live Server Status: Integrated with minecraft-server-util to display real-time player counts, server version, and latency (ping).
- Resource Management: Easy-to-use RAM slider to allocate memory for the game.
- Tray Minimization: Option to hide the launcher to the system tray while the game is running to save system resources.
- Advanced Console: A dedicated log window with syntax highlighting (INFO, WARN, ERROR) to track the game's launch process.
- Automated UI Personalization: Automatically injects and activates dedicated HavenMine Resource Packs on the first launch.
- Local File Access: Quick access button to open the launcher's root directory in File Explorer.

---

## 🚀 Getting Started

**Prerequisites**
- [Node.js](https://nodejs.org/en) (Version 18+ recommended)
- Java (The version required depends on the Minecraft version, e.g., Java 17 for MC 1.20.4)

**Development Setup**
1. Clone the repository:
  ```bash
  git clone https://github.com/ksencior/haven-launcher.git
  cd haven-launcher
  npm install
  npm start
  ```
2. Install dependencies:
  ```bash
  npm install
  ```
3. Run the application:
  ```bash
  npm start
  ```

## 📝 Configuration
The application stores user settings, accounts, and instances in:
`%AppData%/Roaming/HavenLauncher/`

## 🤝 Support
If you encounter any bugs, please open an **Issue** in this repository or contact the HavenMine server administration.

---
Created with ❤️ for the HavenMine Community.
---
