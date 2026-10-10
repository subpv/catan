# Broch

A self-hosted settlers-style board game for friends and family. Accounts, a lobby, live play in the browser (desktop and phone), computer players, statistics, 16 languages, and a public in-browser demo at `/demo`.

**Status: complete, in maintenance mode.** The original owner does not develop it further. Everything needed to run, fix and extend it is in this repository.

Eight game modes: classic, Cities & Knights, Seafarers, Traders & Barbarians, Explorers & Pirates, and the stand-alone games New Energies, Dawn of Humankind and Rise of the Inkas. Seafarers, Traders & Barbarians, Explorers & Pirates and Dawn of Humankind carry a "Beta" badge because some book data is missing (see `docs/RULES-AND-GAPS.md`). Per-mode status table: `PROGRESS.md` (German).

## Quick start

```sh
cd broch
npm ci
npm start              # http://localhost:8080, data in broch/data (the first account becomes admin)
npm test               # rule tests and random-play simulations, under a minute
```

No server? Open `dist/broch-demo.html` in a browser: the real rules engine runs in the page, bots play the other seats.

Docker: `cd broch && docker compose up` (the Dockerfile also builds the `/demo` page).

## Self-hosting (TrueNAS SCALE)

1. Create datasets `broch/app` (the program, mounted read-only) and `broch/data` (accounts and games, read-write). Optional: `broch/upload` for copying the zip. Never share `data`.
2. Upload [`dist/broch-app.zip`](dist/broch-app.zip) and unpack it into `app`:
   ```bash
   sudo unzip -o /tmp/broch-app.zip -d /mnt/<pool>/broch/app/
   ```
3. Apps → Custom App → Install via YAML with [`deploy/truenas-compose.yml`](deploy/truenas-compose.yml) (`node:22-alpine`, port `30080:8080`, user `568:568`).
   Env: `DATA_DIR=/data`, `PORT=8080`, `TRUST_PROXY=1` (behind Cloudflare), optional `REGISTRATION_CODE` (without it anyone can sign up).
4. Open `http://<truenas-ip>:30080`, create your account first (it becomes admin), then publish it, e.g. through a Cloudflare tunnel.

**Update:** replace the contents of `app` with the new zip and restart the app. Never touch `data`. Details, backup and troubleshooting: `docs/OPERATIONS.md`.

## Where to read next

| You want to | Read |
|---|---|
| change the code (human or AI) | `CLAUDE.md` (10 things to know, conventions, pitfalls, checklist), then `docs/ARCHITECTURE.md` |
| deploy, update, back up, reset a password, fix a problem | `docs/OPERATIONS.md` (English), `deploy/ANLEITUNG-TrueNAS.md` (German step by step), `deploy/truenas-compose.yml` |
| know which rules, house rules, data gaps exist, or add a rule or a game | `docs/RULES-AND-GAPS.md` |
| see the full feature list and every rule deviation | `broch/README.md` |
| see what is finished and what is missing | `PROGRESS.md` |

## Layout

| Path | What |
|---|---|
| `broch/` | the app: `server/` (HTTP, WebSocket, rules engines, bots), `public/` (browser client, no bundler), `test/`, `demo/`, `scripts/` |
| `dist/` | `broch-app.zip` (server + client + production `node_modules` + `/demo`, unpack and run with Node 22) and `broch-demo.html`. Committed, so only as new as the last `node scripts/make-dist.js` |
| `deploy/` | TrueNAS SCALE guide and compose file |
| `docs/` | architecture, operations, rules and gaps |
| `rulebooks/` | the publishers' rulebook PDFs the rules were checked against. They are not ours: do not publish the repository together with this folder |

## Tests

`npm test` (rules, fuzz), `npm run test:all` (adds security, resign, operations checks), `npm run test:bots` (bots on a real server). The browser tests (`npm run test:demo`, `npm run test:browser`) need Playwright with Chromium, which is not in `package.json`: `npm i -g playwright && npx playwright install chromium`. Details and the release checklist are in `CLAUDE.md`.

## Release

```sh
cd broch && npm ci && node scripts/make-dist.js && npm run dist:check
```

Then follow the update procedure in `docs/OPERATIONS.md`. Forgotten password of a player: `broch/scripts/admin.js` (stop the app first; see the same document).

Broch is a private family project and is not affiliated with or endorsed by the publishers of the board games it is modelled on. The word "Catan" is deliberately not used anywhere in the app.
