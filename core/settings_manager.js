ramSlider.oninput = function() {
    ramVal.innerHTML = this.value + "GB";
}

function getCurrentSettings() {
    return {
        ram: ramSlider.value,
        minimizeToTray: trayCheck.checked,
        version: selectedPack,
        tyldaConsole: tyldaCheck.checked
    }
}

window.api.onLoadSettings((config) => {
    ramSlider.value = config.ram;
    ramVal.innerHTML = config.ram + "GB";
    trayCheck.checked = config.minimizeToTray || false;
    tyldaCheck.checked = config.tyldaConsole || false;
    if (config.version != null) {
        selectedPack = config.version;
    } else {
        selectedPack = 'HavenPack 1.20.4';
    }

    loadingScreen.style.display = 'none';
    mainLayout.style.display = 'flex';
    actionBar.style.display = 'flex';
});