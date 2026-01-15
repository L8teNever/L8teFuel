// L8teFuel - Favoriten & Fahrtenbuch Features
// Kompakte funktionale Implementierung

// ===== FAVORITEN-ORTE =====

window.showAddFavoriteModal = function () {
    document.getElementById('addFavoriteModal').classList.remove('hidden');
};

window.closeAddFavoriteModal = function () {
    document.getElementById('addFavoriteModal').classList.add('hidden');
    // Clear form
    document.getElementById('favName').value = '';
    document.getElementById('favCity').value = '';
    document.getElementById('favLat').value = '';
    document.getElementById('favLng').value = '';
    document.getElementById('favIsHome').checked = false;
};

window.saveFavorite = async function () {
    const name = document.getElementById('favName').value.trim();
    const city = document.getElementById('favCity').value.trim();
    const lat = parseFloat(document.getElementById('favLat').value);
    const lng = parseFloat(document.getElementById('favLng').value);
    const isHome = document.getElementById('favIsHome').checked;

    if (!name || !city || !lat || !lng) {
        alert('Bitte alle Felder ausfüllen');
        return;
    }

    try {
        const res = await fetch(`/favorite-locations?name=${encodeURIComponent(name)}&city=${encodeURIComponent(city)}&latitude=${lat}&longitude=${lng}&is_home=${isHome}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            closeAddFavoriteModal();
            loadFavorites();
        } else {
            alert('Fehler beim Speichern');
        }
    } catch (err) {
        console.error(err);
        alert('Fehler: ' + err.message);
    }
};

window.loadFavorites = async function () {
    const list = document.getElementById('favoritesList');
    if (!list) return;

    try {
        const res = await fetch('/favorite-locations', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const favorites = await res.json();

        if (favorites.length === 0) {
            list.innerHTML = `
                <div class="glass rounded-2xl p-8 text-center border border-white/10">
                    <i class="fas fa-map-marker-alt text-4xl text-gray-600 mb-3"></i>
                    <p class="text-gray-400">Keine Favoriten vorhanden</p>
                    <p class="text-gray-600 text-sm mt-2">Füge deine Lieblingsorte hinzu</p>
                </div>
            `;
            return;
        }

        // Load prices for all favorites
        const favoritesWithPrices = await Promise.all(favorites.map(async (fav) => {
            try {
                const priceRes = await fetch(`/favorite-locations/${fav.id}/prices?fuel_type=${currentFuelType}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const priceData = await priceRes.json();
                return { ...fav, prices: priceData };
            } catch {
                return { ...fav, prices: null };
            }
        }));

        list.innerHTML = favoritesWithPrices.map(fav => {
            const homeIcon = fav.is_home ? '🏠 ' : '';
            const price = fav.prices?.cheapest_price ? `${fav.prices.cheapest_price.toFixed(2)} €` : '—';
            const count = fav.prices?.station_count || 0;

            return `
                <div class="glass rounded-2xl p-4 border border-white/10 hover:border-yellow-400/30 transition">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <div class="font-black text-white text-sm mb-1">${homeIcon}${fav.name}</div>
                            <div class="text-gray-500 text-xs mb-2">${fav.city}</div>
                            <div class="flex items-center space-x-3 text-xs">
                                <span class="text-yellow-400 font-black text-lg">${price}</span>
                                <span class="text-gray-600">${count} Stationen</span>
                            </div>
                        </div>
                        <button onclick="window.deleteFavorite(${fav.id})" class="text-red-500 hover:text-red-400 p-2">
                            <i class="fas fa-trash text-sm"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="text-red-500 text-center py-4">Fehler beim Laden</div>';
    }
};

window.deleteFavorite = async function (id) {
    if (!confirm('Favorit wirklich löschen?')) return;

    try {
        const res = await fetch(`/favorite-locations/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            loadFavorites();
        }
    } catch (err) {
        console.error(err);
        alert('Fehler beim Löschen');
    }
};

// ===== FAHRTENBUCH =====

window.showAddFuelLogModal = function () {
    document.getElementById('addFuelLogModal').classList.remove('hidden');
};

window.closeAddFuelLogModal = function () {
    document.getElementById('addFuelLogModal').classList.add('hidden');
    // Clear form
    document.getElementById('logStation').value = '';
    document.getElementById('logCity').value = '';
    document.getElementById('logLiters').value = '';
    document.getElementById('logPrice').value = '';
    document.getElementById('logOdometer').value = '';
    document.getElementById('logFuelType').value = 'diesel';
};

