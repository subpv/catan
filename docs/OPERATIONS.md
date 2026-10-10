# Operations

Running Broch for real: deploy, update, back up, recover, fix. The German step-by-step guide for the original owner is `deploy/ANLEITUNG-TrueNAS.md`; this file is the English reference and adds the settings tables and the troubleshooting list. Both describe the same setup: TrueNAS SCALE, the stock `node:22-alpine` image, the program unzipped into one dataset (read only), the data in another, a Cloudflare Tunnel in front.

## 1. What runs where

```
Internet -> Cloudflare (TLS, optional Access) -> cloudflared container (tunnel) -> http://broch:8080
                                                                                         |
                          container "broch": node:22-alpine, user 568:568, working_dir /app
                          /app  = dataset broch/app   (unzipped dist/broch-app.zip, mounted read only)
                          /data = dataset broch/data  (DATA_DIR: accounts, sessions, games, history)
```

The program has one runtime dependency (`ws`, pure JavaScript), so the zip contains `node_modules` and nothing is installed on the server. No database, no mail server, no outbound calls except the browser loading Google Fonts.

## 2. Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | listening port inside the container |
| `DATA_DIR` | `<app>/data` (next to `server/`); `/data` in the Dockerfile and the TrueNAS YAML | where all files live (section 6); must be writable by the app user |
| `REGISTRATION_CODE` | empty | invite code for new accounts. The very first account never needs it and becomes admin. Empty = anybody who finds the address may sign up (10 accounts / hour / address) and the log prints a warning at start |
| `TRUST_PROXY` | off | `1`, `true`, `yes` or `cloudflare`: trust `CF-Connecting-IP` / `X-Forwarded-For` (real visitor address for the rate limits), `X-Forwarded-Proto` (Secure cookie, HSTS), `X-Forwarded-Host` (WebSocket origin check). **Set it behind Cloudflare, never when the port is reachable directly** (the headers could be forged) |
| `FEEDBACK_URL` | `https://feedback.maidev.dk/` (the original developer's form) | target of the "Send feedback" link. Set to an empty string to remove the link from the footer and the error banner |
| `BROCH_BOT_DELAY` | 650-1300 ms random | test only: milliseconds a bot waits per move |
| `NODE_ENV` | - | set to `production` in the YAML; the code does not read it |

## 3. Deploy on TrueNAS SCALE

1. **Datasets** (preset Apps): `<pool>/broch`, and below it `app`, `data` and optionally `upload`. Never share `data` over SMB (it holds e-mail addresses).
2. **Build the zip** (on a computer with Node 22): `cd broch && npm ci && node scripts/make-dist.js && npm run dist:check` gives `dist/broch-app.zip` (also committed in the repo).
3. **Unpack** (TrueNAS shell, replace `POOL`):
   ```sh
   unzip -o /mnt/POOL/broch/upload/broch-app.zip -d /mnt/POOL/broch/app
   chown -R 568:568 /mnt/POOL/broch/data
   chmod -R a+rX /mnt/POOL/broch/app
   chmod 700 /mnt/POOL/broch/data
   ```
   `server/`, `public/`, `node_modules/`, `scripts/`, `package.json` must sit directly in `app/` (no extra folder level).
4. **Cloudflare Tunnel**: Zero Trust -> Networks -> Tunnels -> create (type cloudflared) -> copy the token -> Public Hostname: your name, service **HTTP**, URL **`broch:8080`**. WebSockets are on by default.
5. **App**: Apps -> Discover Apps -> Custom App -> Install via YAML, paste one of the two files below.
6. **Create your account first** (it becomes admin). With the `ports:` block in place: `http://TRUENAS-IP:30080`. When the tunnel works, delete the `ports:` block and update the app.

### YAML without an invite code (anybody with the link may sign up)

```yaml
services:
  broch:
    image: node:22-alpine
    container_name: broch
    restart: unless-stopped
    user: "568:568"
    working_dir: /app
    command: ["node", "server/index.js"]
    environment:
      NODE_ENV: production
      PORT: "8080"
      DATA_DIR: /data
      TRUST_PROXY: "1"
      FEEDBACK_URL: ""
    volumes:
      - /mnt/POOL/broch/app:/app:ro
      - /mnt/POOL/broch/data:/data
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    ports:
      - "30080:8080"          # first set-up only, then remove
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:8080/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: broch-tunnel
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: "TOKEN-FROM-CLOUDFLARE"
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "3" }
    depends_on: [broch]
```

### YAML with an invite code (recommended for a public address)

Identical, plus one line under `broch.environment`:

```yaml
      REGISTRATION_CODE: "a-long-random-code-you-send-to-friends"
```

`deploy/truenas-compose.yml` is exactly this variant with `CHANGE-ME` markers. With the code set, a wrong code is answered with 403 and counts as a failed attempt for that address. The code is compared in constant time. Changing it later affects only new sign-ups.

### Without TrueNAS

`docker compose up` in `broch/` uses `broch/docker-compose.yml` and the `Dockerfile` (stage 1 builds `/demo` with esbuild, stage 2 is the app; the container runs as user 568 and keeps its data in the bind mount `/mnt/tank/apps/broch/data`). **That path is a TrueNAS example: on any other machine edit the `volumes:` line to a folder you own and `chown 568:568` it** (otherwise Docker creates it as root and the app stops with `EACCES`). The compose file sets neither `TRUST_PROXY` nor `PORT`; add `TRUST_PROXY: "1"` when a proxy sits in front. Without Docker: `cd broch && npm ci --omit=dev && PORT=8080 DATA_DIR=/var/lib/broch node server/index.js` (for `/demo` run a full `npm ci` instead, because `node demo/build.js --public` needs the dev dependency esbuild). Put any reverse proxy with HTTPS in front and allow WebSockets (`Upgrade` headers, and pass the original `Host`, otherwise the WebSocket origin check refuses the connection).

## 4. Cloudflare settings and cache notes

- **Tunnel**: public hostname -> `http://broch:8080` (service name of the container in the same YAML). `TRUST_PROXY=1` must be set.
- **Caching**: the server sends `Cache-Control: private, no-cache` and `CDN-Cache-Control: no-store` on every static file and `no-store` on the API, with ETags (browsers revalidate and get cheap 304s). Do not add a "Cache Everything" rule for this hostname. A stale page after an update is always a browser or a rule problem, see section 9.
- **Speed settings**: keep Rocket Loader off (it injects its own scripts, which the CSP `script-src 'self'` blocks). Auto Minify is unnecessary.
- **Idle WebSockets**: the client pings every 15 seconds and reconnects by itself, so proxy idle timeouts are harmless; a "Reconnecting..." bar means the connection was lost.
- **Extra protection (optional)**: Zero Trust -> Access -> Applications -> self-hosted, policy Allow for your friends' e-mail addresses. This blocks everything, including `/demo` and the link preview image `/og-image.png` (chat apps fetch it when you share the link). To keep those public, add a second Access application with the action **Bypass** (Include: Everyone) for the paths `/demo` and `/og-image.png`.
- **Do not leave the direct port open** (`30080`) once the tunnel works: with `TRUST_PROXY=1` anybody who reaches that port could fake the visitor address.

## 5. Update procedure (data is kept)

Program and data are separate datasets, so an update never touches the data.

1. Back up first (section 6): snapshot or copy `broch/data`.
2. Upload the new `broch-app.zip` to `upload/`.
3. Stop the app (Apps -> broch -> Stop).
4. Replace the program completely (old files must not linger, e.g. removed modules or an old `public/demo`):
   ```sh
   rm -rf /mnt/POOL/broch/app/*
   unzip /mnt/POOL/broch/upload/broch-app.zip -d /mnt/POOL/broch/app
   chmod -R a+rX /mnt/POOL/broch/app
   ```
5. Start the app. Check the log for `Broch listening on :8080 (data in /data)` and no `FATAL` or `... is damaged` / `... is broken` warnings (the line `WARNING: REGISTRATION_CODE is not set` is expected when you run without an invite code).
6. Compare the build id: the footer of the page and `https://your-host/api/health` must show the same 7 characters, and it must differ from before the update (it is a hash of all of `server/` and `public/`). If the footer differs from `/api/health`, see "Old page after an update" below.
7. Running games continue: on start the server runs `engine.migrate` on every saved game and restarts the bots of running games.

Rollback: keep the previous zip, repeat steps 3-5 with it, restore the data backup if the new version had migrated games you want back.

## 6. Backup and restore

What to back up: the whole `DATA_DIR` (`broch/data`). The program can always be re-created from the zip.

```
users.json  users.json.bak   accounts (name, e-mail, password hash)       personal data
sessions.json                logins as hashes                              disposable
history.json history.json.bak  statistics of finished games
games/*.json                 open, running and finished games
games/_broken/, *.corrupt-*  files the server set aside (inspect, then delete)
```

- **Snapshots** (Data Protection -> Periodic Snapshot Tasks, daily, keep 30 days) protect against mistakes. They live on the same pool, so they are **not** a backup against disk failure. All files are written atomically (tmp + rename), so a snapshot taken while the app runs is consistent for accounts and history; a game may be up to 0.4 s behind.
- **Off-pool copy**, preferably with the app stopped: `cp -a /mnt/POOL/broch/data /mnt/OTHER/broch-backup-$(date +%F)` or a Replication Task. The backup contains e-mail addresses: store it like personal data.
- **Restore**: stop the app, put the files back (or `Datasets -> broch/data -> Snapshots -> Rollback`, or copy from `.zfs/snapshot/NAME/`), then `chown -R 568:568 /mnt/POOL/broch/data && chmod 700 /mnt/POOL/broch/data`, start the app.
- **Damaged files** are handled by the server (`store.js`): a bad `users.json` or `history.json` is restored from its `.bak` and the bad file kept as `*.corrupt-<time>`; with no good `.bak` the server refuses to start (`FATAL ... users.json`) instead of treating it as "no accounts". Fix permissions or restore a backup. Only if the accounts are really gone, delete `users.json` (the next sign-up becomes admin, no code needed). A bad game file moves to `games/_broken/`; the other games continue.
- **Never edit the files while the app runs**: the app holds everything in memory and writes it back on the next change.

## 7. Users: rename, reset password, delete

**Rename**: every user can change their own name in the profile (unique ignoring case, max 24 characters). By hand: stop the app, edit `"name"` of that user in `users.json`, start. Lobby cards and the stats page read the current name from `users.json` by id. A game already running keeps the old name in its own file (`games/<id>.json`, `state.players[i].name`), and old `history.json` entries keep the old name (only used when the account no longer exists). Change those too if you care. Seats are bound to the user **id**, never to the name, so nothing breaks. There is no screen for changing an e-mail address: edit `"email"` in `users.json` (lower case, unique).

**Forgotten password**: there is **no e-mail reset** (the server cannot send mail). The operator resets it offline with `scripts/admin.js` (included in the zip):

```sh
# 1. stop the app first, otherwise it overwrites the change
# 2. TrueNAS shell, replace POOL and the e-mail; asks for the new password (8..256 characters)
docker run --rm -it --user 568:568 \
  -v /mnt/POOL/broch/app:/app:ro -v /mnt/POOL/broch/data:/data -e DATA_DIR=/data \
  node:22-alpine node /app/scripts/admin.js reset-password friend@example.com
# 3. start the app; tell the friend the new password; they can change it in the profile
```

Without Docker: `node scripts/admin.js reset-password EMAIL /path/to/data`. For a non-interactive run set `BROCH_NEW_PASSWORD`. The script writes `users.json` atomically with a `.bak`, ends all logins of that user, and prints what it did. Other commands: `list-users`, `make-admin EMAIL`, `delete-user EMAIL` (refuses the only admin and anybody sitting in an open or running game). A logged-in user can change their own password in the profile (the other devices are logged out). Admins may also close any game and delete any statistics entry in the app.

## 8. Security notes

- Passwords: scrypt with a random salt; login for an unknown e-mail takes as long as for a known one. Sessions: random 24-byte tokens in an HttpOnly, SameSite=Lax cookie (Secure behind https), only the SHA-256 is stored; 60 days; at most 20 per account; logout or password change ends them (open sockets are closed with code 4001).
- Limits: 15 failed logins / 10 min / address (and 60 login attempts), 10 sign-ups / hour / address, 20 password attempts / 10 min / user, 20 error reports / min / address, WebSocket 200 messages / s and 64 KB per message, request bodies 1 MB, 8 open or running games per host.
- Headers on every response: CSP without inline scripts, `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, a restrictive `Permissions-Policy`, COOP, HSTS behind https. The WebSocket accepts only the site's own `Origin`. Checked by `npm run test:security`.
- Nobody sees other people's e-mail addresses or hashes; the API only returns names, colours and countries. Game views contain only what the seat may see.
- Files in `DATA_DIR` are mode 600/700. Keep the dataset unshared and the backups on your own media.
- Privacy: the page loads Google Fonts from `fonts.googleapis.com` / `fonts.gstatic.com` (the visitor's browser contacts Google). The default `FEEDBACK_URL` points to the original developer's form: set `FEEDBACK_URL=""` unless you want that link.
- Logs contain user names and browser error messages (`[client-error]`), never passwords or tokens. Docker keeps 3 x 10 MB.
- An open sign-up (no `REGISTRATION_CODE`) is a deliberate choice only for a demo; for friends always set a code or use Cloudflare Access.

## 9. Troubleshooting

Where to look first: Apps -> broch -> Logs (or `docker logs broch --tail 200`). Useful prefixes: `FATAL`, `WARNING`, `API error`, `Action crashed`, `Bot runner:`, `[client-error]`, `Uncaught exception`.

| Symptom | Likely cause | Fix |
|---|---|---|
| App will not start, log says `FATAL: .../users.json exists but cannot be used` | wrong owner/permissions on the dataset, or a damaged file with no usable `.bak` | `chown -R 568:568 .../broch/data; chmod 700 ...`; or restore a backup/snapshot; only if the accounts are lost delete `users.json` |
| `EACCES` / cannot write `/data` | dataset owned by another user | `chown -R 568:568 /mnt/POOL/broch/data` |
| `Cannot find module` at start, or blank result after unzip | zip unpacked into a subfolder, or `node_modules` missing | `server/` and `node_modules/` must be directly in `app/`; re-run the unzip |
| Page looks old / new feature missing after an update | browser or Cloudflare cache, or the old program is still in `app/`, or the container was not restarted | footer build id vs `/api/health` (below); hard reload; Cloudflare -> Caching -> Purge Everything; `curl -sI https://host/` must show `cache-control: private, no-cache` and no `cf-cache-status: HIT`; redo the update with `rm -rf app/*`; restart |
| Everybody gets "Too many attempts" or "Too many new accounts from this address" | `TRUST_PROXY` not set, so every visitor looks like the tunnel | set `TRUST_PROXY: "1"`, restart |
| Logged out all the time, or the login page loops | cookie blocked (browser setting), or the session file was reset (server restarted with an empty `sessions.json`) | log in again; check that `DATA_DIR` is persistent and writable |
| "Reconnecting..." bar, no live updates | WebSocket blocked (proxy without Upgrade headers, `Host` rewritten so the origin check fails with 401), or tunnel down | check `cloudflared` logs; in a proxy pass `Upgrade`/`Connection` and the original `Host` (or `X-Forwarded-Host` with `TRUST_PROXY=1`) |
| "Wrong invite code" for a friend | code mistyped, or it was changed | re-send the code; the first account never needs it |
| Friend forgot the password | there is no mail reset | section 7 |
| Link preview in chat apps shows a Cloudflare login | Access blocks `/og-image.png` | add the Bypass application (section 4) |
| `/demo` gives 404 | running from a git checkout; `public/demo/` is generated | `node demo/build.js --public`; the zip and the Docker image already contain it |
| A game is stuck with only bots to move, log has `Bot runner: game X ... is stuck` | a bot bug (no accepted move) | a human resigns or the host closes the game; report with the log line (`test:bots` reproduces) |
| `Action crashed` in the log, players see "Server error" | a rule bug triggered by a move; the game state is restored, the game continues | note action type and game id from the log; look in `games/<id>.json` |
| A game vanished from the lobby after an update | its file moved to `games/_broken/` (log: `WARNING: game ... is broken`) | send the file to the maintainer; it cannot be repaired automatically |
| Some text appears in English in another language | missing translation row | add a row to a `lang/games/*.tsv` (15 languages) and rebuild; see `../CLAUDE.md` |
| Disk filling up | logs without rotation (when not using the provided YAML) | add the `logging:` block; old `*.corrupt-*` files can be deleted |
| Health check failing | app crashed or port mismatch | `docker logs`; `wget -qO- http://127.0.0.1:8080/api/health` inside the container |

### Stale-cache check with the build id

1. The footer of the login, lobby and profile pages ends with ` · <7 characters>` (the build id).
2. `curl -s https://your-host/api/health` returns `{"ok":true,"build":"<7 characters>"}`.
3. Different values: the browser (or a cache) serves an old `index.html`/script. Hard reload (Ctrl+Shift+R), try a private window, purge the Cloudflare cache.
4. Equal values but the old behaviour: the *server* runs old code. The id is a hash over `server/` and `public/` taken at start, so after replacing files you must restart the container; note the id after every update and compare.
5. `curl -sI https://your-host/js/app.js`: expect `cache-control: private, no-cache`, an `etag`, no `age` header.
