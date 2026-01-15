# L8teFuel - PWA & Push-Benachrichtigungen

## ✅ Implementierte Features

### 📱 Progressive Web App (PWA)
- **Installierbar**: Die App kann auf dem Homescreen installiert werden
- **Offline-Fähig**: Service Worker cached wichtige Assets
- **Standalone-Modus**: Läuft wie eine native App ohne Browser-UI
- **Optimiertes Manifest**: Deutsche Beschreibung, korrekte Icons, Theme-Farben

### 🔔 Push-Benachrichtigungen

#### Automatische Benachrichtigungen
- **Wunschpreis-Filter**: Setze deinen maximalen Preis im Setup
- **Automatische Alerts**: Wenn eine Tankstelle unter dem Wunschpreis gefunden wird, erhältst du eine Benachrichtigung
- **Intelligente Logik**:
  - Zeigt die **günstigste** Tankstelle an
  - Enthält **Preis** und **Entfernung**
  - **Anti-Spam**: Maximal 1 Benachrichtigung alle 5 Minuten
  - **Deduplizierung**: Keine doppelten Benachrichtigungen für dieselbe Tankstelle (30 Min)

#### Benachrichtigungs-Features
- **Vibration**: Haptisches Feedback bei Benachrichtigung
- **Klickbar**: Klick auf Benachrichtigung öffnet die App und zeigt die Tankstelle
- **Persistent**: "Anzeigen" oder "Schließen" Buttons
- **Status-Anzeige**: Zeigt im Dashboard ob Benachrichtigungen aktiv sind

### 🎯 Benutzerfreundlichkeit

#### Automatische Berechtigungsanfrage
1. Starte das Tracking im Dashboard
2. App fragt automatisch nach Benachrichtigungs-Berechtigung
3. Bei Zustimmung: Bestätigungs-Benachrichtigung
4. Status wird im Dashboard angezeigt (🔔 "Alerts An")

#### Benachrichtigungs-Inhalt
```
⛽ Günstiger Sprit gefunden!
Shell - Hauptstraße 123
1.45 € • 2.3 km entfernt
```

### 🔧 Technische Details

#### Service Worker (sw.js)
- Cache-Strategie: Cache-First für Assets, Network-First für API
- Offline-Fallback
- Push-Notification Handler
- Notification-Click Handler (öffnet/fokussiert App)

#### Notification API
- Verwendet native Browser-Benachrichtigungen
- Funktioniert auch wenn App im Hintergrund ist
- Zeigt Icon, Badge, und Vibration

#### Tracking & Monitoring
- Preis-Checks alle 5 Minuten während Tracking aktiv ist
- Filtert Tankstellen nach Wunschpreis
- Sortiert nach Preis (günstigste zuerst)
- Zeigt nur geöffnete Tankstellen

## 📋 Verwendung

### 1. PWA Installieren
1. Öffne die App im Browser (Chrome/Edge empfohlen)
2. Klicke auf "Installieren" in der Adressleiste
3. App wird zum Homescreen hinzugefügt

### 2. Benachrichtigungen Aktivieren
1. Melde dich an
2. Gehe zum **Setup** (⚙️)
3. Setze deinen **Wunschpreis** (z.B. 1.55 €)
4. Gehe zum **Dashboard** (📍)
5. Klicke auf **"Starten"**
6. Erlaube Benachrichtigungen wenn gefragt
7. Warte auf günstige Tankstellen!

### 3. Benachrichtigungen Erhalten
- App muss **nicht** geöffnet sein
- Tracking muss **aktiv** sein (grüner Punkt im Dashboard)
- Du erhältst eine Benachrichtigung sobald eine Tankstelle unter deinem Wunschpreis gefunden wird
- Klicke auf die Benachrichtigung um Details zu sehen

## 🎨 UI-Verbesserungen

### Dashboard
- **Benachrichtigungs-Status**: Zeigt 🔔 "Alerts An" wenn aktiviert
- **Live-Monitoring**: Grüner pulsierender Punkt zeigt aktives Tracking
- **Kraftstoff-Typ**: Zeigt aktuell überwachten Kraftstoff

### Explore/Suche
- **Stationen-Zähler**: Zeigt Anzahl gefundener Tankstellen
- **Farbcodierte Preise**: Grün (günstig) bis Rot (teuer)
- **Filter**: Kraftstoff, Preis, Entfernung, "Nur geöffnete"
- **Debouncing**: Optimierte Suche ohne Spam

## 🔐 Datenschutz

- **Lokale Benachrichtigungen**: Keine Push-Server erforderlich
- **Standort**: Wird nur während aktivem Tracking verwendet
- **Keine Tracking-Cookies**: Nur Session-Token für Authentifizierung

## 🐛 Bekannte Einschränkungen

- **Browser-Support**: Push-Benachrichtigungen funktionieren am besten in Chrome/Edge
- **iOS Safari**: Eingeschränkte PWA-Unterstützung (keine Background-Benachrichtigungen)
- **Batterie**: Aktives Tracking kann Batterie verbrauchen
- **Genauigkeit**: Abhängig von GPS-Genauigkeit des Geräts

## 🚀 Nächste Schritte

Mögliche Erweiterungen:
- [ ] Hintergrund-Synchronisation (Background Sync API)
- [ ] Periodische Hintergrund-Updates (Periodic Background Sync)
- [ ] Push-Benachrichtigungen über Server (Web Push API)
- [ ] Benachrichtigungs-Einstellungen (Ton, Vibration, etc.)
- [ ] Benachrichtigungs-Historie
