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
2. Inhalt von `deploy/truenas-compose.yml` einfügen und diese Dinge ändern:
   - `CHANGE-ME-POOL` → der Name deines Pools (zweimal),
   - `REGISTRATION_CODE` → ein langer, zufälliger Einladungscode (den bekommen nur deine Freunde). Er ist optional: lässt du ihn leer, kann sich jeder anmelden, der die Adresse findet (höchstens 10 neue Konten pro Stunde und Adresse), und im Log steht eine Warnung. Für eine öffentliche Adresse also immer setzen.
   - `TUNNEL_TOKEN` → der Token aus Schritt 3.
   - Optional: `FEEDBACK_URL: ""` heißt „kein Feedback-Link“ (Fußzeile und Fehlerbanner). Ohne diese Zeile zeigt Broch das Feedback-Formular des ursprünglichen Entwicklers.
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
- Beschädigte Dateien (Stromausfall, falsch kopiertes Dataset) löschen nie still alle Konten: `users.json` und `history.json` werden aus `…json.bak` (der vorletzten Speicherung) wiederhergestellt, die kaputte Datei bleibt als `…corrupt-ZEIT` liegen. Gibt es keine brauchbare `.bak`, **startet die App absichtlich nicht** und schreibt im Log (Apps → broch → Logs) `FATAL: …users.json…`: Rechte prüfen (`chown -R 568:568 …/broch/data`), ein Backup/Snapshot zurückspielen, oder nur wenn die Konten wirklich weg sind, die Datei löschen und neu anfangen (das erste Konto wird dann wieder Admin). Ein kaputtes Spiel (`games/*.json`) wird nach `games/_broken/` verschoben, alle anderen laufen weiter.

## Extra-Schutz (empfohlen, 2 Minuten)
Cloudflare Zero Trust → Access → Applications → Add → Self-hosted → Hostname `broch.deine-domain.de` → Policy „Allow“ → E-Mail-Adressen deiner Freunde (Login per Einmalcode). Dann kommt niemand Fremdes überhaupt bis zur Anmeldeseite.
Achtung: Das sperrt alles, auch die Demo unter `/demo` und das Vorschaubild `/og-image.png`, das Chat-Programme beim Teilen des Links laden (ohne Bypass zeigt die Link-Vorschau nur ein Anmeldefenster von Cloudflare). Soll jeder die Demo und die Vorschau sehen, lege eine zweite Access-Anwendung mit Policy-Aktion **Bypass** (Include: Everyone) für die Pfade `/demo` und `/og-image.png` an. Wer das nicht braucht, lässt alles gesperrt.

## Sicherung und Wiederherstellung
- Die ganze Sicherung ist das Dataset `broch/data` (Konten, laufende Spiele, Statistik). Das Programm (`app`) kannst du jederzeit aus `broch-app.zip` neu entpacken.
- Snapshots (Data Protection → Periodic Snapshot Tasks, z. B. täglich, 30 Tage behalten) schützen vor Versehen, **nicht** vor einem Plattenausfall: sie liegen auf demselben Pool. Kopiere `broch/data` deshalb ab und zu auf einen anderen Datenträger (Replication Task oder einfach `cp -a /mnt/DEIN-POOL/broch/data /mnt/ANDERER-POOL/broch-backup-$(date +%F)`), am besten bei gestoppter App.
- Wiederherstellen: App stoppen, den Inhalt von `data` zurückkopieren, dann `chown -R 568:568 /mnt/DEIN-POOL/broch/data && chmod 700 /mnt/DEIN-POOL/broch/data`, App starten. Aus einem Snapshot: Datasets → `broch/data` → Snapshots → Rollback (oder die Dateien aus `.zfs/snapshot/NAME/` zurückkopieren).
- Logs: Die YAML begrenzt sie auf 3 × 10 MB (`logging:`), damit sie die Platte nicht füllen.

## Vergessenes Passwort, Konto ändern
Es gibt keine E-Mail-Zurücksetzung. Du (der Betreiber) setzt das Passwort offline zurück:
1. In Apps die App **broch stoppen** (wichtig: sonst überschreibt die laufende App deine Änderung).
2. TrueNAS → System → Shell, dann (Pool-Name anpassen, E-Mail des Freundes einsetzen). Fragt nach dem neuen Passwort, mindestens 8 Zeichen:
   ```
   docker run --rm -it --user 568:568 -v /mnt/DEIN-POOL/broch/app:/app:ro -v /mnt/DEIN-POOL/broch/data:/data -e DATA_DIR=/data node:22-alpine node /app/scripts/admin.js reset-password freund@beispiel.de
   ```
   Der Freund wird auf allen Geräten abgemeldet und kann sich mit dem neuen Passwort anmelden.
3. App wieder starten.
Weitere Befehle statt `reset-password`: `list-users` (alle Konten anzeigen), `make-admin EMAIL`, `delete-user EMAIL` (nur wenn die Person in keinem offenen oder laufenden Spiel sitzt; den einzigen Admin löscht es nicht).

## Updates
- Neue `broch-app.zip` hochladen, App **stoppen**, dann das alte Programm komplett ersetzen (sonst bleiben entfernte Dateien und alte Demo-Dateien liegen); das Dataset `data` bleibt unberührt:
  ```
  rm -rf /mnt/DEIN-POOL/broch/app/*
  unzip /mnt/DEIN-POOL/broch/upload/broch-app.zip -d /mnt/DEIN-POOL/broch/app
  chmod -R a+rX /mnt/DEIN-POOL/broch/app
  ```
  Dann die App starten. Prüfen: unten auf der Seite steht die Build-Nummer, und `/api/health` meldet sie.
- Alte Spielstände bleiben beim Update erhalten; bei Regeländerungen werden laufende Spiele automatisch angepasst, wo es möglich ist.
