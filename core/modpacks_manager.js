const createInstancePage = document.getElementById('create-instance-page');
const modpacksBtnOpen = document.getElementById('createCustomPackBtn');
const modpacksBtnClose = document.getElementById('backToModpacksBtn');
const modpacksBtnConfirm = document.getElementById('confirmCreateInstanceBtn');
const modpacksVersionSelect = document.getElementById('newInstanceVersion');
const modpacksLoaderSelect = document.getElementById('newInstanceLoader');
const modpacksLoaderGroup = document.getElementById('loaderGroup');
const modpacksLoaderHint = document.getElementById('loaderHint');
const modpacksLoadersContainer = document.getElementById('modloaders-items-container');

const downloadModpackBtn = document.getElementById('downloadModpacksBtn');
const downloadModpackPage = document.getElementById('download-modpack-page');
const downloadModpackBackBtn = document.getElementById('backFromBrowser');
const browseModpacksContent = document.getElementById('browse-modpacks-content');
const browseModpacksInput = document.getElementById('search-ready-modpack');

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
    document.getElementById('editPackDetails').innerText = `${capitalizeString(data.loader)} | Minecraft ${data.mcVersion}`;

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
    playBtnText.innerText = 'GRAJ';
    container.innerHTML = '';
    mods.forEach(mod => {
        const item = document.createElement('div');
        item.className = 'installed-mod-item';
        item.style = `
            border: 1px solid ${mod.enabled ? '#333' : '#aa222233'};
            opacity: ${mod.enabled ? '1' : '0.6'};
        `;

        item.innerHTML = `
            <span style="font-size: 13px; color: #eee; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 250px;">
                ${mod.name}
            </span>
            <label class="s-control">
                <button class="btn-delete mod-uninstall-btn" style="margin-right: 10px;">Odinstaluj</button>
                <label class="switch">
                    <input type="checkbox" ${mod.enabled ? 'checked' : ''}  class="mod-toggle-switch">
                    <span class="slider-round"></span>
                </label>
            </label>
        `;
        const checkbox = item.querySelector('.mod-toggle-switch');
        const uninstallBtn = item.querySelector('.mod-uninstall-btn');
        uninstallBtn.onclick = async () => {
            uninstallBtn.innerText = 'Usuwanie...';
            uninstallBtn.disabled = true;
            const res = await window.api.uninstallMod({
                instanceFolder: instanceFolder,
                fileName: mod.filename
            });

            if (res.success) {
                uninstallBtn.innerText = 'Usunięto!';
                setTimeout(() => {
                    loadInstalledMods(instanceFolder);
                }, 1000);
            }
        }
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
    });
}

