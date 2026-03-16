const skinCanvas = document.getElementById('skin_container');
const skinResetBtn = document.getElementById('resetSkinBtn');
const skinStatus = document.getElementById('skinStatus');
const skinDropZone = document.getElementById('skinDropZone');
const skinInput = document.getElementById('skinFileInput');
const skinUploadBtn = document.getElementById('uploadSkinBtn');

if (skinCanvas && window.skinview3d) {
    const SKIN_API_BASE = 'https://havenmine.pl/havenlauncher/api/skins';
    const SKIN_UPLOAD_URL = 'https://havenmine.pl/havenlauncher/api/skins/upload.php';
    const SKIN_DELETE_URL = 'https://havenmine.pl/havenlauncher/api/skins/delete.php';
    let launcherId = null;
    let currentAccount = null;
    let currentUsername = (typeof activeAccount !== 'undefined' && activeAccount?.name) ? activeAccount.name : 'Steve';
    let pendingSkinDataUrl = null;
    let pendingSkinFile = null;
    let loadSeq = 0;
    let lastObjectUrl = null;
    let pendingAccountForLoad = null;

    const showStatus = (msg, isError = false) => {
        if (!skinStatus) return;
        skinStatus.innerText = msg;
        skinStatus.style.color = isError ? '#e74c3c' : '#2ecc71';
    };

    const createViewer = () => {
        const viewer = new skinview3d.SkinViewer({
            canvas: skinCanvas,
            width: 320,
            height: 420,
            skin: `https://minotar.net/skin/${currentUsername}`
        });
        viewer.animation = new skinview3d.WalkingAnimation();
        return viewer;
    };

    const viewer = createViewer();

    const safeLoadSkin = async (source, fallbackUsername) => {
        try {
            await viewer.loadSkin(source);
            return true;
        } catch (e) {
            if (fallbackUsername) {
                try {
                    await viewer.loadSkin(`https://minotar.net/skin/${fallbackUsername}`);
                    return true;
                } catch (e2) {}
            }
            console.warn('[SKINS] Failed to load skin:', e);
            return false;
        }
    };

    const resizeViewer = () => {
        const parent = skinCanvas.parentElement || skinCanvas;
        const rect = parent.getBoundingClientRect();
        const width = Math.max(240, Math.floor(rect.width));
        const height = Math.max(320, Math.floor(rect.height));
        viewer.setSize(width, height);
    };
    resizeViewer();
    const observer = new ResizeObserver(resizeViewer);
    observer.observe(skinCanvas.parentElement || skinCanvas);

    const getActiveAccount = () => {
        try {
            if (typeof activeAccount !== 'undefined' && activeAccount) return activeAccount;
        } catch (e) {}
        try {
            if (window.activeAccount) return window.activeAccount;
        } catch (e) {}
        return null;
    };

    const ensureLauncherId = () => {
        if (launcherId) return launcherId;
        if (window.launcherId) return window.launcherId;
        return null;
    };

    const hashString = async (value) => {
        try {
            const enc = new TextEncoder();
            const buf = await crypto.subtle.digest('SHA-256', enc.encode(value));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            return btoa(unescape(encodeURIComponent(value))).replace(/=+$/, '');
        }
    };

    const canBuildKey = (account) => {
        const acc = account || {};
        const idPart = acc.accountId || acc.auth?.uuid || acc.auth?.profile?.id || acc.id || null;
        const launcherPart = ensureLauncherId();
        return !!(idPart && launcherPart);
    };

    const buildSkinKey = async (account) => {
        const acc = account || {};
        const idPart = acc.accountId || acc.auth?.uuid || acc.auth?.profile?.id || acc.id || null;
        const launcherPart = ensureLauncherId();
        if (!idPart || !launcherPart) return null;
        return hashString(`${launcherPart}:${idPart}`);
    };

    const resolveSkinSource = async (account) => {
        const username = account?.name || 'Steve';
        const key = await buildSkinKey(account);
        console.log(`[SKINS] Fetching for ${account?.name}`);
        if (key) {
            const cacheBust = Date.now();
            console.log(`[SKINS] Fetched: ${SKIN_API_BASE}/${key}.png?ts=${cacheBust}`);
            return `${SKIN_API_BASE}/${key}.png?ts=${cacheBust}`;
        }
        console.log(`[SKINS] Fetched: https://minotar.net/skin/${username}`);
        return `https://minotar.net/skin/${username}`;
    };

    const loadSkinForAccount = async (account) => {
        currentAccount = account;
        currentUsername = account?.name || 'Steve';
        const seq = ++loadSeq;
        const source = await resolveSkinSource(account);
        if (seq !== loadSeq) return;
        await safeLoadSkin(source, currentUsername);
        pendingSkinDataUrl = null;
        pendingSkinFile = null;
        if (skinUploadBtn) skinUploadBtn.disabled = true;
    };

    const maybeLoadPendingAccount = () => {
        if (pendingAccountForLoad && canBuildKey(pendingAccountForLoad)) {
            const acc = pendingAccountForLoad;
            pendingAccountForLoad = null;
            loadSkinForAccount(acc);
            return true;
        }
        return false;
    };

    const syncFromActiveAccount = () => {
        const acc = getActiveAccount();
        if (!acc) return false;
        if (!canBuildKey(acc)) return false;
        if (currentAccount?.accountId === acc.accountId && currentAccount?.name === acc.name) return true;
        loadSkinForAccount(acc);
        return true;
    };

    if (window.api?.onLoadSettings) {
        window.api.onLoadSettings((config) => {
            launcherId = config?.launcherId || launcherId;
            if (launcherId) window.launcherId = launcherId;
            if (!maybeLoadPendingAccount()) {
                syncFromActiveAccount();
            }
        });
    }

    if (window.api?.getConfig) {
        window.api.getConfig().then((config) => {
            launcherId = config?.launcherId || launcherId;
            if (launcherId) window.launcherId = launcherId;
            if (!maybeLoadPendingAccount()) {
                syncFromActiveAccount();
            }
        }).catch(() => {});
    }

    let initialLoaded = false;

    let syncTries = 0;
    const syncTimer = setInterval(() => {
        if (!ensureLauncherId()) return;
        syncTries += 1;
        if (!initialLoaded) {
            if (maybeLoadPendingAccount() || syncFromActiveAccount()) {
                initialLoaded = true;
                clearInterval(syncTimer);
                return;
            }
        }
        if (syncTries >= 100) {
            clearInterval(syncTimer);
        }
    }, 200);

    document.addEventListener('accountChanged', (e) => {
        const acc = getActiveAccount() || { name: e?.detail?.username || 'Steve', accountId: e?.detail?.accountId };
        if (!canBuildKey(acc)) {
            pendingAccountForLoad = acc;
            return;
        }
        loadSkinForAccount(acc);
    });
    window.addEventListener('accountChanged', (e) => {
        const acc = getActiveAccount() || { name: e?.detail?.username || 'Steve', accountId: e?.detail?.accountId };
        if (!canBuildKey(acc)) {
            pendingAccountForLoad = acc;
            return;
        }
        loadSkinForAccount(acc);
    });

    const handleFile = (file) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.png')) {
            showStatus('Dozwolone są tylko pliki .png', true);
            return;
        }
        pendingSkinFile = file;
        const reader = new FileReader();
        reader.onload = () => {
            pendingSkinDataUrl = reader.result;
            safeLoadSkin(pendingSkinDataUrl, currentUsername);
            if (skinUploadBtn) skinUploadBtn.disabled = false;
            showStatus('Podgląd ustawiony. Kliknij "Zatwierdź zmiany".');
        };
        reader.onerror = () => {
            showStatus('Nie udało się wczytać pliku.', true);
        };
        reader.readAsDataURL(file);
    };

    if (skinDropZone && skinInput) {
        skinDropZone.addEventListener('click', () => skinInput.click());
        skinDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            skinDropZone.classList.add('drag-over');
        });
        skinDropZone.addEventListener('dragleave', () => {
            skinDropZone.classList.remove('drag-over');
        });
        skinDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            skinDropZone.classList.remove('drag-over');
            handleFile(e.dataTransfer.files?.[0]);
        });
        skinInput.addEventListener('change', (e) => {
            handleFile(e.target.files?.[0]);
        });
    }

    if (skinUploadBtn) {
        skinUploadBtn.addEventListener('click', async () => {
            if (!pendingSkinFile) return;
            const acc = getActiveAccount() || currentAccount || { name: currentUsername };
            const key = await buildSkinKey(acc);
            const formData = new FormData();
            formData.append('skin', pendingSkinFile);
            formData.append('key', key);
            formData.append('username', acc?.name || currentUsername);
            formData.append('launcherId', ensureLauncherId() || '');
            formData.append('accountId', acc?.accountId || '');

            try {
                const res = await fetch(SKIN_UPLOAD_URL, {
                    method: 'POST',
                    body: formData
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `HTTP ${res.status}`);
                }
                pendingSkinDataUrl = null;
                pendingSkinFile = null;
                skinUploadBtn.disabled = true;
                showStatus('Skórka wysłana na serwer.');
                await loadSkinForAccount(acc);
            } catch (e) {
                showStatus('Nie udało się wysłać skórki.', true);
            }
        });
    }

    if (skinResetBtn) {
        skinResetBtn.addEventListener('click', async () => {
            const acc = getActiveAccount() || currentAccount || { name: currentUsername };
            pendingSkinDataUrl = null;
            pendingSkinFile = null;
            showStatus('Przywracanie domyślnej skórki...');
            const key = await buildSkinKey(acc);
            if (key) {
                try {
                    const res = await fetch(SKIN_DELETE_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key })
                    });
                    if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        throw new Error(text || `HTTP ${res.status}`);
                    }
                } catch (e) {
                    console.warn('[SKINS] Failed to delete skin on server:', e);
                }
            }
            await safeLoadSkin(`https://minotar.net/skin/${acc?.name || currentUsername}`, acc?.name || currentUsername);
        });
    }
}
