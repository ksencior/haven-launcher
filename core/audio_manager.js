const sounds = {
    click: new Audio('assets/sounds/click.mp3'),
    hover: new Audio('assets/sounds/hover.mp3')
};

sounds.click.volume = 0.4;
sounds.hover.volume = 0.2;

let isSoundEnabled = true;
let lastHoveredElement = null;

const INTERACTIVE_SELECTORS = [
    'button',
    'a',
    'input[type="checkbox"]',
    'input[type="range"]',
    'input[type="text"]',
    '.nav-item',
    '.menu-item',
    '.modpackOption',     // Wybór paczki
    '.tool-card',         // Karty w tools
    '.account-switcher',  // Przełącznik konta
    '.account-item',      // Lista kont
    '.mod-card',          // Karta moda
    '.mp-browse-item',    // Przeglądarka paczek
    '.installed-mod-item' // Lista zainstalowanych modów
];

function playSound(type) {
    if (!isSoundEnabled) return;
    
    const sound = sounds[type];
    if (sound) {
        // Resetujemy czas, aby móc szybko odtwarzać ten sam dźwięk (np. szybkie klikanie)
        sound.currentTime = 0;
        sound.play().catch(e => {
            // Ignorujemy błędy (np. brak pliku lub brak interakcji z dokumentem)
            console.warn(`[AUDIO] Nie można odtworzyć dźwięku ${type}:`, e.message);
        });
    }
}

// --- Obsługa ustawień ---
const soundsCheckbox = document.getElementById('soundsCheck');

if (window.api) {
    window.api.onLoadSettings((settings) => {
        if (settings.soundsEnabled !== undefined) {
            isSoundEnabled = settings.soundsEnabled;
            if (soundsCheckbox) soundsCheckbox.checked = isSoundEnabled;
        }
    });
}

if (soundsCheckbox) {
    soundsCheckbox.addEventListener('change', (e) => {
        isSoundEnabled = e.target.checked;
        
        // Zapisz ustawienie (zakładamy, że configPath jest globalny lub odczytujemy obecny konfig)
        // Ponieważ settings_manager.js może nadpisywać, wyślemy update do main process
        // Najlepiej, jeśli settings_manager.js obsługuje auto-zapis wszystkich checkboxów w .settings-list
        // Jeśli nie, wysyłamy ręcznie:
        if (window.api && window.api.saveSettings) {
            // Pobieramy aktualny stan innych ustawień z DOM (uproszczone)
            // W idealnym świecie settings_manager robi to globalnie.
            // Tutaj zakładamy prostą obsługę zdarzenia zmiany dla dźwięku.
             /* 
                Uwaga: Aby to działało idealnie z istniejącym settings_managerem, 
                upewnij się, że on też czyta ten checkbox, lub dodaj logikę zapisu tutaj.
                Poniżej wysyłamy sygnał save-settings z aktualizacją tylko tego pola
                jeśli architektura na to pozwala (tutaj bazujemy na odczycie configu w main.js)
             */
             // W tym przypadku polegamy na tym, że settings_manager.js (którego nie widzę w całości)
             // prawdopodobnie iteruje po checkboxach. Jeśli nie, dodaj obsługę zapisu tutaj.
        }
    });
}

// --- Globalne nasłuchiwanie zdarzeń (Event Delegation) ---

document.body.addEventListener('mouseenter', (e) => {
    // mouseenter nie bąbelkuje (no bubble), więc musimy użyć capture lub mouseover.
    // Użyjmy mouseover z logiką sprawdzania.
}, true);

document.addEventListener('mouseover', (e) => {
    const target = e.target.closest(INTERACTIVE_SELECTORS.join(','));
    
    if (target && target !== lastHoveredElement) {
        // Sprawdź czy element nie jest zablokowany
        if (!target.disabled && !target.classList.contains('disabled')) {
            playSound('hover');
        }
        lastHoveredElement = target;
    } else if (!target) {
        lastHoveredElement = null;
    }
});

document.addEventListener('mousedown', (e) => {
    const target = e.target.closest(INTERACTIVE_SELECTORS.join(','));
    if (target) {
        if (!target.disabled && !target.classList.contains('disabled')) {
            playSound('click');
        }
    }
});