window.api.onLoadModpacks((modpacks) => {
    const container = document.getElementById('modpacks-container');
    container.innerHTML = '';

    const groups = {
        "Polecane": [],
        "Paczki HavenMine": [],
        "Własne paczki": [],
        "Vanilla": []
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
            groups["Własne paczki"].push({name, data: packData});
        }
    })

    Object.keys(groups).forEach(catName => {
        const categoryPacks = groups[catName];

        if (categoryPacks.length === 0) return;

        const section = document.createElement('div');
        section.className = 'category-section'

        if (catName === 'Vanilla' || catName == 'Paczki HavenMine') {
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
                    selectVersion(name);
                    openModpackEditor(name, packData);
                    menu.remove();
                }

                document.getElementById('ctx-delete').onclick = async () => {
                    if (!packData.isCustom) return;
                    const success = await window.api.deleteModpack(packData.id);
                    if (success) window.api.refreshModpacks();
                    if (success && selectedPack === name) selectVersion('HavenPack 1.20.4');
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
    modpacksLoadersContainer.innerHTML = `
        <div class="modloader-item" data-id='vanilla'>
            <div class="ml-icon">
                <img src="https://static.wikia.nocookie.net/animatorvsanimation/images/5/52/MinecraftIcon.png" alt="Modloader">
            </div>
            <div class="ml-info">
                <h4>Vanilla</h4>
            </div>
        </div>
        `;
    const parts = version.split('.');
    const minor = parseInt(parts[1]);

    if (minor >= 14) {
        modpacksLoaderSelect.innerHTML += '<option value="fabric">Fabric</option>';
        modpacksLoadersContainer.innerHTML += `
        <div class="modloader-item" data-id='fabric'>
            <div class="ml-icon">
                <img src="https://docs.fabricmc.net//logo.png" alt="Fabric">
            </div>
            <div class="ml-info">
                <h4>Fabric</h4>
            </div>
        </div>
        `;
    }

    if (minor >= 7) {
        modpacksLoaderSelect.innerHTML += '<option value="forge">Forge</option>';
        modpacksLoadersContainer.innerHTML += `
        <div class="modloader-item" data-id='forge'>
            <div class="ml-icon">
                <img src="https://avatars.githubusercontent.com/u/1390178?v=4" alt="Forge">
            </div>
            <div class="ml-info">
                <h4>Forge</h4>
            </div>
        </div>
        `;
    }

    document.querySelectorAll('.modloader-item').forEach(item => {
        item.onclick = () => {
            const id = item.dataset.id;
            modpacksLoaderSelect.value = id;
            document.querySelectorAll('.modloader-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active')
            console.log(item, id);
        }
    });
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
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-tools').classList.add('acitve');
            selectVersion(res.name);
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
            const { mcVersion, loader, folderName } = currentEditingPack;

            const mods = await window.api.searchMods({ query, mcVersion, loader });

            const installedMods = await window.api.getInstalledMods(folderName);

            renderModsList(mods, installedMods);
        } catch (err) {
            modsContainer.innerHTML = '<p style="color:red;">Błąd pobierania modów.</p>';
        }
    }, 500); 
};

