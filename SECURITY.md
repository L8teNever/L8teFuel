# L8teFuel - Sicherheit & Session-Management

## ✅ Implementierte Sicherheitsfeatures

### 🔐 **Token-Management**

#### 1. **Sichere Token-Speicherung**
- ✅ Token wird in `localStorage` gespeichert
- ✅ Token-Ablaufdatum wird mitgespeichert (30 Tage)
- ✅ Automatische Prüfung ob Token abgelaufen ist
- ✅ Automatisches Löschen abgelaufener Tokens

#### 2. **Session-Persistenz** ("Angemeldet bleiben")
- ✅ **30 Tage Gültigkeit**: Du bleibst 30 Tage angemeldet
- ✅ **Automatische Wiederherstellung**: App startet automatisch wenn Token noch gültig
- ✅ **Tracking-State**: Aktives Tracking wird wiederhergestellt
- ✅ **Einstellungen**: Alle Einstellungen bleiben erhalten

#### 3. **Sicherer SECRET_KEY**
- ✅ Automatisch generierter sicherer Schlüssel
- ✅ 32 Bytes kryptographisch sicher (via `secrets.token_urlsafe`)
- ✅ Kann via Umgebungsvariable überschrieben werden
- ✅ Wird bei jedem Server-Neustart neu generiert (wenn nicht gesetzt)

### 🛡️ **Sicherheitsverbesserungen**

#### Backend (Python/FastAPI)
```python
# Sicherer SECRET_KEY
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))

# 30 Tage Token-Gültigkeit
ACCESS_TOKEN_EXPIRE_DAYS = 30

# Token enthält zusätzliche Metadaten
{
    "sub": "username",
    "exp": expiry_timestamp,
    "iat": issued_at_timestamp,
    "type": "access"
}
```

#### Frontend (JavaScript)
```javascript
// Token-Management
function saveToken(newToken) {
    localStorage.setItem('token', newToken);
    localStorage.setItem('tokenExpiry', expiryDate);
}

function isTokenExpired() {
    const expiry = new Date(tokenExpiry);
    return new Date() > expiry;
}

// Automatische Prüfung beim Laden
if (token && isTokenExpired()) {
    clearToken();
}
```

### 🔒 **Login-Verbesserungen**

#### Validierung
- ✅ Leere Felder werden abgefangen
- ✅ Whitespace wird entfernt (`.trim()`)
- ✅ Bessere Fehlermeldungen
- ✅ Button wird während Login deaktiviert

#### Fehlerbehandlung
- ✅ Detaillierte Fehlermeldungen vom Server
- ✅ Automatisches Löschen ungültiger Tokens
- ✅ Visuelle Rückmeldung ("Anmelden...")
- ✅ Logging für Debugging

### 🚪 **Logout-Verbesserungen**

#### Vollständige Bereinigung
```javascript
function handleLogout() {
    // 1. Tracking stoppen
    if (isTracking) stopTracking();
    
    // 2. Token löschen
    clearToken();
    
    // 3. Benachrichtigungen zurücksetzen
    notificationPermissionGranted = false;
    
    // 4. Seite neu laden
    location.reload();
}
```

### 🔄 **Session-Wiederherstellung**

#### Automatischer Login
1. **Beim App-Start**:
   - Token aus `localStorage` laden
   - Ablaufdatum prüfen
   - Wenn gültig: Automatisch einloggen

2. **User-Daten laden**:
   - `/me` Endpoint aufrufen
   - Einstellungen wiederherstellen
   - Tracking-State wiederherstellen

3. **Bei Fehler**:
   - Token löschen
   - Login-Screen anzeigen
   - Fehlermeldung anzeigen

### 📊 **Token-Lebenszyklus**

```
┌─────────────┐
│   Login     │
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  Token generieren   │
│  (30 Tage gültig)   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Token speichern    │
│  + Ablaufdatum      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  App verwenden      │
│  (30 Tage lang)     │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  Token abgelaufen?  │
└──────┬──────────────┘
       │
       ├─ Ja ──► Neu anmelden
       │
       └─ Nein ─► Weiter nutzen
```

