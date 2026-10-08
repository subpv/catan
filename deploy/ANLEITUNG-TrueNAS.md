# Broch auf TrueNAS SCALE bringen (Apps + YAML + Dataset + Cloudflare)

## Was du am Ende hast
- Eine App „broch“ auf deinem TrueNAS. Konten, laufende Spiele und die Statistik liegen in einem Dataset, nichts geht beim Neustart verloren.
- Deine Freunde öffnen `https://broch.deine-domain.de`, melden sich an, und jeder Zug erscheint bei allen sofort (WebSocket, meist unter einer Sekunde).
- Cloudflare Tunnel: Du musst keinen Port am Router öffnen.

## 1. Datasets anlegen (TrueNAS: Datasets)
1. Unter deinem Pool ein Dataset **`broch`** anlegen (Dataset Preset: **Apps**).
2. Darunter zwei Datasets: **`app`** (das Programm) und **`data`** (Konten, Spiele). Auch Preset **Apps**.
   Ergebnis: `/mnt/DEIN-POOL/broch/app` und `/mnt/DEIN-POOL/broch/data`.
3. Optional: ein drittes `upload` zum Hochladen (siehe 2).

## 2. Dateien hochladen – welche und wohin
Es gibt genau **eine** Datei, die auf den Server muss: **`broch-app.zip`** (liegt im Repository unter `dist/broch-app.zip`). Sie enthält das Programm samt allem, was es braucht; es wird nichts installiert.

Hochladen, am einfachsten per SMB-Freigabe:
1. TrueNAS → Shares → Windows (SMB) Shares → Add → Pfad `/mnt/DEIN-POOL/broch/upload` (Dataset `upload`), mit deinem TrueNAS-Benutzer. Dann `broch-app.zip` vom PC in die Freigabe kopieren.
   (Alternativ per `scp broch-app.zip dein-user@truenas:/mnt/DEIN-POOL/broch/upload/`.)
2. TrueNAS → System → Shell (oder SSH) und entpacken:
   ```
   unzip -o /mnt/DEIN-POOL/broch/upload/broch-app.zip -d /mnt/DEIN-POOL/broch/app
   chown -R 568:568 /mnt/DEIN-POOL/broch/data
   chmod -R a+rX /mnt/DEIN-POOL/broch/app
   chmod 700 /mnt/DEIN-POOL/broch/data
   ```
   Danach muss in `/mnt/DEIN-POOL/broch/app` direkt `server/`, `public/`, `node_modules/` und `package.json` liegen (nicht noch ein Unterordner).
3. Die SMB-Freigabe danach wieder löschen. **Das Dataset `data` niemals freigeben**: dort liegen die E-Mail-Adressen der Spieler.

Die zweite Datei, `deploy/truenas-compose.yml`, wird nicht hochgeladen, sondern in die App eingefügt (Schritt 3).

## 3. Cloudflare Tunnel anlegen (im Browser, Cloudflare-Konto)
1. Cloudflare → **Zero Trust** → Networks → **Tunnels** → Create a tunnel → Typ **Cloudflared** → Name `broch`.
2. Im Fenster steht ein **Token** (lange Zeichenkette nach `--token`). Kopieren.
3. Reiter **Public Hostname** → Add: Subdomain `broch`, Domain deine Domain, Service **HTTP**, URL **`broch:8080`**.
   (`broch` ist der Name des Containers in der YAML unten; beide laufen in derselben App.)
4. WebSockets sind bei Cloudflare standardmäßig an; nichts weiter einstellen.

## 4. App installieren (TrueNAS: Apps)
1. Apps → Discover Apps → **Custom App** → **Install via YAML**.
2. Inhalt von `deploy/truenas-compose.yml` einfügen und drei Dinge ändern:
   - `CHANGE-ME-POOL` → der Name deines Pools (zweimal),
   - `REGISTRATION_CODE` → ein langer, zufälliger Einladungscode (den bekommen nur deine Freunde),
   - `TUNNEL_TOKEN` → der Token aus Schritt 3.
3. Speichern. Nach 1–2 Minuten läuft „broch“ (und „broch-tunnel“). Logs: Apps → broch → Logs. Es sollte `Broch listening on :8080` stehen.

## 5. Zuerst DEIN Konto anlegen (wichtig!)
Der **erste** Account braucht keinen Einladungscode und wird **Admin**. Lege ihn an, bevor jemand anderes die Adresse kennt:
- Öffne `http://TRUENAS-IP:30080` im Heimnetz, „Create account“. Danach ist der Einladungscode für alle weiteren Konten Pflicht.
- Dann `https://broch.deine-domain.de` testen. Wenn alles läuft, in der YAML den Block `ports:` löschen (nur noch der Tunnel kommt rein).

## 6. Freunde einladen
Adresse + Einladungscode schicken. Jeder legt ein Konto an. In der Lobby „New game“, dann können alle beitreten; mit „Add bot“ lassen sich freie Plätze mit Bots füllen.

## Was gespeichert wird und wie es geschützt ist
- Im Dataset `data`: `users.json` (Name, E-Mail, Passwort-**Hash**), `sessions.json` (angemeldete Geräte, nur als Hash), `games/*.json` (laufende Spiele), `history.json` (Statistik). Die Dateien sind nur für den App-Benutzer lesbar (Rechte 600).
- Passwörter stehen nie im Klartext irgendwo (scrypt mit Salz). Niemand sieht fremde E-Mail-Adressen oder Passwörter: weder andere Spieler noch die Webseite; jeder sieht nur seine eigene Adresse.
- Falsche Passwörter werden pro Besucher gebremst (15 Fehlversuche, dann 10 Minuten Pause). Cookies sind `HttpOnly` und über Cloudflare `Secure`. Fremde Webseiten können keine Verbindung in dein Spiel öffnen.
- Wer Zugriff auf dein TrueNAS hat, kann `users.json` lesen: das Dataset also nicht freigeben und Snapshots/Backups nur auf eigene Datenträger legen.

## Extra-Schutz (empfohlen, 2 Minuten)
Cloudflare Zero Trust → Access → Applications → Add → Self-hosted → Hostname `broch.deine-domain.de` → Policy „Allow“ → E-Mail-Adressen deiner Freunde (Login per Einmalcode). Dann kommt niemand Fremdes überhaupt bis zur Anmeldeseite.

## Sicherung und Updates
- Datenschutz: Data Protection → Periodic Snapshot Tasks für das Dataset `broch/data` (z. B. täglich, 30 Tage behalten).
- Update: neue `broch-app.zip` hochladen, App stoppen, `unzip -o …` wie in Schritt 2 (das Dataset `data` bleibt unberührt), App starten.
- Alte Spielstände bleiben beim Update erhalten; bei Regeländerungen werden laufende Spiele automatisch angepasst, wo es möglich ist.
