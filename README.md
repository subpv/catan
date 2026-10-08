# Broch

A self-hosted settlers game for friends (classic game, Cities & Knights, Seafarers, Traders & Barbarians, Explorers & Pirates and the stand-alone games New Energies, Dawn of Humankind and Rise of the Inkas), with computer players.

| Folder / file | What it is |
|---|---|
| **`dist/broch-demo.html`** | **Open this file in a browser to try everything** (no server needed; the other seats are bots). The "Fortschritt" button at the bottom left shows the status of every mode. |
| `dist/broch.zip` | The app packaged for the server (Docker/Node). |
| `PROGRESS.md` | Status of every mode, what to test, what is still missing. |
| `broch/` | The app itself: `server/` (rules engine, one folder per game, bots), `public/` (browser client, one folder per game), `test/`, `demo/` (demo build). See `broch/README.md`. |
| `rulebooks/` | The official rulebooks the rules were checked against (`de/` German 2018-2025, `en/` English 6th edition and the Inka almanac). |

Run the real server: `cd broch && npm install && npm start` (port 8080), or `docker compose up`.
Rebuild the demo and the zip: `cd broch && node scripts/make-dist.js`.
