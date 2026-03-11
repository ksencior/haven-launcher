const builder =                         require('electron-builder');
require('dotenv').config();

builder.build({
    config: {
        appId: "com.ksencior.havenlauncher",
        productName: "HavenLauncher",
        win: {
            target: "portable",
            icon: "icon.png"
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
        }
    }
})