window.saveFuelLog = async function () {
    const station = document.getElementById('logStation').value.trim();
    const city = document.getElementById('logCity').value.trim();
    const liters = parseFloat(document.getElementById('logLiters').value);
    const price = parseFloat(document.getElementById('logPrice').value);
    const odometer = document.getElementById('logOdometer').value ? parseFloat(document.getElementById('logOdometer').value) : null;
    const fuelType = document.getElementById('logFuelType').value;

    if (!station || !liters || !price) {
        alert('Bitte Tankstelle, Liter und Preis angeben');
        return;
    }

    try {
        let url = `/fuel-logs?station_name=${encodeURIComponent(station)}&liters=${liters}&price_per_liter=${price}&fuel_type=${fuelType}`;
        if (city) url += `&city=${encodeURIComponent(city)}`;
        if (odometer) url += `&odometer=${odometer}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            closeAddFuelLogModal();
            loadFuelLogs();
        } else {
            alert('Fehler beim Speichern');
        }
    } catch (err) {
        console.error(err);
        alert('Fehler: ' + err.message);
    }
};

window.loadFuelLogs = async function () {
    const list = document.getElementById('fuelLogList');
    const statsDiv = document.getElementById('fuelStats');
    if (!list) return;

    try {
        // Load logs
        const logsRes = await fetch('/fuel-logs', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const logs = await logsRes.json();

        // Load statistics
        const statsRes = await fetch('/fuel-logs/statistics', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await statsRes.json();

        // Display statistics
        if (stats.total_logs > 0) {
            statsDiv.innerHTML = `
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div>
                        <div class="text-gray-500 text-xs mb-1">Einträge</div>
                        <div class="text-yellow-400 font-black text-lg">${stats.total_logs}</div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">Ø Verbrauch</div>
                        <div class="text-yellow-400 font-black text-lg">${stats.average_consumption ? stats.average_consumption.toFixed(1) + ' L' : '—'}</div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">Ø Preis</div>
                        <div class="text-yellow-400 font-black text-lg">${stats.average_price_per_liter.toFixed(2)} €</div>
                    </div>
                    <div>
                        <div class="text-gray-500 text-xs mb-1">Gesamt</div>
                        <div class="text-yellow-400 font-black text-lg">${stats.total_cost.toFixed(0)} €</div>
                    </div>
                </div>
            `;
        } else {
            statsDiv.innerHTML = '';
        }

        // Display logs
        if (logs.length === 0) {
            list.innerHTML = `
                <div class="glass rounded-2xl p-8 text-center border border-white/10">
                    <i class="fas fa-gas-pump text-4xl text-gray-600 mb-3"></i>
                    <p class="text-gray-400">Keine Einträge vorhanden</p>
                    <p class="text-gray-600 text-sm mt-2">Füge deine erste Tankfüllung hinzu</p>
                </div>
            `;
            return;
        }

        list.innerHTML = logs.map(log => {
            const date = new Date(log.date).toLocaleDateString('de-DE');
            const fuelTypeLabel = log.fuel_type === 'diesel' ? 'Diesel' : log.fuel_type === 'e5' ? 'E5' : 'E10';

            return `
                <div class="glass rounded-2xl p-4 border border-white/10">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex-1">
                            <div class="font-black text-white text-sm">${log.station_name}</div>
                            <div class="text-gray-500 text-xs">${date}${log.city ? ' • ' + log.city : ''}</div>
                        </div>
                        <button onclick="window.deleteFuelLog(${log.id})" class="text-red-500 hover:text-red-400 p-2">
                            <i class="fas fa-trash text-xs"></i>
                        </button>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-xs">
                        <div>
                            <div class="text-gray-600">Liter</div>
                            <div class="text-white font-bold">${log.liters.toFixed(1)} L</div>
                        </div>
                        <div>
                            <div class="text-gray-600">Preis</div>
                            <div class="text-white font-bold">${log.price_per_liter.toFixed(2)} €/L</div>
                        </div>
                        <div>
                            <div class="text-gray-600">Gesamt</div>
                            <div class="text-yellow-400 font-bold">${log.total_price.toFixed(2)} €</div>
                        </div>
                    </div>
                    ${log.consumption ? `
                        <div class="mt-2 pt-2 border-t border-white/5 text-xs">
                            <span class="text-gray-600">Verbrauch:</span>
                            <span class="text-green-400 font-bold ml-2">${log.consumption.toFixed(1)} L/100km</span>
                            ${log.kilometers_driven ? `<span class="text-gray-600 ml-2">(${log.kilometers_driven.toFixed(0)} km)</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="text-red-500 text-center py-4">Fehler beim Laden</div>';
    }
};

window.deleteFuelLog = async function (id) {
    if (!confirm('Eintrag wirklich löschen?')) return;

    try {
        const res = await fetch(`/fuel-logs/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            loadFuelLogs();
        }
    } catch (err) {
        console.error(err);
        alert('Fehler beim Löschen');
    }
};

// ===== HEATMAP =====

let heatmapLayer = null;

window.toggleHeatmap = async function (enabled) {
    if (!mapHome) return;

    try {
        // Save setting
        await fetch(`/me/settings/heatmap?show_heatmap=${enabled}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (enabled && stations.length > 0) {
            // Create heatmap from stations
            const heatData = stations.map(s => {
                // Color based on price
                let intensity = 0.5;
                if (s.price < 1.50) intensity = 0.2; // Green
                else if (s.price < 1.70) intensity = 0.4; // Yellow
                else if (s.price < 2.00) intensity = 0.7; // Orange
                else intensity = 1.0; // Red

                return [s.lat, s.lng, intensity];
            });

            if (heatmapLayer) {
                mapHome.removeLayer(heatmapLayer);
            }

            // Simple circle-based heatmap (Leaflet doesn't have built-in heatmap)
            // For production, use leaflet-heat plugin
            heatmapLayer = L.layerGroup();
            stations.forEach(s => {
                let color = '#22c55e'; // green
                if (s.price > 1.70) color = '#facc15'; // yellow
                if (s.price > 1.85) color = '#fb923c'; // orange
                if (s.price > 2.00) color = '#ef4444'; // red

                L.circle([s.lat, s.lng], {
                    radius: 200,
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.3,
                    weight: 1
                }).addTo(heatmapLayer);
            });

            heatmapLayer.addTo(mapHome);
        } else if (heatmapLayer) {
            mapHome.removeLayer(heatmapLayer);
            heatmapLayer = null;
        }

    } catch (err) {
        console.error('Heatmap error:', err);
    }
};

console.log('✅ Favoriten & Fahrtenbuch Features loaded');
