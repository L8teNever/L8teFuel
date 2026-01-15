# L8teFuel - Neue Features Implementierungs-Plan

## ✅ Was wurde bereits implementiert

### 🗄️ **Datenbank-Modelle** (models.py)

#### 1. FavoriteLocation
```python
- name: String (z.B. "Wohnort", "Arbeit")
- city: String (Stadt/Ort)
- latitude, longitude: Float
- is_home: Boolean (Markierung als Wohnort)
- created_at: DateTime
```

#### 2. FuelLog (Fahrtenbuch)
```python
- station_name: String
- city: String
- liters: Float (Getankte Liter)
- price_per_liter: Float
- total_price: Float
- fuel_type: String (diesel/e5/e10)
- odometer: Float (Kilometerstand)
- kilometers_driven: Float
- consumption: Float (L/100km)
- date: DateTime
- notes: String
```

#### 3. UserSettings (erweitert)
```python
- show_heatmap: Boolean (Toggle für Heatmap)
```

## 🚧 Noch zu implementieren

### Backend (main.py)

#### Favoriten-Orte Endpoints
```python
POST   /favorite-locations          # Ort hinzufügen
GET    /favorite-locations          # Alle Favoriten abrufen
GET    /favorite-locations/{id}     # Einen Favoriten abrufen
PUT    /favorite-locations/{id}     # Favoriten bearbeiten
DELETE /favorite-locations/{id}     # Favoriten löschen
GET    /favorite-locations/{id}/prices  # Preise für Favoriten-Ort
```

#### Fahrtenbuch Endpoints
```python
POST   /fuel-logs                   # Tankfüllung hinzufügen
GET    /fuel-logs                   # Alle Tankfüllungen abrufen
GET    /fuel-logs/{id}              # Eine Tankfüllung abrufen
PUT    /fuel-logs/{id}              # Tankfüllung bearbeiten
DELETE /fuel-logs/{id}              # Tankfüllung löschen
GET    /fuel-logs/statistics        # Statistiken (Verbrauch, Kosten)
```

#### Ortssuche Endpoint
```python
GET    /search-cities?q=Berlin      # Suche nach Städten
```

### Frontend

#### 1. Favoriten-Orte View (neue Seite)
```
- Liste aller Favoriten-Orte
- "Wohnort" Badge
- Aktuelle Preise für jeden Ort
- Schnellvergleich
- Hinzufügen/Bearbeiten/Löschen
```

#### 2. Fahrtenbuch View (neue Seite)
```
- Liste aller Tankfüllungen
- Statistiken (Durchschnittsverbrauch, Gesamtkosten)
- Formular zum Hinzufügen
- Bearbeiten/Löschen
- Export-Funktion
```

#### 3. Ortssuche in Explore
```
- Suchfeld für Städte
- Autocomplete
- Wechsel zwischen Standorten
```

#### 4. Heatmap auf Karte
```
- Toggle-Button
- Farbverlauf (grün → gelb → rot)
- Legende
```

#### 5. Navigation erweitern
```
- Neuer Tab "Favoriten" (⭐)
- Neuer Tab "Fahrtenbuch" (📖)
```

## 📋 Implementierungs-Reihenfolge

### Phase 1: Backend (30 Min)
1. ✅ Datenbank-Modelle erweitern
2. ⏳ API-Endpoints für Favoriten-Orte
3. ⏳ API-Endpoints für Fahrtenbuch
4. ⏳ Ortssuche-Endpoint
5. ⏳ Heatmap-Toggle in Settings

### Phase 2: Frontend - Favoriten (45 Min)
1. ⏳ Neue View "Favoriten"
2. ⏳ Favoriten-Liste UI
3. ⏳ Formular zum Hinzufügen
4. ⏳ Preis-Übersicht für Favoriten
5. ⏳ Navigation erweitern

### Phase 3: Frontend - Fahrtenbuch (60 Min)
1. ⏳ Neue View "Fahrtenbuch"
2. ⏳ Tankfüllungen-Liste UI
3. ⏳ Formular zum Hinzufügen
4. ⏳ Statistiken-Dashboard
5. ⏳ Verbrauchs-Berechnung

### Phase 4: Frontend - Erweiterte Features (45 Min)
1. ⏳ Ortssuche in Explore
2. ⏳ Heatmap auf Karte
3. ⏳ Heatmap-Toggle
4. ⏳ Farbverlauf-Legende
5. ⏳ Mobile-Optimierung

### Phase 5: Testing & Polish (30 Min)
1. ⏳ Alle Features testen
2. ⏳ Fehler beheben
3. ⏳ UI-Verbesserungen
4. ⏳ Dokumentation

## 🎯 Geschätzte Gesamtzeit: ~3.5 Stunden

## 💡 Feature-Highlights

### Favoriten-Orte
```
┌─────────────────────────────┐
│ ⭐ Meine Favoriten          │
├─────────────────────────────┤
│ 🏠 Wohnort (München)        │
│    💰 1.52 € • 12 Stationen │
├─────────────────────────────┤
│ 🏢 Arbeit (Frankfurt)       │
│    💰 1.58 € • 8 Stationen  │
├─────────────────────────────┤
│ ✈️ Berlin                   │
│    💰 1.65 € • 45 Stationen │
└─────────────────────────────┘
```

### Fahrtenbuch
```
┌─────────────────────────────┐
│ 📖 Fahrtenbuch              │
├─────────────────────────────┤
│ 📊 Statistiken              │
│ Ø Verbrauch: 6.2 L/100km   │
│ Ø Preis: 1.55 €/L          │
│ Gesamt: 245.80 € (3 Monate)│
├─────────────────────────────┤
│ 14.01.2026 - Shell München  │
│ 45.2 L • 1.52 €/L • 68.70 € │
│ 650 km • 6.1 L/100km        │
├─────────────────────────────┤
│ 08.01.2026 - Aral Frankfurt │
│ 42.8 L • 1.58 €/L • 67.62 € │
│ 720 km • 5.9 L/100km        │
└─────────────────────────────┘
```

### Heatmap
```
Karte mit Farbverlauf:
🟢 Günstig (< 1.50 €)
🟡 Mittel (1.50-1.70 €)
🟠 Teuer (1.70-2.00 €)
🔴 Sehr teuer (> 2.00 €)

Toggle: [ON/OFF]
```

## 🔄 Nächster Schritt

Soll ich mit der Implementierung fortfahren?

1. ✅ Backend-Endpoints erstellen
2. ✅ Frontend-Views bauen
3. ✅ Alles testen

Oder möchtest du zuerst ein bestimmtes Feature sehen?
