// App State
let token = localStorage.getItem('token');
let user = null;
let watchId = null;
let mapHome, userMarker, radiusCircle;
let stationMarkers = [];
let isTracking = false;
let currentFuelType = 'diesel';
let stations = []; // Replaces mockStations

// UI References are grabbed dynamically inside functions or event listeners 
// to ensure DOM is ready, though app.js is at end of body so it should be fine.

// --- Initialization ---

if (token) {
    initApp();
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Service Worker Registered'));
}

// --- Auth Functions ---

document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);

async function handleLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    try {
        const res = await fetch('/token', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('Login fehlgeschlagen');
        const data = await res.json();
        token = data.access_token;
        localStorage.setItem('token', token);
        errorEl.textContent = '';
        initApp();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function handleLogout() {
    localStorage.removeItem('token');
    location.reload();
}

async function initApp() {
    try {
        const res = await fetch('/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Session abgelaufen');
        user = await res.json();

        // Switch to Dashboard
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('view-dashboard').classList.add('view-active');
        document.getElementById('navbar').classList.remove('hidden');

        // Load settings into UI
        if (user.settings) {
            document.getElementById('radiusInput').value = user.settings.radius;
            document.getElementById('radiusVal').innerText = user.settings.radius + ' km';

            document.getElementById('priceInput').value = user.settings.target_price || 2.50;
            document.getElementById('priceVal').innerText = (user.settings.target_price || 2.50) + ' €';

            // Restore active state
            if (user.settings.is_active) {
                // We need to visually toggle on without triggering the API call loop immediately
                window.toggleTracking(true, true);
            }
        }

        // Check debug settings and show warnings
        try {
            const debugRes = await fetch('/debug/settings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const debugData = await debugRes.json();

            console.log('🔧 Debug Info:', debugData);

            // Show warning if using test API key
            if (debugData.api_config?.is_test_key) {
                console.warn('⚠️ Using TEST API KEY - Only mock data will be returned!');
                console.warn('   Get a real API key from: https://creativecommons.tankerkoenig.de');
            }

            // Show warning if no location set
            if (!debugData.settings?.latitude || !debugData.settings?.longitude) {
                console.warn('⚠️ No location data set - Start tracking to set your location!');
            }
        } catch (debugErr) {
            console.error('Debug info fetch failed:', debugErr);
        }
    } catch (err) {
        console.error(err);
        localStorage.removeItem('token');
        document.getElementById('view-login').classList.remove('hidden');
    }
}

// --- Global Functions (exposed to window for HTML onclicks) ---

window.toggleTracking = async (active, skipApiUpdate = false) => {
    isTracking = active;
    const inactiveUI = document.getElementById('inactive-ui');
    const activeUI = document.getElementById('active-ui');

    // Update UI
    if (isTracking) {
        inactiveUI.classList.add('hidden');
        activeUI.classList.remove('hidden');
        initHomeMap();
        setTimeout(() => mapHome.invalidateSize(), 100);
        startTracking(); // Start Geolocation
    } else {
        inactiveUI.classList.remove('hidden');
        activeUI.classList.add('hidden');
        showRecenterBtn(false);
        stopTracking();
    }

    // Update Server if needed
    if (!skipApiUpdate && user) {
        user.settings.is_active = active; // Optimistic update
        await fetch(`/me/settings?is_active=${active}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    }
};

window.switchView = (viewName) => {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('view-active'));
    document.getElementById('view-' + viewName).classList.add('view-active');

    if (viewName !== 'dashboard') showRecenterBtn(false);

    ['dashboard', 'explore', 'settings'].forEach(name => {
        const btn = document.getElementById('nav-' + name);
        if (name === viewName) {
            btn.classList.add('nav-active');
            btn.classList.remove('text-gray-500');
        } else {
            btn.classList.remove('nav-active');
            btn.classList.add('text-gray-500');
        }
    });

    if (viewName === 'dashboard' && isTracking) setTimeout(() => mapHome.invalidateSize(), 300);
    window.scrollTo(0, 0);
};

window.recenterMap = () => {
    if (mapHome && userMarker) {
        mapHome.setView(userMarker.getLatLng(), 16, { animate: true });
        showRecenterBtn(false);
    }
};

window.toggleFilters = () => {
    document.getElementById('filterSection').classList.toggle('open');
};

window.closeStationDetails = () => {
    const sheet = document.getElementById('bottomSheet');
    const backdrop = document.getElementById('sheetBackdrop');
    sheet.classList.remove('sheet-visible');
    sheet.classList.add('sheet-hidden');
    backdrop.style.opacity = "0";
    setTimeout(() => {
        backdrop.classList.add('hidden');
    }, 400);
};

// --- Map & Logic ---

function initHomeMap() {
    if (mapHome) return;

    // Default coords: Berlin if no user location yet
    let startLat = 52.5200;
    let startLng = 13.4050;

    // Use saved user settings if available
    let hasSavedLoc = false;
    if (user && user.settings && user.settings.latitude && user.settings.longitude) {
        startLat = user.settings.latitude;
        startLng = user.settings.longitude;
        hasSavedLoc = true;
    }

    mapHome = L.map('map-home', { zoomControl: false, zoomSnap: 0.1 }).setView([startLat, startLng], 16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap'
    }).addTo(mapHome);

    mapHome.on('dragstart', () => showRecenterBtn(true));

    // If we have a saved location, show the marker immediately
    if (hasSavedLoc) {
        const arrowIcon = L.divIcon({
            className: 'user-marker-icon',
            html: `<div class="user-marker-container" id="userMarkerContainer" style="transform: rotate(0deg)"><i class="fas fa-location-arrow user-arrow"></i></div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        userMarker = L.marker([startLat, startLng], { icon: arrowIcon }).addTo(mapHome);
    }

    updateRadiusVisual();
}

function showRecenterBtn(show) {
    const btn = document.getElementById('recenterBtn');
    if (!btn) return;
    if (show) {
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        btn.style.transform = "translateX(-50%) scale(1)";
    } else {
        btn.style.opacity = "0";
        btn.style.pointerEvents = "none";
        btn.style.transform = "translateX(-50%) scale(0.75)";
    }
}

// --- Tracking Logic ---

function startTracking() {
    if (!("geolocation" in navigator)) return;

    // Initial and Watch
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            updateLocation(pos);
            // On first location fix, center map
            if (mapHome && !userMarker) {
                // Create marker first time
                const arrowIcon = L.divIcon({
                    className: 'user-marker-icon',
                    html: `<div class="user-marker-container" id="userMarkerContainer" style="transform: rotate(0deg)"><i class="fas fa-location-arrow user-arrow"></i></div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });
                userMarker = L.marker([pos.coords.latitude, pos.coords.longitude], { icon: arrowIcon }).addTo(mapHome);
                mapHome.setView([pos.coords.latitude, pos.coords.longitude], 16);
            } else if (mapHome && userMarker) {
                userMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
                // Update radius circle position too
                if (radiusCircle) radiusCircle.setLatLng([pos.coords.latitude, pos.coords.longitude]);
            }
        },
        (err) => console.error(err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    // Poll prices
    checkPrices();
    window.priceInterval = setInterval(checkPrices, 1000 * 60 * 5); // 5 min
}

function stopTracking() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (window.priceInterval) clearInterval(window.priceInterval);
}

async function updateLocation(pos) {
    const { latitude, longitude, heading } = pos.coords;

    // Update arrow rotation if heading is available
    if (heading !== null && document.getElementById('userMarkerContainer')) {
        document.getElementById('userMarkerContainer').style.transform = `rotate(${heading}deg)`;
    }

    // Debounce server update? For simplicity, we update on every significant change or just rely on the latest for checks.
    // Ideally we save to server so the check-prices endpoint uses the DB values.
    try {
        await fetch(`/me/settings?latitude=${latitude}&longitude=${longitude}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (e) { console.error("Loc update failed", e); }
}

async function checkPrices() {
    if (!isTracking) return;

    try {
        const res = await fetch('/check-prices', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        console.log('💰 Price Check Response:', data);

        if (data.status === 'active' || data.status === 'api_error') {
            stations = data.all_stations || []; // ALL stations for map display
            window.targetPrice = data.target_price || 999; // Store target price globally

            console.log(`📍 Found ${stations.length} stations in radius`);
            if (data.debug) {
                console.warn(`   ${data.debug}`);
            }
            if (data.error) {
                console.error(`   API Error: ${data.error}`);
            }

            updateStationMarkers();

            // Notification logic (simple: notify on nearest cheapest)
            const cheapStations = stations.filter(s => s.price <= window.targetPrice);
            if (cheapStations.length > 0 && Notification.permission === 'granted') {
                // Logic to prevent spamming notifications can be added here
            }
        } else if (data.status === 'inactive') {
            console.log('⏸️  Tracking is inactive or no location data available');
        }
    } catch (err) {
        console.error('Error checking prices:', err);
    }
}

// --- Map Markers & Explore List ---

function updateStationMarkers() {
    if (!mapHome) return;
    stationMarkers.forEach(m => mapHome.removeLayer(m));
    stationMarkers = [];

    const targetPrice = window.targetPrice || parseFloat(document.getElementById('priceInput').value);

    stations.forEach((s, idx) => {
        const currentPrice = s.price;
        const isCheap = currentPrice <= targetPrice;

        // Different sizes based on price
        // Cheap stations: large and prominent
        // Expensive stations: small and subtle
        const iconSize = isCheap ? [80, 36] : [50, 24];
        const iconAnchor = isCheap ? [40, 36] : [25, 24];
        const fontSize = isCheap ? '14px' : '10px';
        const fontWeight = isCheap ? '900' : '700';

        const icon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="price-marker ${isCheap ? 'cheap' : 'expensive'}" onclick="window.openStationDetails(${idx})" style="font-size: ${fontSize}; font-weight: ${fontWeight};">${currentPrice.toFixed(2)} €</div>`,
            iconSize: iconSize,
            iconAnchor: iconAnchor
        });
        const m = L.marker([s.lat, s.lng], { icon: icon }).addTo(mapHome);
        stationMarkers.push(m);
    });
}
// Expose for onclick
window.openStationDetails = (index) => {
    const station = stations[index];
    if (!station) return;

    document.getElementById('sheetName').innerText = station.name; // Backend sends "Brand - Street"
    document.getElementById('sheetPrice').innerText = station.price.toFixed(2) + " €";
    document.getElementById('sheetInfo').innerText = `${station.distance.toFixed(1)} km entfernt`;

    const statusEl = document.getElementById('sheetOpen');
    // Backend doesn't send "isOpen" explicitly in the 'matches' list (filtered out closed ones).
    // So assume open.
    statusEl.innerText = "Geöffnet";
    statusEl.className = "text-green-400 font-bold text-sm";

    document.getElementById('naviBtn').onclick = () => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
        window.open(url, '_blank');
    };

    const sheet = document.getElementById('bottomSheet');
    const backdrop = document.getElementById('sheetBackdrop');
    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.style.opacity = "1";
        sheet.classList.remove('sheet-hidden');
        sheet.classList.add('sheet-visible');
    }, 10);
};

// --- Settings & Event Listeners ---

// Fuel Type Buttons
['diesel', 'e5', 'e10'].forEach(type => {
    document.getElementById('fuel-' + type).addEventListener('click', () => {
        currentFuelType = type;
        document.querySelectorAll('.fuel-btn').forEach(btn => btn.classList.remove('fuel-btn-active'));
        document.getElementById('fuel-' + type).classList.add('fuel-btn-active');

        const labels = { 'diesel': 'Diesel', 'e5': 'Super E5', 'e10': 'Super E10' };
        document.getElementById('activeFuelDisplay').innerText = labels[type] + ' Monitoring';

        // Note: Currently backend decides price. Ideally we send type to backend.
        // For this task, we just update UI. 
        updateStationMarkers();
    });
});

// Explore Fuel Type Buttons (INDEPENDENT)
['diesel', 'e5', 'e10'].forEach(type => {
    document.getElementById('explore-fuel-' + type).addEventListener('click', () => {
        exploreFuelType = type;
        document.querySelectorAll('.explore-fuel-btn').forEach(btn => btn.classList.remove('explore-fuel-active'));
        document.getElementById('explore-fuel-' + type).classList.add('explore-fuel-active');
        loadExploreList(); // Reload with new fuel type
    });
});

// Explore Filter Updates (INDEPENDENT)
document.getElementById('filterPrice').addEventListener('input', () => {
    loadExploreList();
});
document.getElementById('filterDist').addEventListener('input', () => {
    loadExploreList();
});
document.getElementById('searchInput').addEventListener('input', () => {
    loadExploreList();
});


// Radius & Price Slider
document.getElementById('radiusInput').addEventListener('input', async (e) => {
    const val = e.target.value;
    document.getElementById('radiusVal').innerText = val + ' km';
    updateRadiusVisual();
    // Save to DB (debounced normally, here direct for simplicity)
    // await fetch... (omitted to avoid spam, maybe add change event)
});
document.getElementById('radiusInput').addEventListener('change', async (e) => {
    await fetch(`/me/settings?radius=${e.target.value}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    checkPrices();
});

document.getElementById('priceInput').addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('priceVal').innerText = val + ' €';
    updateStationMarkers();
    loadExploreList(); // Client side filter update
});
document.getElementById('priceInput').addEventListener('change', async (e) => {
    await fetch(`/me/settings?target_price=${e.target.value}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
});

function updateRadiusVisual() {
    if (!mapHome) return;
    const val = document.getElementById('radiusInput').value * 1000;
    if (radiusCircle) {
        radiusCircle.setRadius(val);
    } else if (userMarker) {
        // Create only if we have a center
        radiusCircle = L.circle(userMarker.getLatLng(), {
            radius: val, color: '#facc15', fillColor: '#facc15', fillOpacity: 0.1, weight: 1, dashArray: '5, 8'
        }).addTo(mapHome);
    }
}

// Explore List Search/Filter - INDEPENDENT from dashboard settings
let exploreStations = []; // Separate array for explore results
let exploreFuelType = 'diesel'; // Independent fuel type for explore

window.loadExploreList = async () => {
    const list = document.getElementById('exploreList');
    if (!list) return;

    // Get search query
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : "";

    // Get INDEPENDENT filters from Explore page
    const filterPriceEl = document.getElementById('filterPrice');
    const filterDistEl = document.getElementById('filterDist');

    const maxPrice = filterPriceEl ? parseFloat(filterPriceEl.value) : 2.50;
    const maxDist = filterDistEl ? parseFloat(filterDistEl.value) : 15;

    // Update labels
    if (document.getElementById('filterPriceVal')) document.getElementById('filterPriceVal').innerText = maxPrice.toFixed(2) + " €";
    if (document.getElementById('filterDistVal')) document.getElementById('filterDistVal').innerText = maxDist + " km";

    // Fetch from independent search endpoint
    try {
        const params = new URLSearchParams({
            radius: maxDist,
            max_price: maxPrice,
            fuel_type: exploreFuelType
        });

        const res = await fetch(`/search-stations?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        console.log('🔍 Explore Search Response:', data);

        if (data.status === 'active') {
            exploreStations = data.stations || [];
        } else {
            exploreStations = [];
        }

        // Apply search filter
        const filtered = exploreStations.filter(s => {
            return s.name.toLowerCase().includes(searchQuery);
        });

        if (filtered.length === 0) {
            list.innerHTML = `<p class="text-center text-gray-500 py-10 italic">Keine Ergebnisse gefunden.</p>`;
            return;
        }

        list.innerHTML = filtered.map((s, idx) => {
            const originalIdx = exploreStations.indexOf(s);

            return `
            <div class="glass p-5 rounded-3xl flex justify-between items-center transition-all active:scale-95 cursor-pointer" onclick="window.openExploreStationDetails(${originalIdx})">
                <div class="flex items-center">
                    <div class="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center mr-4 border border-white/5">
                         <i class="fas fa-gas-pump text-yellow-400"></i>
                    </div>
                    <div>
                        <div class="font-bold text-sm text-white">${s.name}</div>
                        <div class="text-[9px] text-gray-500 font-black uppercase mt-1 tracking-wider">${s.distance.toFixed(1)} km • <span class="text-green-500">Geöffnet</span></div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-black text-green-400">${s.price.toFixed(2)} €</div>
                    <div class="text-[8px] text-gray-500 uppercase font-black">${s.fuel_type || 'diesel'}</div>
                </div>
            </div>
        `}).join('');
    } catch (err) {
        console.error('Error loading explore list:', err);
        list.innerHTML = `<p class="text-center text-red-500 py-10">Fehler beim Laden der Tankstellen.</p>`;
    }
};

// Open station details from explore list
window.openExploreStationDetails = (index) => {
    const station = exploreStations[index];
    if (!station) return;

    document.getElementById('sheetName').innerText = station.name;
    document.getElementById('sheetPrice').innerText = station.price.toFixed(2) + " €";
    document.getElementById('sheetInfo').innerText = `${station.distance.toFixed(1)} km entfernt`;

    const statusEl = document.getElementById('sheetOpen');
    statusEl.innerText = "Geöffnet";
    statusEl.className = "text-green-400 font-bold text-sm";

    document.getElementById('naviBtn').onclick = () => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
        window.open(url, '_blank');
    };

    const sheet = document.getElementById('bottomSheet');
    const backdrop = document.getElementById('sheetBackdrop');
    backdrop.classList.remove('hidden');
    setTimeout(() => {
        backdrop.style.opacity = "1";
        sheet.classList.remove('sheet-hidden');
        sheet.classList.add('sheet-visible');
    }, 10);
};

// Initial Call to load list (empty initially)
loadExploreList();

// Admin Creation
document.getElementById('admin-create-btn').addEventListener('click', async () => {
    const user = document.getElementById('admin-new-user').value;
    const pass = document.getElementById('admin-new-pw').value;
    if (!user || !pass) return;

    try {
        const res = await fetch(`/admin/users?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) alert('User created');
        else alert('Error creating user');
    } catch (e) {
        alert(e.message);
    }
});
