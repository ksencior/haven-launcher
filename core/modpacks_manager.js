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
            const name = packObj.name;
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