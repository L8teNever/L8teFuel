# 🚀 L8teFuel - Server Deployment Guide

## ✅ Automatische Datenbank-Erstellung

Das Backend erstellt jetzt **automatisch** beim Start:
1. Alle Datenbank-Tabellen
2. Den Admin-User (falls nicht vorhanden)

**Du musst nichts manuell machen!** 🎉

---

## 📋 Deployment auf deinem Server:

### Schritt 1: Code auf Server kopieren

```bash
# Via Git
git clone <dein-repo> /pfad/zu/L8teFuel
cd /pfad/zu/L8teFuel

# Oder via SCP/FTP
# Kopiere den kompletten L8teFuel Ordner
```

### Schritt 2: Python-Abhängigkeiten installieren

```bash
pip3 install -r requirements.txt
```

Falls `requirements.txt` nicht existiert:
```bash
pip3 install fastapi uvicorn sqlalchemy python-jose passlib bcrypt python-multipart requests
```

### Schritt 3: Server starten

```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

**Das war's!** Der Server:
- ✅ Erstellt automatisch die Datenbank
- ✅ Erstellt automatisch alle Tabellen
- ✅ Erstellt automatisch den Admin-User

---

## 🔧 Konfiguration

### Datenbank-Pfad ändern (optional)

Bearbeite `backend/database.py`:

```python
# Standard (lokal)
SQLALCHEMY_DATABASE_URL = "sqlite:///./backend/fuel_tracker.db"

# Für Server (absoluter Pfad)
SQLALCHEMY_DATABASE_URL = "sqlite:////var/www/l8tefuel/fuel_tracker.db"

# Oder via Umgebungsvariable
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./backend/fuel_tracker.db")
```

### SECRET_KEY setzen (empfohlen für Produktion)

```bash
export SECRET_KEY="dein-super-sicherer-geheimer-schlüssel"
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## 🐳 Mit Docker (optional)

### Dockerfile erstellen:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker starten:

```bash
docker build -t l8tefuel .
docker run -p 8000:8000 -v $(pwd)/data:/app/backend l8tefuel
```

---

## 🔄 Systemd Service (Auto-Start)

Erstelle `/etc/systemd/system/l8tefuel.service`:

```ini
[Unit]
Description=L8teFuel API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/pfad/zu/L8teFuel
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

Aktivieren:
```bash
sudo systemctl enable l8tefuel
sudo systemctl start l8tefuel
sudo systemctl status l8tefuel
```

---

## 🌐 Nginx Reverse Proxy (optional)

Erstelle `/etc/nginx/sites-available/l8tefuel`:

```nginx
server {
    listen 80;
    server_name deine-domain.de;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktivieren:
```bash
sudo ln -s /etc/nginx/sites-available/l8tefuel /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## ✅ Checkliste für Deployment:

- [ ] Code auf Server kopiert
- [ ] Python-Abhängigkeiten installiert
- [ ] Server gestartet
- [ ] Datenbank automatisch erstellt (Check Logs)
- [ ] Admin-User automatisch erstellt (Check Logs)
- [ ] Login getestet (admin / admin123)
- [ ] Optional: Systemd Service eingerichtet
- [ ] Optional: Nginx Reverse Proxy eingerichtet
- [ ] Optional: SSL-Zertifikat (Let's Encrypt)

---

## 🔍 Logs überprüfen:

Beim Server-Start solltest du sehen:

```
🔄 Erstelle Datenbank-Tabellen...
✅ Datenbank-Tabellen erstellt/überprüft
🔄 Erstelle Admin-User...
✅ Admin-User erstellt: admin / admin123
```

Oder wenn Admin bereits existiert:
```
🔄 Erstelle Datenbank-Tabellen...
✅ Datenbank-Tabellen erstellt/überprüft
✅ Admin-User existiert bereits
```

---

## 🎯 Login-Daten:

Nach dem ersten Start:
```
Username: admin
Password: admin123
```

**WICHTIG:** Ändere das Passwort nach dem ersten Login!

---

## 🚨 Troubleshooting:

### Problem: "No module named 'backend'"
```bash
# Stelle sicher dass du im richtigen Verzeichnis bist
cd /pfad/zu/L8teFuel
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

### Problem: "Permission denied" für Datenbank
```bash
# Gib Schreibrechte für backend Ordner
chmod 755 backend
chmod 644 backend/fuel_tracker.db  # falls DB existiert
```

### Problem: Port 8000 bereits belegt
```bash
# Nutze anderen Port
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8080
```

---

## 🎉 FERTIG!

Dein Server erstellt jetzt automatisch:
- ✅ Datenbank
- ✅ Alle Tabellen
- ✅ Admin-User

**Einfach Server starten und loslegen!** 🚀
