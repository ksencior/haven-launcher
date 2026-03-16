let ramChanged = false;

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
        particlesEnabled: particlesCheck.checked,
        soundsEnabled: soundsCheck.checked
    }
}

window.api.onLoadSettings((config) => {
    ramSlider.value = config.ram;
    if (config.ram) ramChanged = true; 
    ramVal.innerHTML = config.ram + "GB";
    trayCheck.checked = config.minimizeToTray || false;
    tyldaCheck.checked = config.tyldaConsole || false;
    particlesCheck.checked = config.particlesEnabled || true;
    soundsCheck.checked = config.soundsEnabled || true;
    if (config.version != null) {
        selectedPack = config.version;
    } else {
        selectedPack = 'HavenPack 1.20.4';
    }
});

window.api.getSystemRam().then(ram => {
    ramSlider.max = ram.total;
    if (ramChanged) {
        ramSlider.value = ram.suggested;
        ramVal.innerHTML = ram.suggested + "GB";
    }
})