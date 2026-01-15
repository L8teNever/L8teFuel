// App State & Security
let token = localStorage.getItem('token');
let tokenExpiry = localStorage.getItem('tokenExpiry');
let user = null;
let watchId = null;
let mapHome, userMarker, radiusCircle;
let stationMarkers = [];
let isTracking = false;
let currentFuelType = 'diesel';
let stations = []; // Replaces mockStations

// Token Management
function saveToken(newToken) {
    token = newToken;
    localStorage.setItem('token', newToken);

    // JWT tokens are valid for 30 days (set in backend)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    localStorage.setItem('tokenExpiry', expiryDate.toISOString());

    console.log('✅ Token saved, expires:', expiryDate.toLocaleDateString());
}

function clearToken() {
    token = null;
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiry');
    console.log('🔒 Token cleared');
}

function isTokenExpired() {
    if (!tokenExpiry) return true;

    const expiry = new Date(tokenExpiry);
    const now = new Date();

    return now > expiry;
}

// Check token validity on load
if (token && isTokenExpired()) {
    console.warn('⚠️ Token expired, clearing...');
    clearToken();
}

// UI References are grabbed dynamically inside functions or event listeners 
// to ensure DOM is ready, though app.js is at end of body so it should be fine.

// --- Initialization ---

if (token) {
    initApp();
}

// Service Worker Registration & Notification Setup
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(registration => {
            console.log('✅ Service Worker Registered');

            // Request notification permission
            if ('Notification' in window && Notification.permission === 'default') {
                // We'll request permission when user starts tracking
                console.log('📱 Notification permission not yet requested');
            }
        })
        .catch(err => console.error('❌ Service Worker registration failed:', err));
}

// Notification permission state
let notificationPermissionGranted = false;

// Request notification permission
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('⚠️ This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        notificationPermissionGranted = true;
        return true;
    }

    if (Notification.permission === 'denied') {
        console.warn('⚠️ Notification permission denied');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        notificationPermissionGranted = (permission === 'granted');

        if (notificationPermissionGranted) {
            console.log('✅ Notification permission granted');
            showLocalNotification(
                '🔔 Benachrichtigungen aktiviert!',
                'Du wirst jetzt benachrichtigt, wenn günstige Tankstellen in deiner Nähe sind.'
            );
            updateNotificationStatusUI(true);
        } else {
            console.warn('⚠️ Notification permission denied by user');
            updateNotificationStatusUI(false);
        }

        return notificationPermissionGranted;
    } catch (err) {
        console.error('❌ Error requesting notification permission:', err);
        return false;
    }
}

// Show local notification (without service worker)
function showLocalNotification(title, body, data = {}) {
    if (!notificationPermissionGranted) return;

    try {
        const notification = new Notification(title, {
            body: body,
            icon: '/icons/icon-512.png',
            badge: '/icons/icon-192.png',
            vibrate: [200, 100, 200],
            tag: 'fuel-alert',
            data: data
        });

        notification.onclick = () => {
            window.focus();
            notification.close();
            if (data.action === 'open-station' && data.stationIndex !== undefined) {
                window.openStationDetails(data.stationIndex);
            }
        };
    } catch (err) {
        console.error('❌ Error showing notification:', err);
    }
}

// Track last notification to prevent spam
let lastNotificationTime = 0;
let notifiedStations = new Set();

// Check if we should notify about this station
function shouldNotifyForStation(stationId, price) {
    const now = Date.now();
    const timeSinceLastNotification = now - lastNotificationTime;

    // Don't spam notifications - wait at least 5 minutes
    if (timeSinceLastNotification < 5 * 60 * 1000) {
        return false;
    }

    // Don't notify about the same station twice in 30 minutes
    if (notifiedStations.has(stationId)) {
        return false;
    }

    return true;
}

// Update notification status in UI
function updateNotificationStatusUI(enabled) {
    const statusEl = document.getElementById('notificationStatus');
    if (statusEl) {
        if (enabled) {
            statusEl.classList.remove('hidden');
        } else {
            statusEl.classList.add('hidden');
        }
    }
}

// --- Auth Functions ---

document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);

