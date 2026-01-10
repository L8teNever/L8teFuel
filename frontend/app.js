// App State
let token = localStorage.getItem('token');
let user = null;
let watchId = null;

// UI Elements
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const adminTab = document.getElementById('admin-tab');
const views = document.querySelectorAll('.tab-content');
const tabs = document.querySelectorAll('.nav-tab');

// --- Initialization ---
if (token) {
    initApp();
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Service Worker Registered'));
}

// --- Navigation ---
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        views.forEach(v => {
            v.classList.add('hidden');
            if (v.id === `tab-${target}`) v.classList.remove('hidden');
        });
        
        if (target === 'admin') loadUsers();
    });
});

// --- Auth Functions ---
document.getElementById('login-btn').addEventListener('click', async () => {
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
        initApp();
    } catch (err) {
        errorEl.textContent = err.message;
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    location.reload();
});

async function initApp() {
    try {
        const res = await fetch('/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Session abgelaufen');
        user = await res.json();

        loginView.classList.add('hidden');
        dashboardView.classList.remove('hidden');

        if (user.is_admin) adminTab.classList.remove('hidden');

        // Load settings into UI
        document.getElementById('set-radius').value = user.settings.radius;
        document.getElementById('set-price').value = user.settings.target_price || '';
        
        updateTrackerUI(user.settings.is_active);
        
        if (user.settings.is_active) {
            startTracking();
        }

        // Request Notifications
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

    } catch (err) {
        localStorage.removeItem('token');
        loginView.classList.remove('hidden');
    }
}

// --- Settings Functions ---
document.getElementById('save-settings').addEventListener('click', async () => {
    const radius = document.getElementById('set-radius').value;
    const price = document.getElementById('set-price').value;

    await fetch('/me/settings', {
        method: 'PUT',
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ radius: parseFloat(radius), target_price: parseFloat(price) })
    });
    alert('Einstellungen gespeichert!');
});

document.getElementById('change-pw-btn').addEventListener('click', async () => {
    const newPw = document.getElementById('new-password').value;
    if (!newPw) return;

    await fetch(`/me/password?new_password=${encodeURIComponent(newPw)}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    alert('Passwort erfolgreich geändert!');
    document.getElementById('new-password').value = '';
});

// --- Admin Functions ---
async function loadUsers() {
    const res = await fetch('/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
    const users = await res.json();
    const list = document.getElementById('users-list');
    list.innerHTML = users.map(u => `
        <div class="price-card" style="flex-direction: column; align-items: flex-start; gap: 0.5rem;">
            <div style="width: 100%; display: flex; justify-content: space-between;">
                <strong>${u.username} ${u.is_admin ? '(Admin)' : ''}</strong>
                <button onclick="resetUserPw('${u.username}')" class="secondary" style="width: auto; padding: 0.4rem 0.8rem; font-size: 0.75rem;">Reset PW</button>
            </div>
        </div>
    `).join('');
}

window.resetUserPw = async (username) => {
    const newPw = prompt(`Neues Passwort für ${username}:`);
    if (!newPw) return;
    await fetch(`/admin/users/${username}/reset-password?new_password=${encodeURIComponent(newPw)}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    alert('Passwort zurückgesetzt');
};

document.getElementById('admin-create-btn').addEventListener('click', async () => {
    const username = document.getElementById('admin-new-user').value;
    const password = document.getElementById('admin-new-pw').value;
    if (!username || !password) return;

    const res = await fetch(`/admin/users?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
        alert('Nutzer erstellt');
        loadUsers();
    } else {
        const data = await res.json();
        alert('Fehler: ' + data.detail);
    }
});

// --- Tracking Logic ---
const toggleBtn = document.getElementById('toggle-tracker');
toggleBtn.addEventListener('click', async () => {
    const newState = !user.settings.is_active;
    
    await fetch(`/me/settings?is_active=${newState}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    user.settings.is_active = newState;
    updateTrackerUI(newState);
    
    if (newState) {
        startTracking();
    } else {
        stopTracking();
    }
});

function updateTrackerUI(isActive) {
    const statusEl = document.getElementById('tracker-status');
    if (isActive) {
        statusEl.textContent = 'Aktiv';
        statusEl.className = 'status-badge status-active';
        toggleBtn.textContent = 'Tracker ausschalten';
        toggleBtn.style.background = 'rgba(239, 68, 68, 0.2)';
        toggleBtn.style.color = 'var(--danger)';
    } else {
        statusEl.textContent = 'Inaktiv';
        statusEl.className = 'status-badge status-inactive';
        toggleBtn.textContent = 'Tracker einschalten';
        toggleBtn.style.background = 'var(--primary)';
        toggleBtn.style.color = 'white';
        document.getElementById('price-results').classList.add('hidden');
    }
}

function startTracking() {
    if (!("geolocation" in navigator)) return;
    
    // Initial position
    navigator.geolocation.getCurrentPosition(updateLocation);
    
    // Constant watching
    watchId = navigator.geolocation.watchPosition(updateLocation, (err) => console.error(err), {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    });

    // Check prices immediately
    checkPrices();
    
    // Interval for price checks (every 5 minutes)
    window.priceInterval = setInterval(checkPrices, 1000 * 60 * 5);
}

function stopTracking() {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (window.priceInterval) clearInterval(window.priceInterval);
}

async function updateLocation(pos) {
    const { latitude, longitude } = pos.coords;
    await fetch(`/me/settings?latitude=${latitude}&longitude=${longitude}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Location updated:', latitude, longitude);
}

async function checkPrices() {
    if (!user.settings.is_active) return;
    
    try {
        const res = await fetch('/check-prices', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.matches && data.matches.length > 0) {
            displayMatches(data.matches);
            notifyUser(data.matches[0]);
        }
    } catch (err) {
        console.error('Error checking prices:', err);
    }
}

function displayMatches(matches) {
    const container = document.getElementById('price-results');
    const list = document.getElementById('matches-list');
    container.classList.remove('hidden');
    
    list.innerHTML = matches.map(m => `
        <div class="price-card animate-fade-in">
            <div>
                <strong>${m.name}</strong><br>
                <small>${m.distance.toFixed(1)} km entfernt</small>
            </div>
            <div style="text-align: right;">
                <div class="price-value">${m.price.toFixed(2)}€</div>
                <button onclick="navigate('${m.lat}', '${m.lng}')" class="secondary" style="width: auto; padding: 0.3rem 0.6rem; font-size: 0.7rem; margin-top: 0.5rem;">Führe mich dort hin</button>
            </div>
        </div>
    `).join('');
}

window.navigate = (lat, lng) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
};

function notifyUser(match) {
    if (Notification.permission === 'granted') {
        const notification = new Notification('L8teFuel: Günstiger Sprit!', {
            body: `${match.name} hat einen Preis von ${match.price.toFixed(2)}€. Tippen zum Navigieren.`,
            icon: 'icons/icon-192.png',
            tag: 'price-alert'
        });
        notification.onclick = () => {
            window.focus();
            window.navigate(match.lat, match.lng);
        };
    }
}
