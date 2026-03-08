ramSlider.oninput = function() {
    ramVal.innerHTML = this.value + "GB";
}

particlesCheck.onchange = () => {
    toggleParticles(particlesCheck.checked);
    window.api.saveSettings(getCurrentSettings());
}

function getCurrentSettings() {
    return {
        ram: ramSlider.value,
        minimizeToTray: trayCheck.checked,
        version: selectedPack,
        tyldaConsole: tyldaCheck.checked,
        particlesEnabled: particlesCheck.checked
    }
}

window.api.onLoadSettings((config) => {
    ramSlider.value = config.ram;
    ramVal.innerHTML = config.ram + "GB";
    trayCheck.checked = config.minimizeToTray || false;
    tyldaCheck.checked = config.tyldaConsole || false;
    particlesCheck.checked = config.particlesEnabled || true;
    if (config.version != null) {
        selectedPack = config.version;
    } else {
        selectedPack = 'HavenPack 1.20.4';
    }

    loadingScreen.style.display = 'none';
    mainLayout.style.display = 'flex';
    actionBar.style.display = 'flex';

    toggleParticles(particlesCheck.checked);
});