async function handleLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const loginBtn = document.getElementById('login-btn');

    // Validation
    if (!username || !password) {
        errorEl.textContent = 'Bitte Benutzername und Passwort eingeben';
        return;
    }

    // Disable button during login
    loginBtn.disabled = true;
    loginBtn.textContent = 'Anmelden...';
    errorEl.textContent = '';

    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    try {
        const res = await fetch('/token', {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'  // Include cookies if needed
        });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Login fehlgeschlagen');
        }

        const data = await res.json();

        // Save token securely
        saveToken(data.access_token);

        console.log('✅ Login successful');
        errorEl.textContent = '';

        // Initialize app
        await initApp();

    } catch (err) {
        console.error('❌ Login error:', err);
        errorEl.textContent = err.message || 'Login fehlgeschlagen';
        clearToken();
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'LOGIN';
    }
}

function handleLogout() {
    console.log('🔒 Logging out...');

    // Stop tracking if active
    if (isTracking) {
        stopTracking();
    }

    // Clear all session data
    clearToken();

    // Clear notification permissions state
    notificationPermissionGranted = false;

    // Reload to login screen
    location.reload();
}

async function initApp() {
    try {
        console.log('🔄 Initializing app...');

        const res = await fetch('/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            if (res.status === 401) {
                throw new Error('Session abgelaufen - bitte neu anmelden');
            }
            throw new Error('Fehler beim Laden der Benutzerdaten');
        }

        user = await res.json();
        console.log('✅ User loaded:', user.username);

        // Switch to Dashboard
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('view-dashboard').classList.add('view-active');
        document.getElementById('navbar').classList.remove('hidden');
        loadExploreList();

        // Load settings into UI
        if (user.settings) {
            document.getElementById('radiusInput').value = user.settings.radius;
            document.getElementById('radiusVal').innerText = user.settings.radius + ' km';

            document.getElementById('priceInput').value = user.settings.target_price || 2.50;
            document.getElementById('priceVal').innerText = (user.settings.target_price || 2.50) + ' €';

            // Restore active state
            if (user.settings.is_active) {
                console.log('🔄 Restoring active tracking state...');
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

        console.log('✅ App initialized successfully');

    } catch (err) {
        console.error('❌ Init error:', err);

        // Clear invalid token
        clearToken();

        // Show login screen
        document.getElementById('view-login').classList.remove('hidden');
        document.getElementById('view-dashboard').classList.remove('view-active');
        document.getElementById('navbar').classList.add('hidden');

        // Show error message
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.textContent = err.message || 'Session abgelaufen - bitte neu anmelden';
        }
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

        // Request notification permission when starting tracking
        if (Notification.permission !== 'granted') {
            await requestNotificationPermission();
        } else {
            notificationPermissionGranted = true;
            updateNotificationStatusUI(true);
        }

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

            // 🔔 Notification logic - notify when cheap stations found
            const cheapStations = stations.filter(s => s.price <= window.targetPrice);

            if (cheapStations.length > 0 && notificationPermissionGranted) {
                // Sort by price to get the cheapest
                cheapStations.sort((a, b) => a.price - b.price);
                const cheapest = cheapStations[0];

                // Create unique ID for this station
                const stationId = `${cheapest.name}-${cheapest.price}`;

                // Check if we should notify
                if (shouldNotifyForStation(stationId, cheapest.price)) {
                    console.log('🔔 Sending notification for cheap station:', cheapest.name);

                    // Update tracking
                    lastNotificationTime = Date.now();
                    notifiedStations.add(stationId);

                    // Clear old notifications after 30 minutes
                    setTimeout(() => {
                        notifiedStations.delete(stationId);
                    }, 30 * 60 * 1000);

                    // Find station index for click handler
                    const stationIndex = stations.indexOf(cheapest);

                    // Show notification
                    showLocalNotification(
                        `⛽ Günstiger Sprit gefunden!`,
                        `${cheapest.name}\n${cheapest.price.toFixed(2)} € • ${cheapest.distance.toFixed(1)} km entfernt`,
                        {
                            action: 'open-station',
                            stationIndex: stationIndex,
                            station: cheapest
                        }
                    );

                    console.log(`   💰 ${cheapest.name}: ${cheapest.price.toFixed(2)} € (${cheapest.distance.toFixed(1)} km)`);
                }
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
    const btn = document.getElementById('explore-fuel-' + type);
    if (btn) {
        btn.addEventListener('click', () => {
            exploreFuelType = type;
            document.querySelectorAll('.explore-fuel-btn').forEach(b => b.classList.remove('explore-fuel-active'));
            btn.classList.add('explore-fuel-active');
            loadExploreList(true); // Reload with loading indicator
        });
    }
});

// Explore Filter Updates (INDEPENDENT) - with debouncing via loadExploreList
const filterPriceEl = document.getElementById('filterPrice');
const filterDistEl = document.getElementById('filterDist');
const filterOpenEl = document.getElementById('filterOpen');
const searchInputEl = document.getElementById('searchInput');

if (filterPriceEl) {
    filterPriceEl.addEventListener('input', () => {
        loadExploreList();
    });
}

if (filterDistEl) {
    filterDistEl.addEventListener('input', () => {
        loadExploreList();
    });
}

if (filterOpenEl) {
    filterOpenEl.addEventListener('change', () => {
        loadExploreList(true);
    });
}

if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
        loadExploreList();
    });
}


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
let exploreLoadTimeout = null; // For debouncing

