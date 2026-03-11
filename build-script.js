const builder =                         require('electron-builder');
require('dotenv').config();

builder.build({
    config: {
        appId: "com.ksencior.havenlauncher",
        productName: "HavenLauncher",
        win: {
            target: "nsis",
            icon: "icon.png",
            artifactName: "${productName}-Setup-${version}.${ext}"
        },
        nsis: {
            oneClick: true,
            perMachine: false,
            allowToChangeInstallationDirectory: true,
            createDesktopShortcut: true,
            warningsAsErrors: false,
            runAfterFinish: true
        },
        linux: {
            target: [
                "AppImage",
                "deb"
            ],
            icon: "icon.png",
            category: "Game"
        },
        directories: {
            output: "dist"
        },
        files: [
            "**/*",
            "!dist/*",
            "!build-script.js"
        ],
        extraMetadata: {
            CF_API_KEY: process.env.CF_API_KEY
        },
        publish: {
            provider: "github",
            owner: "ksencior",
            repo: "haven-launcher",
            releaseType: "release"
        }
    }
}).then(() => {
    console.log("Zbudowano aplikacje.");
}).catch((err) => {
    console.error(err);
})