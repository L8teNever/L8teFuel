// L8teFuel - Android Auto Integration
// Kostenlose Lösung via PWA + Sprachsteuerung

// ===== AUTO-MODUS =====

let isAutoMode = false;
let recognition = null;
let synthesis = window.speechSynthesis;

// Prüfe ob im Auto-Modus (große Bildschirme, Landscape)
function detectAutoMode() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const isLargeScreen = window.innerWidth >= 800;
    return isLandscape && isLargeScreen;
}

// Auto-Modus aktivieren
window.enableAutoMode = function () {
    isAutoMode = true;
    document.body.classList.add('auto-mode');
    console.log('🚗 Auto-Modus aktiviert');

    // Zeige Auto-UI
    updateAutoUI();

    // Starte Sprachsteuerung
    initVoiceControl();
};

// Auto-Modus deaktivieren
window.disableAutoMode = function () {
    isAutoMode = false;
    document.body.classList.remove('auto-mode');
    if (recognition) recognition.stop();
    console.log('🚗 Auto-Modus deaktiviert');
};

// Auto-UI aktualisieren
function updateAutoUI() {
    if (!isAutoMode) return;

    // Verstecke komplexe Elemente
    const hideElements = document.querySelectorAll('.auto-hide');
    hideElements.forEach(el => el.style.display = 'none');

    // Zeige nur wichtige Infos
    const autoElements = document.querySelectorAll('.auto-show');
    autoElements.forEach(el => el.style.display = 'block');
}

// ===== SPRACHSTEUERUNG =====

function initVoiceControl() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('⚠️ Spracherkennung nicht unterstützt');
        speak('Sprachsteuerung nicht verfügbar');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    recognition.lang = 'de-DE';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const last = event.results.length - 1;
        const command = event.results[last][0].transcript.toLowerCase();

        console.log('🎤 Befehl:', command);
        handleVoiceCommand(command);
    };

    recognition.onerror = (event) => {
        console.error('Sprachfehler:', event.error);
    };

    recognition.onend = () => {
        if (isAutoMode) {
            // Automatisch neu starten im Auto-Modus
            setTimeout(() => recognition.start(), 1000);
        }
    };

    recognition.start();
    speak('Sprachsteuerung aktiv. Sage zum Beispiel: Wo ist günstig tanken?');
}

// Voice Commands verarbeiten
function handleVoiceCommand(command) {
    // Günstigste Tankstelle finden
    if (command.includes('günstig') || command.includes('billig') || command.includes('preis')) {
        findCheapestStation();
    }
    // Tankstellen anzeigen
    else if (command.includes('tankstelle') || command.includes('suche')) {
        window.switchView('explore');
        speak('Zeige Tankstellen');
    }
    // Favoriten
    else if (command.includes('favorit') || command.includes('wohnort')) {
        window.switchView('favorites');
        speak('Zeige Favoriten');
    }
    // Dashboard
    else if (command.includes('karte') || command.includes('dashboard') || command.includes('live')) {
        window.switchView('dashboard');
        speak('Zeige Live-Karte');
    }
    // Hilfe
    else if (command.includes('hilfe') || command.includes('was kannst du')) {
        speak('Du kannst sagen: Wo ist günstig tanken, Zeige Tankstellen, Zeige Favoriten, oder Zeige Karte');
    }
    // Unbekannt
    else {
        speak('Befehl nicht verstanden. Sage Hilfe für Befehle.');
    }
}

// Günstigste Tankstelle finden
async function findCheapestStation() {
    speak('Suche günstigste Tankstelle');

    try {
        const res = await fetch('/search-stations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.status === 'active' && data.stations && data.stations.length > 0) {
            // Sortiere nach Preis
            const sorted = data.stations.sort((a, b) => a.price - b.price);
            const cheapest = sorted[0];

            speak(`Günstigste Tankstelle: ${cheapest.name}, ${cheapest.price.toFixed(2)} Euro pro Liter, ${cheapest.distance.toFixed(1)} Kilometer entfernt`);

            // Zeige auf Karte
            window.switchView('dashboard');

        } else {
            speak('Keine Tankstellen gefunden');
        }
    } catch (err) {
        console.error(err);
        speak('Fehler beim Suchen');
    }
}

// Text-to-Speech
function speak(text) {
    if (!synthesis) return;

    // Stoppe vorherige Ausgabe
    synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    synthesis.speak(utterance);
    console.log('🔊', text);
}

// ===== AUTO-MODUS TOGGLE =====

window.toggleAutoMode = function () {
    if (isAutoMode) {
        disableAutoMode();
    } else {
        enableAutoMode();
    }
};

// ===== QUICK ACTIONS FÜR AUTO =====

window.quickFindCheapest = function () {
    speak('Suche günstigste Tankstelle');
    findCheapestStation();
};

window.quickShowNearby = function () {
    speak('Zeige Tankstellen in der Nähe');
    window.switchView('explore');
    loadExploreList();
};

// ===== AUTO-START =====

// Automatisch im Auto-Modus starten wenn erkannt
window.addEventListener('load', () => {
    if (detectAutoMode()) {
        console.log('🚗 Auto-Modus erkannt');
        // Optional: Automatisch aktivieren
        // enableAutoMode();
    }
});

// Orientierung ändern
window.addEventListener('orientationchange', () => {
    if (detectAutoMode() && !isAutoMode) {
        console.log('🚗 Landscape-Modus erkannt');
    }
});

console.log('✅ Android Auto Features loaded');
console.log('💡 Nutze window.enableAutoMode() zum Aktivieren');
