const createInstancePage = document.getElementById('create-instance-page');
const modpacksBtnOpen = document.getElementById('createCustomPackBtn');
const modpacksBtnClose = document.getElementById('backToModpacksBtn');
const modpacksBtnConfirm = document.getElementById('confirmCreateInstanceBtn');
const modpacksVersionSelect = document.getElementById('newInstanceVersion');
const modpacksLoaderSelect = document.getElementById('newInstanceLoader');
const modpacksLoaderGroup = document.getElementById('loaderGroup');
const modpacksLoaderHint = document.getElementById('loaderHint');

function selectVersion(modpack) {
    selectedPack = modpack;
    const modpacks = document.querySelectorAll('.modpackOption');
    modpacks.forEach((pack) = (p) => {
        p.classList.remove('selected');
        const name = p.dataset.modpackname;
        if (name === selectedPack) {
            p.classList.add('selected')
        }
    });
    selectVersionBtn.innerText = modpack;
}

window.api.onLoadModpacks((modpacks) => {
    const container = document.getElementById('modpacks-container');
    container.innerHTML = '';

    const groups = {
        "Polecane": [],
        "Paczki HavenMine": [],
        "Vanilla": [],
        "Inne": []
    };

    Object.keys(modpacks).forEach(name => {
        const packData = modpacks[name];
        const nameLC = name.toLowerCase();

        if (packData.latest) {
            groups["Polecane"].push({name, data: packData});
        } else if (nameLC.includes('havenpack')) {
            groups["Paczki HavenMine"].push({name, data: packData});
        } else if (nameLC.includes('vanilla')) {
            groups["Vanilla"].push({name, data: packData});
        } else {
            groups["Inne"].push({name, data: packData});
        }
    })

    Object.keys(groups).forEach(catName => {
        const categoryPacks = groups[catName];

        if (categoryPacks.length === 0) return;

        const section = document.createElement('div');
        section.className = 'category-section'

        if (catName === 'Vanilla' || catName == 'Inne') {
            section.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `
            <span>${catName} <small style="color: var(--text-dim); font-size: 10px;">(${categoryPacks.length})</small></span> 
            <span class="category-toggle">▼</span>
        `;
        header.onclick = () => {
            section.classList.toggle('collapsed');
        };
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'category-grid';

        categoryPacks.forEach(packObj => {
            const name = packObj.data.name ? packObj.data.name : packObj.name;
            const packData = packObj.data;

            const packDiv = document.createElement('div');
            packDiv.className = 'modpackOption';
            packDiv.dataset.modpackname = name;

            let icon;
            let opis;
            if (name.toLowerCase().includes('havenpack')) {
                icon = '⭐';
                opis = 'Modpack specjalnie przygotowany przez administrację HavenMine!';
            } else if (name.toLowerCase().includes('vanilla')) {
                icon = '🌍';
                opis = 'Czysty Minecraft. Dla graczy, którzy nie potrzebują modyfikacji.'
            } else if (packData.latest) {
                icon = '🚀';
                opis = 'Zawsze aktualna wersja Minecrafta. '
            } else {
                icon = '📦';
                opis = 'Nieznana zmodyfikowana paczka modów.';
            }
            packDiv.innerHTML = `
            <div class="tool-card">
                <div class="tool-icon">${icon}</div>
                <div class="tool-info">
                    <h4>${name}</h4>
                    <p>${opis}</p>
                </div>
            </div>
            `;
            packDiv.onclick = () => selectVersion(name);
            grid.appendChild(packDiv);
        });
        section.appendChild(grid);
        container.appendChild(section);
    })

    selectVersion(selectedPack);
});

if (modpacksBtnOpen) {
    modpacksBtnOpen.onclick = () => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        createInstancePage.classList.add('active');

        loadMinecraftVersions();
    }
}

modpacksBtnClose.onclick = () => {
    document.querySelector('.nav-item.active').click();
}

async function loadMinecraftVersions() {
    if (modpacksVersionSelect.options.length > 1) return;

    try {
        const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        const data = await res.json();
        const releases = data.versions.filter(v => v.type === 'release');

        modpacksVersionSelect.innerHTML = '<option value="" disabled selected>Wybierz wersję z listy...</option>';
        releases.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.innerText = v.id;
            modpacksVersionSelect.appendChild(opt);
        });
    } catch (err) {
        modpacksVersionSelect.innerHTML = '<option value="">Błąd ładowania list wersji</option>';
        console.error("Nie udało się pobrać wersji:", err);
    }
}

modpacksVersionSelect.onchange = () => {
    const version = modpacksVersionSelect.value;
    modpacksLoaderGroup.style.opacity = '1';
    modpacksLoaderGroup.style.pointerEvents = 'all';
    modpacksLoaderHint.style.display = 'none';

    modpacksLoaderSelect.innerHTML = '<option value="vanilla">Vanilla (Brak modów)</option>';

    const parts = version.split('.');
    const minor = parseInt(parts[1]);

    if (minor >= 14) {
        modpacksLoaderSelect.innerHTML += '<option value="fabric">Fabric</option>';
    }

    if (minor >= 7) {
        modpacksLoaderSelect.innerHTML += '<option value="forge">Forge</option>';
    }
}

modpacksBtnConfirm.onclick = async () => {
    const name = document.getElementById('newInstanceName').value;
    const version = modpacksVersionSelect.value;
    const loader = modpacksLoaderSelect.value;

    if (!name || !version) return;

    modpacksBtnConfirm.innerText = 'Tworzenie...';
    modpacksBtnConfirm.disabled = true;
    const res = await window.api.createCustomInstance( { name, version, loader } );

    if (res) {
        window.api.refreshModpacks();
        modpacksBtnConfirm.innerText = 'Gotowe!'
        setTimeout(() => {
            modpacksBtnConfirm.disabled = false;
            modpacksBtnConfirm.innerText = 'Utwórz instancję';
            document.getElementById('newInstanceName').value = '';
            modpacksBtnClose.click();
        }, 1000);
    } else {
        modpacksBtnConfirm.innerText = 'Wystąpił błąd.'
        setTimeout(() => {
            modpacksBtnConfirm.disabled = false;
            modpacksBtnConfirm.innerText = 'Utwórz instancję';
            document.getElementById('newInstanceName').value = '';
            modpacksBtnClose.click();
        }, 1000);
    }
}