function renderModsList(mods, installedMods = []) {
    modsContainer.innerHTML = '';

    if (mods.length === 0) {
        modsContainer.innerHTML = '<p>Nie znaleziono żadnych modów dla tej wersji.</p>';
        return;
    }

    mods.forEach(mod => {
        const modCard = document.createElement('div');
        modCard.className = 'mod-card';
        
        const logoUrl = mod.links && mod.links.websiteUrl ? 
                        `https://www.curseforge.com/api/v1/mods/${mod.id}/logo` : '';

        const downloads = mod.downloadCount > 1000000 
            ? (mod.downloadCount / 1000000).toFixed(1) + 'M' 
            : (mod.downloadCount / 1000).toFixed(0) + 'K';

        const slug = mod.slug ? mod.slug.toLowerCase() : mod.name.toLowerCase().replace(/\s+/g, '-');
        const firstWord = mod.name.toLowerCase().split(' ')[0];

        const isInstalled = installedMods.some(installed => {
            const fname = installed.filename.toLowerCase();
            return fname.includes(slug) || fname.includes(firstWord);
        })

        let btnHtml = '';
        if (isInstalled) {
            btnHtml = `<button class="btn-install" id="install-btn-${mod.id}" style="margin-top:5px; padding:4px 8px; font-size:10px; background:#333; color:#aaa; cursor:not-allowed;" disabled>Zainstalowano</button>`;
        } else {
            btnHtml = `<button class="btn-install" id="install-btn-${mod.id}" style="margin-top:5px; padding:4px 8px; font-size:10px;">Zainstaluj</button>`;
        }

        modCard.innerHTML = `
            <div class="m-icon">
                <img src="${mod.logo?.thumbnailUrl || 'https://i.imgur.com/83uE76H.png'}">
            </div>
            <div class="m-info">
                <div style="display:flex; flex-direction: column;">
                    <h4 style="margin:0;">${mod.name}</h4>
                    <p style="font-size: 11px; color: gray;">${mod.summary.substring(0, 60)}...</p>
                </div>
                <div style="display:flex; flex-direction: column;">
                    <span style="font-size:10px; color:var(--accent); font-weight:bold;">📥 ${downloads}</span>
                    ${btnHtml}
                </div>
            </div>
        `;
        modsContainer.appendChild(modCard);

        const installBtn = modCard.querySelector(`#install-btn-${mod.id}`);
        installBtn.onclick = async () => {
            if (isInstalled) return;
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

if (downloadModpackBtn) {
    downloadModpackBtn.onclick = () => {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        downloadModpackPage.classList.add('active');

        loadReadyModpacks();
    }
}

if (browseModpacksInput) {
    browseModpacksInput.oninput = () => {
        clearTimeout(searchTimeout);
        const query = browseModpacksInput.value.trim();

        searchTimeout = setTimeout(async () => {
            loadReadyModpacks(query);
        }, 500); 
    }
}

downloadModpackBackBtn.onclick = () => {
    document.querySelector('.nav-item.active').click();
}

async function loadReadyModpacks(query = '') {
    const container = browseModpacksContent;

    container.innerHTML = '<p>Ładowanie...</p>';
    try {
        const modpacks = await window.api.getReadyModpacks({ query: query });

        if (modpacks) {
            container.innerHTML = '';
            modpacks.forEach(mp => {
                if (!mp.latestFilesIndexes[0].modLoader === 1 && !mp.latestFilesIndexes[0].modLoader === 4) return;
                console.log(mp);
                const mpDiv = document.createElement('div');
                mpDiv.className = 'mp-browse-item';
                mpDiv.dataset.mpId = mp.id;

                const downloads = mp.downloadCount > 1000000 
                                ? (mp.downloadCount / 1000000).toFixed(1) + 'M' 
                                : (mp.downloadCount / 1000).toFixed(0) + 'K';

                mpDiv.innerHTML = `
                    <div class="mp-browse-icon">
                        <img src="${mp.logo.thumbnailUrl}">
                    </div>
                    <div class="mp-browse-info">
                        <h2>${mp.name}</h2>
                        <small>${mp.latestFiles[0].gameVersions[0]}</small>
                        <p>${mp.summary.substring(0, 60)}...</p>
                        <span style="font-size:10px; color:var(--accent); font-weight:bold;">📥 ${downloads}</span>
                    </div>
                    <div class="mp-browse-actions">
                        <button class='btn-install'>Zainstaluj</button>
                        <button class='btn-link'>Strona paczki ➜]</button>
                    </div>
                `;

                const installBtn    = mpDiv.querySelector('.btn-install');
                const linkBtn       = mpDiv.querySelector('.btn-link');

                installBtn.onclick = async () => {
                    installBtn.innerText = 'Instalowanie...';
                    installBtn.disabled = true;
                    installBtn.style.opacity = '0.5';

                    const res = await window.api.installReadyModpack(mp);

                    if (res && res.success) {
                        installBtn.innerText = 'Zainstalowano ✔️';
                        installBtn.style.background = '#2ecc71';
                        installBtn.style.borderColor = '#2ecc71';
                        installBtn.style.opacity = '1';
                        playBtnText.innerText = 'GRAJ';
                        window.api.refreshModpacks();
                    } else {
                        installBtn.innerText = 'Błąd!';
                        installBtn.style.background = '#e74c3c';
                        installBtn.style.opacity = '1';
                        playBtnText.innerText = 'GRAJ';
                        console.error("Błąd instalacji:", res?.error);
                        setTimeout(() => {
                            installBtn.innerText = 'Zainstaluj';
                            installBtn.disabled = false;
                            installBtn.style.background = '';
                        }, 3000);
                    }
                };

                linkBtn.onclick = () => {
                    if (mp.links && mp.links.websiteUrl) window.api.openExternalLink(mp.links.websiteUrl);
                }

                container.appendChild(mpDiv);
            });
        }
    } catch (error) {
        console.log(error);
        return;
    }
}

window.api.onModpackDownload(({ modsDownloaded, modsToDownload, packId }) => {
    console.log(`ID Paczki: ${packId} | ${modsDownloaded}/${modsToDownload}`);
    const items = document.querySelectorAll('.mp-browse-item');
    items.forEach(i => {
        if (i.dataset.mpId == packId) {
            const btn = i.querySelector('.btn-install');
            if (btn) btn.innerText = `${modsDownloaded}/${modsToDownload}`;
            return;
        }
    })
})