window.loadExploreList = async (showLoading = false) => {
    const list = document.getElementById('exploreList');
    if (!list) return;

    // Debounce: Clear previous timeout
    if (exploreLoadTimeout) {
        clearTimeout(exploreLoadTimeout);
    }

    // Show loading state if requested
    if (showLoading) {
        list.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20">
                <div class="w-16 h-16 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p class="text-gray-500 font-bold text-sm">Lade Tankstellen...</p>
            </div>
        `;
    }

    // Debounce the actual load
    exploreLoadTimeout = setTimeout(async () => {
        await performExploreSearch();
    }, 300);
};

async function performExploreSearch() {
    const list = document.getElementById('exploreList');
    if (!list) return;

    // Get search query
    const searchInput = document.getElementById('searchInput');
    const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : "";

    // Get INDEPENDENT filters from Explore page
    const filterPriceEl = document.getElementById('filterPrice');
    const filterDistEl = document.getElementById('filterDist');
    const filterOpenEl = document.getElementById('filterOpen');

    const maxPrice = filterPriceEl ? parseFloat(filterPriceEl.value) : 2.50;
    const maxDist = filterDistEl ? parseFloat(filterDistEl.value) : 15;
    const onlyOpen = filterOpenEl ? filterOpenEl.checked : true;

    // Update labels
    if (document.getElementById('filterPriceVal')) {
        document.getElementById('filterPriceVal').innerText = maxPrice.toFixed(2) + " €";
    }
    if (document.getElementById('filterDistVal')) {
        document.getElementById('filterDistVal').innerText = maxDist + " km";
    }

    // Check if user has location
    if (!user || !user.settings || !user.settings.latitude || !user.settings.longitude) {
        list.innerHTML = `
            <div class="col-span-full glass p-8 rounded-3xl text-center">
                <div class="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4 border border-yellow-400/20">
                    <i class="fas fa-location-crosshairs text-3xl text-yellow-400"></i>
                </div>
                <h3 class="text-xl font-black text-white mb-2">Keine Position verfügbar</h3>
                <p class="text-gray-400 text-sm mb-6">Aktiviere das Tracking im Dashboard, um Tankstellen in deiner Nähe zu finden.</p>
                <button onclick="window.switchView('dashboard')" class="bg-yellow-400 text-slate-900 font-black py-3 px-6 rounded-xl hover:bg-yellow-300 transition">
                    Zum Dashboard
                </button>
            </div>
        `;
        updateExploreCount(0);
        return;
    }

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

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        console.log('🔍 Explore Search Response:', data);

        if (data.status === 'active') {
            exploreStations = data.stations || [];
        } else if (data.status === 'no_location') {
            list.innerHTML = `
                <div class="col-span-full glass p-8 rounded-3xl text-center">
                    <div class="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-map-marker-alt text-3xl text-red-400"></i>
                    </div>
                    <h3 class="text-xl font-black text-white mb-2">Keine Position</h3>
                    <p class="text-gray-400 text-sm">Starte das Tracking, um deine Position zu ermitteln.</p>
                </div>
            `;
            updateExploreCount(0);
            return;
        } else {
            exploreStations = [];
        }

        // Apply client-side search filter
        let filtered = exploreStations;

        if (searchQuery) {
            filtered = exploreStations.filter(s => {
                return s.name.toLowerCase().includes(searchQuery);
            });
        }

        // Update count
        updateExploreCount(filtered.length);

        // Display results
        if (filtered.length === 0) {
            const hasStations = exploreStations.length > 0;
            list.innerHTML = `
                <div class="col-span-full glass p-8 rounded-3xl text-center">
                    <div class="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-${hasStations ? 'search' : 'gas-pump'} text-3xl text-gray-500"></i>
                    </div>
                    <h3 class="text-xl font-black text-white mb-2">
                        ${hasStations ? 'Keine Treffer' : 'Keine Tankstellen gefunden'}
                    </h3>
                    <p class="text-gray-400 text-sm">
                        ${hasStations
                    ? 'Versuche es mit anderen Suchbegriffen oder Filtern.'
                    : 'Erhöhe den Suchradius oder passe die Filter an.'}
                    </p>
                </div>
            `;
            return;
        }

        // Render station cards
        list.innerHTML = filtered.map((s, idx) => {
            const originalIdx = exploreStations.indexOf(s);

            // Determine price color based on value
            let priceColor = 'text-green-400';
            if (s.price > 1.70) priceColor = 'text-yellow-400';
            if (s.price > 1.85) priceColor = 'text-orange-400';
            if (s.price > 2.00) priceColor = 'text-red-400';

            return `
            <div class="glass p-4 md:p-5 rounded-2xl md:rounded-3xl hover:border-yellow-400/30 border border-white/10 transition-all duration-300 active:scale-95 cursor-pointer group" 
                 onclick="window.openExploreStationDetails(${originalIdx})">
                <div class="flex justify-between items-start mb-3 md:mb-4">
                    <div class="flex items-start flex-1 min-w-0">
                        <div class="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center mr-2 md:mr-3 shadow-lg group-hover:scale-110 transition-transform flex-shrink-0">
                            <i class="fas fa-gas-pump text-slate-900 text-sm md:text-lg"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-black text-xs md:text-sm text-white mb-1 truncate pr-2">${s.name}</div>
                            <div class="text-[8px] md:text-[9px] text-gray-500 font-black uppercase tracking-wider flex items-center flex-wrap">
                                <i class="fas fa-location-dot mr-1"></i>
                                <span>${s.distance.toFixed(1)} km</span>
                                <span class="mx-1 md:mx-2">•</span>
                                <span class="text-green-500"><i class="fas fa-clock mr-1"></i>Geöffnet</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex justify-between items-end pt-2 md:pt-3 border-t border-white/5">
                    <div class="text-[7px] md:text-[8px] text-gray-500 uppercase font-black tracking-widest">
                        ${s.fuel_type === 'diesel' ? 'Diesel' : s.fuel_type === 'e5' ? 'Super E5' : 'Super E10'}
                    </div>
                    <div class="text-xl md:text-2xl font-black ${priceColor}">
                        ${s.price.toFixed(2)} €
                    </div>
                </div>
            </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading explore list:', err);
        list.innerHTML = `
            <div class="col-span-full glass p-8 rounded-3xl text-center border border-red-500/20">
                <div class="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-exclamation-triangle text-3xl text-red-500"></i>
                </div>
                <h3 class="text-xl font-black text-white mb-2">Fehler beim Laden</h3>
                <p class="text-gray-400 text-sm mb-4">${err.message || 'Unbekannter Fehler'}</p>
                <button onclick="window.loadExploreList(true)" class="bg-yellow-400 text-slate-900 font-black py-2 px-4 rounded-xl text-sm hover:bg-yellow-300 transition">
                    <i class="fas fa-refresh mr-2"></i>Erneut versuchen
                </button>
            </div>
        `;
        updateExploreCount(0);
    }
}

function updateExploreCount(count) {
    const countEl = document.getElementById('exploreCount');
    if (countEl) {
        countEl.innerText = count;
    }
}


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
