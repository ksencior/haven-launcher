const createInstancePage = document.getElementById('create-instance-page');
const modpacksBtnOpen = document.getElementById('createCustomPackBtn');
const modpacksBtnClose = document.getElementById('backToModpacksBtn');
const modpacksBtnConfirm = document.getElementById('confirmCreateInstanceBtn');
const modpacksVersionSelect = document.getElementById('newInstanceVersion');
const modpacksLoaderSelect = document.getElementById('newInstanceLoader');
const modpacksLoaderGroup = document.getElementById('loaderGroup');
const modpacksLoaderHint = document.getElementById('loaderHint');

const modSearchInput = document.getElementById('modSearchInput');
const modsContainer = document.getElementById('mods-list-container');


let searchTimeout;
let currentEditingPack = null;

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

async function openModpackEditor(name, data) {
    currentEditingPack = {name, ...data}

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('edit-modpack-page').classList.add('active');

    document.getElementById('editPackTitle').innerText = `${name}`;
    document.getElementById('editPackDetails').innerText = `${data.loader} - Minecraft ${data.mcVersion}`;

    document.getElementById('mods-list-container').innerHTML = '<p style="text-align:center; color:var(--text-dim);">Wpisz coś w wyszukiwarkę, aby znaleźć mody...</p>'

    await loadInstalledMods(data.folderName);
}
async function loadInstalledMods(instanceFolder) {
    const container = document.getElementById('installed-mods-list');
    container.innerHTML = '<p style="color: var(--text-dim);">Wczytywanie modów...</p>';

    const mods = await window.api.getInstalledMods(instanceFolder);

    if (mods.length === 0) {
        container.innerHTML = '<p style="color: var(--text-dim); font-size: 13px;">Brak zainstalowanych modów.</p>';
        return;
    }

    container.innerHTML = '';
    mods.forEach(mod => {
        const item = document.createElement('div');
        item.className = 'installed-mod-item';
        item.style = `
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 10px; 
            background: #1a1a1a; 
            border-radius: 6px;
            border: 1px solid ${mod.enabled ? '#333' : '#aa222233'};
            opacity: ${mod.enabled ? '1' : '0.6'};
        `;

        item.innerHTML = `
            <span style="font-size: 13px; color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
                ${mod.name}
            </span>
            <input type="checkbox" ${mod.enabled ? 'checked' : ''} class="mod-toggle-switch">
        `;
        const checkbox = item.querySelector('.mod-toggle-switch');
        checkbox.onchange = async () => {
            const res = await window.api.toggleMod({
                instanceFolder: instanceFolder,
                filename: mod.filename,
                state: checkbox.checked
            });

            if (res.success) {
                loadInstalledMods(instanceFolder);
                window.scrollTo(item);
            }
        };

        container.appendChild(item);
    })
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
            packDiv.dataset.id = packData.id? packData.id : '';

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
            packDiv.oncontextmenu = (e) => {
                e.preventDefault();

                const oldMenu = document.getElementById('context-menu');
                if (oldMenu) oldMenu.remove();
                if (!packData.isCustom) return;
                const menu = document.createElement('div');
                menu.id = 'context-menu';
                menu.style.top  = `${e.pageY}px`;
                menu.style.left = `${e.pageX}px`;

                menu.innerHTML = `
                    <div class="menu-item" id="ctx-edit">🛠️ Edytuj mody</div>
                    <div class="menu-item delete" id="ctx-delete">🗑️ Usuń paczkę</div>
                `;

                document.body.appendChild(menu);

                document.getElementById('ctx-edit').onclick = () => {
                    if (!packData.isCustom) return;
                    openModpackEditor(name, packData);
                    menu.remove();
                }

                document.getElementById('ctx-delete').onclick = async () => {
                    if (!packData.isCustom) return;
                    const success = await window.api.deleteModpack(packData.id);
                    if (success) window.api.refreshModpacks();
                    if (success && selectedPack === packData.name) selectVersion('HavenPack 1.20.4');
                    menu.remove();
                }

                const closeMenu = () => {menu.remove(); document.removeEventListener('click', closeMenu);}
                setTimeout(() => document.addEventListener('click', closeMenu), 10);
            }
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

document.getElementById('backFromEditor').onclick = () => {
    document.getElementById('page-tools').classList.add('active');
    document.getElementById('edit-modpack-page').classList.remove('active');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
    }
})

modSearchInput.oninput = () => {
    clearTimeout(searchTimeout);
    const query = modSearchInput.value.trim();

    if (query.length < 3) return;

    searchTimeout = setTimeout(async () => {
        modsContainer.innerHTML = '<p style="text-align:center;">Szukanie...</p>';

        try {
            const { version, loader } = currentEditingPack;

            const mods = await window.api.searchMods({ query, version, loader });

            renderModsList(mods);
        } catch (err) {
            modsContainer.innerHTML = '<p style="color:red;">Błąd pobierania modów.</p>';
        }
    }, 500); 
};

function renderModsList(mods) {
    modsContainer.innerHTML = '';

    if (mods.length === 0) {
        modsContainer.innerHTML = '<p>Nie znaleziono żadnych modów dla tej wersji.</p>';
        return;
    }

    mods.forEach(mod => {
        const modCard = document.createElement('div');
        modCard.className = 'tool-card'; // Używamy Twoich istniejących styli
        
        const logoUrl = mod.links && mod.links.websiteUrl ? 
                        `https://www.curseforge.com/api/v1/mods/${mod.id}/logo` : '';

        const downloads = mod.downloadCount > 1000000 
            ? (mod.downloadCount / 1000000).toFixed(1) + 'M' 
            : (mod.downloadCount / 1000).toFixed(0) + 'K';

        modCard.innerHTML = `
            <div class="tool-icon">
                <img src="${mod.logo?.thumbnailUrl || 'https://i.imgur.com/83uE76H.png'}" style="width:100%; border-radius:5px;">
            </div>
            <div class="tool-info">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h4 style="margin:0;">${mod.name}</h4>
                    <span style="font-size:10px; color:var(--accent); font-weight:bold;">📥 ${downloads}</span>
                </div>
                <p style="font-size: 11px; color: gray;">${mod.summary.substring(0, 60)}...</p>
                <button class="btn-install" id="install-btn-${mod.id}" style="margin-top:5px; padding:4px 8px; font-size:10px;">Zainstaluj</button>
            </div>
        `;
        modsContainer.appendChild(modCard);

        const installBtn = modCard.querySelector(`#install-btn-${mod.id}`);
        installBtn.onclick = async () => {
            installBtn.innerText = 'Pobieranie...';
            installBtn.disabled = true;
            installBtn.style.opacity = '0.5';

            const data = {
                modId: mod.id,
                version: currentEditingPack.mcVersion,
                loader: currentEditingPack.loader,
                instanceFolder: currentEditingPack.folderName
            };

            const res = await window.api.installMod(data);
            if (res.success) {
                installBtn.innerText = 'Zainstalowano ✔️';
                installBtn.style.background = '#2ecc71';
                installBtn.style.borderColor = '#2ecc71';
                installBtn.style.opacity = '1';

                if (typeof loadInstalledMods === 'function') {
                    loadInstalledMods(currentEditingPack.folderName);
                }
            } else {
                installBtn.innerText = 'Błąd!';
                installBtn.style.background = '#e74c3c';
                installBtn.style.opacity = '1';
                setTimeout(() => {
                    installBtn.innerText = 'Spróbuj ponownie';
                    installBtn.disabled = false;
                    installBtn.style.background = '';
                }, 2000);
            }
        }
    })
}