### 🔧 **Konfiguration**

#### Produktions-Setup
Für maximale Sicherheit in Produktion:

```bash
# .env Datei erstellen
SECRET_KEY=dein-super-sicherer-geheimer-schlüssel-hier

# Oder als Umgebungsvariable
export SECRET_KEY="dein-super-sicherer-geheimer-schlüssel-hier"
```

**Wichtig**: In Produktion solltest du einen festen SECRET_KEY setzen, sonst werden alle Tokens bei Server-Neustart ungültig!

#### Generiere einen sicheren Key:
```python
import secrets
print(secrets.token_urlsafe(32))
```

### 📱 **Benutzer-Erfahrung**

#### Anmelden
1. Benutzername und Passwort eingeben
2. "LOGIN" klicken
3. Button zeigt "Anmelden..."
4. Bei Erfolg: Automatisch zum Dashboard
5. Bei Fehler: Fehlermeldung wird angezeigt

#### Angemeldet bleiben
- ✅ **30 Tage gültig**: Einmal anmelden, 30 Tage nutzen
- ✅ **Automatischer Start**: App öffnen → sofort drin
- ✅ **Tracking bleibt aktiv**: Wenn du Tracking aktiviert hattest, bleibt es aktiv
- ✅ **Einstellungen bleiben**: Wunschpreis, Radius, etc. bleiben gespeichert

#### Abmelden
1. "Abmelden" klicken
2. Tracking wird gestoppt
3. Alle Daten werden gelöscht
4. Zurück zum Login-Screen

### 🔍 **Debugging**

#### Console Logs
Die App gibt hilfreiche Logs aus:

```javascript
✅ Token saved, expires: 14.02.2026
🔄 Initializing app...
✅ User loaded: admin
🔄 Restoring active tracking state...
✅ App initialized successfully
```

#### Bei Problemen:
```javascript
⚠️ Token expired, clearing...
❌ Login error: Login fehlgeschlagen
❌ Init error: Session abgelaufen
```

### 🛠️ **Technische Details**

#### JWT Token Struktur
```json
{
  "sub": "admin",
  "exp": 1739577600,
  "iat": 1737072000,
  "type": "access"
}
```

#### LocalStorage Keys
- `token`: Der JWT Access Token
- `tokenExpiry`: ISO-8601 Datum wann Token abläuft

#### API Endpoints
- `POST /token`: Login (gibt Token zurück)
- `GET /me`: User-Daten abrufen (benötigt Token)
- `PUT /me/settings`: Einstellungen speichern

### ⚠️ **Wichtige Hinweise**

#### Sicherheit
- ✅ Passwörter werden gehasht (bcrypt)
- ✅ Tokens sind signiert (JWT)
- ✅ HTTPS wird empfohlen für Produktion
- ⚠️ LocalStorage ist nicht 100% sicher gegen XSS
- ⚠️ Für höchste Sicherheit: HttpOnly Cookies verwenden

#### Token-Gültigkeit
- **30 Tage**: Gut für Benutzerfreundlichkeit
- **Kompromiss**: Längere Gültigkeit = weniger sicher
- **Empfehlung**: Für sensible Daten kürzere Gültigkeit wählen

#### Passwort-Stärke
- Mindestens 6 Zeichen (aktuell)
- Kann erweitert werden (Groß-/Kleinbuchstaben, Zahlen, Sonderzeichen)

## 🎯 **Zusammenfassung**

✅ **Sicher**: Passwörter gehasht, Tokens signiert
✅ **Bequem**: 30 Tage angemeldet bleiben
✅ **Zuverlässig**: Automatische Session-Wiederherstellung
✅ **Transparent**: Klare Fehlermeldungen und Logs
✅ **Wartbar**: Sauberer Code mit Kommentaren

Die App ist jetzt sicher und merkt sich deine Anmeldung! 🎉
