# CLAUDE.md - Broch, entry point for AI coding agents

Broch is a self-hosted settlers-style board game for friends and family: accounts, lobby, live play over WebSocket, computer players, statistics, 16 languages, phone and desktop layouts, public in-browser demo at `/demo`. Eight game modes (classic, Cities & Knights, Seafarers, Traders & Barbarians, Explorers & Pirates, New Energies, Dawn of Humankind, Rise of the Inkas). **Never write the word "Catan" in any UI text** (use "Broch"); `test/rules/i18n-check.js` fails on it.

The project is **complete and in maintenance mode**; the original owner does not work on it any more. Everything you need is in this repo. The app lives in `broch/` (run every command from there). Docs: `docs/ARCHITECTURE.md` (how it works), `docs/OPERATIONS.md` (deploy, backup, passwords, troubleshooting), `docs/RULES-AND-GAPS.md` (rules, house rules, data gaps, how to add rules/games), `broch/README.md` (feature list and rule notes), `PROGRESS.md` (status table, German, generated).

## The 10 things to know first

1. **The server is authoritative and the client never sees the game state.** Clients get `engine.viewFor(state, seat)`, which already hides everything private (other hands, decks, face-down fog tiles). Never send `g.state` or a part of it to a client.
2. **`server/engine/index.js` `act()` is the only door for player actions** (WebSocket and bots). It rejects hostile shapes (prototype names, non-integer ids) and rolls the state back when a rule throws. Do not call a game's own `act` from the server code; call `engine.act`.
3. **Two engine families behind one interface.** The classic family (`classic`, `knights`, plus Seafarers and Traders & Barbarians as expansions) is `server/engine/classic/game.js` with plug-ins that receive its helpers (`make(core)`). The standalone games (`energies`, `humankind`, `inkas`, `explorers`) are own engines, three of them built on `server/engine/shared/kit.js` (`createKit(spec)`). Both expose `createGame / act / viewFor / summary / migrate`.
4. **State is plain JSON and persists as is** (`DATA_DIR/games/<id>.json`). No classes, Maps, functions or `undefined` holes in game state. Old saved games must keep loading: add a field with a default in `migrate(s)`, never assume it exists.
5. **The English text is the i18n key.** `t('Some English text')`. A new visible text needs a row with 15 translations in `broch/public/js/lang/games/*.tsv`, then `node public/js/lang/build-games-lang.js`. Generated files are never edited by hand (list below).
6. **Desktop must stay pixel-identical.** Phone CSS lives only in `public/css/mobile-*.css`, always inside the phone media queries. Above 1040 px wide nothing may change.
7. **No bundler in production.** The browser loads plain ES modules from `broch/public/js/`. A new module must be added to the `<link rel="modulepreload">` list in `public/index.html` (`test/rules/preload.js` fails otherwise). Only the demo (`demo/build.js`) uses esbuild.
8. **The CSP forbids inline scripts** (`script-src 'self'`). Inline `style` attributes are allowed. That is why the public demo is a multi-file ES-module build and `dist/broch-demo.html` (one file, inline script) is only for opening locally.
9. **Data on disk is the product.** JSON files in `DATA_DIR`, written atomically (tmp file + rename, fsync + `.bak` for users and history). A damaged file is quarantined, never silently replaced by an empty one. Do not weaken `server/store.js`.
10. **`dist/broch-app.zip` and `dist/broch-demo.html` are committed.** They are only as new as the last `node scripts/make-dist.js`. Rebuild as the very last step of a release, then `npm run dist:check`.

## Repo map

| Path | Purpose |
|---|---|
| `broch/server/index.js` | HTTP API, static files (ETag, brotli, CSP), sessions, rate limits, WebSocket, lobby, start-up migrations |
| `broch/server/store.js` | JSON persistence in `DATA_DIR` (atomic writes, `.bak`, quarantine of damaged files) |
| `broch/server/engine/index.js` | the engine registry and the one `act()` door |
| `broch/server/engine/classic/` | `game.js` (all classic rules, ~1000 lines), `expansions.js` (glue that asks the active expansion) |
| `broch/server/engine/{knights,seafarers,traders-barbarians}/` | expansions, each `module.exports = function make(core)` |
| `broch/server/engine/{energies,humankind,inkas,explorers-pirates}/` | standalone games |
| `broch/server/engine/shared/` | `kit.js` (shared by the standalone games), `board.js` (hex geometry and generator), `constants.js` |
| `broch/server/bots/` | computer players: `runner.js` (scheduling), `classic.js` / `standalone.js` (decisions), `fuzz-*.js` (random fallback moves), `names.js` |
| `broch/public/index.html`, `styles.css`, `css/` | page shell, desktop styles, `mobile-shell/game/dialogs.css` (phone), `landing.css` |
| `broch/public/js/app.js` | login/landing, lobby (new-game form), profile, router, WebSocket wiring |
| `broch/public/js/core/` | shared client code: `core.js` (api, ws, modal, toast, glyphs), `board.js` (SVG board), `zoom.js`, `fx.js` (sounds, animations, state diff), `builder.js` (builder animation), `feed.js`, `stats.js`, `victory.js`, `tutorial.js`, `dock.js` + `phone.js` (phone layout), `i18n.js`, `cards.js`, `countries.js` |
| `broch/public/js/games/classic/screen.js` | the screen of the whole classic family; `knights/ui.js`, `seafarers/ui.js`, `traders-barbarians/hub*.js` are its plug-ins |
| `broch/public/js/games/sgame.js` + `games/registry.js` | the one screen for the standalone games; each game has `games/<id>/plugin.js` that calls `register({...})` |
| `broch/public/js/lang/` | translations: `src/*.txt` + `_keys.json` -> `<code>.js`; `games/*.tsv` -> `x/<code>.js` (both generated) |
| `broch/demo/` | in-browser demo: `build.js`, `mock.js` (the real engine in the page), `public-prelude.js`, `progress-data.js` |
| `broch/scripts/` | `make-dist.js` (release), `dist-check.js`, `admin.js` (reset password etc.) |
| `broch/test/` | `rules/` (rule tests), `fuzz/` (random games), `e2e/` (real server, some with Chromium), `seed.js` |
| `deploy/` | `ANLEITUNG-TrueNAS.md` (German guide), `truenas-compose.yml` |
| `dist/` | release artefacts (committed, generated) |
| `rulebooks/` | the rulebook PDFs the rules were checked against (`de/`, `en/`) |

## Run, test, build

Node 22 (`engines` says >=20). All from `/home/user/catan/broch`:

```sh
npm ci                      # ws + esbuild (dev); npm install works too
npm start                   # http://localhost:8080, data in broch/data (PORT, DATA_DIR override)
npm test                    # 25-45 s: 17 rule suites + fuzz (random bot games through the engines)
npm run test:all            # npm test + test:security + test:resign + test:ops (no browser needed)
npm run test:bots           # bots play whole games on a real server; one mode: npm run test:bots -- classic
npm run test:pacing         # bots wait for the client's animation ack ({t:'fx'})
# Browser tests: Playwright is NOT in package.json (not needed in production)
npm i -g playwright && npx playwright install chromium
npm run test:demo           # builds the demo, plays a classic game in Chromium (sets NODE_PATH=$(npm root -g) itself)
npm run test:browser        # all nine modes at 390x844, fails on JS page errors, screenshots in /tmp/broch-shots
CHROMIUM=/path/to/chrome npm run test:browser   # default path /opt/pw-browsers/chromium-1194/chrome-linux/chrome, then Playwright's own
SEED=13 node test/rules/tb-traders.js           # replay a random-play test deterministically (test/seed.js)
node public/js/lang/build-lang.js               # src/*.txt -> lang/<code>.js
node public/js/lang/build-games-lang.js         # games/*.tsv -> lang/x/<code>.js (reports missing columns, lost placeholders)
node demo/build.js --public                     # public/demo/ so that /demo works from a checkout (git-ignored)
node scripts/make-dist.js && npm run dist:check # release: dist/broch-app.zip, dist/broch-demo.html, PROGRESS.md
node --check server/file.js                     # after every server edit
node --input-type=module --check < public/js/file.js   # after every client edit
```

`test:browser` needs a free machine: under load a phone test can report "classic never reached the main phase" (the bots wait for the player's animation ack); run it again before suspecting your change.

## Conventions seen in the code

- **Comments:** every file starts with a comment that says what it is and how it is used. Short English comments explain *why* (a rule of the book, a past bug), not what. Section dividers: `// ------------------------------------------------------------ name` (client, server) and `// ---------------------------------------------------------------- name` (engines). Rule references name the book ("rulebook p. 15", "the German book").
- **Style:** 2 spaces, single quotes, semicolons, terse one-line helpers (`const tx = (k, p) => esc(t(k, p))`). Server and tests are CommonJS with `'use strict'`; the client is ES modules with explicit `.js` extensions. No TypeScript, no framework, no build step for the app.
- **Engine errors:** a refused move is `fail('English sentence', params)` -> `GameError`. The sentence is shown to the player through `t()`, so it is an i18n key too. Other exceptions are bugs and are logged as `Action crashed`.
- **Log entries** are English templates plus parameters so each client translates them: `log(s, '{@p} rolled {n}.', { p, n })`. Placeholders: `{@x}` player index or list, `{$x}` card object, `{#x}` game term, `{%x}` card name, `{x}` plain value. `fx.js` matches some templates by their exact text: do not reword an existing one without searching `public/js`.
- **i18n:** `t(english, params)`; escape with `esc()` / `tx()` before putting text into HTML. Missing keys fall back to English. New text: tsv row with English + de da sv nb nl fr es it pt pl tr uk ko ja zh (tab separated, keep `{placeholders}`), then run the build. `test/rules/i18n-check.js` only checks the word "Catan" and the Traders & Barbarians waiting texts; for everything else you are the check.
- **Generated, never edit by hand:** `public/js/lang/<code>.js`, `public/js/lang/x/<code>.js`, `public/demo/`, `dist/*`, `PROGRESS.md` (edit `broch/demo/progress-data.js`, then `node demo/progress.js`).
- **Phone vs desktop CSS:** `styles.css` is the desktop. Phone rules go into `css/mobile-shell.css` (pages), `mobile-game.css` (game screens, dock, sheet), `mobile-dialogs.css`, each wrapped in `@media (max-width: 760px)` or the landscape-phone query. JS must agree with CSS on what a phone is: use `isPhone()` from `core/phone.js`, never your own width check. Shared variables `--m-*` are documented at the top of `mobile-shell.css`.
- **Tests:** plain scripts, no framework: `ok(name, fn)` prints `ok`/`FAIL` and sets `process.exitCode`. A rule change gets a test in `test/rules/`. Random-play tests must be reproducible with `SEED`.

## The engine pattern in one screen

- Registry: `server/engine/index.js` has `STANDALONE = { energies, humankind, inkas, explorers }`; everything else is the classic engine (`engineOf(mode)`). `MODES`, `minPlayers`, `maxPlayers`, `defaultVp`, `fixedVp` read the standalone game's `_internal.spec` / `_internal.minPlayers` / `_internal.fixedVp`.
- Classic family: `classic/game.js` holds `HANDLERS = { actionType: (s, seat, a) => ... }`, `legalFor(s, seat)` (the `legal` block of the view), `viewFor`. Expansions are factories: `expansions.js` builds Seafarers and Traders & Barbarians with `make(core)`, `game.js` builds Knights the same way; `core` is the object of helpers (`log, fail, pay, take, pushPending, ...`) so no plug-in imports `game.js`. `Object.assign(HANDLERS, KN.handlers, X.handlers)` adds their actions, and `game.js` calls hooks such as `X.roadEdgeOk`, `KN.playerView` where an expansion changes a rule.
- Standalone games: `const K = createKit(spec)`, then `const HANDLERS = { ...K.HANDLERS, ownAction(s, p, a) {...} }` (a game may wrap a kit handler, e.g. `offerTrade`), `act: (s, p, a) => K.act(s, p, a, HANDLERS)`, `viewFor` built on `K.viewCommon`, `summary: s => K.summary(s)`. The kit supplies setup, dice, trading with players and the bank, turn flow, pending questions, longest road, win check.
- Client: `games/registry.js` `register(plugin)`; `sgame.js` calls plugin hooks (`hud`, `side`, `playerMeta`, `awards`, `rollStatus`, `mainStatus`, `pendingText/pendingDialog`, `actions`, `onBoardClick`, `fresh`, `boardKey`, `ext`, ...). `games/<id>/plugin.js` is imported in `app.js` so it registers itself. The classic family does the same with factories `createKnights`, `createSeafarers`, `createHub` called from `classic/screen.js`.
- Exact steps for a new game or rule: `docs/RULES-AND-GAPS.md`, last section.

## Bots

A bot is a seat whose user id starts with `bot_` (`meta.bots[id].name`). `server/bots/runner.js` runs after every move: it picks a seat that is expected to move (own turn or a pending question), waits until the human screens have reported `{t:'fx', v}` (at most 8 s, `viewersBehind`), asks `decide(view)` of `bots/classic.js` or `bots/standalone.js` (the bot sees only its own `viewFor`, it does not cheat), and if the engine refuses, tries up to 300 shuffled moves from `fuzz-classic.js` / `fuzz-<game>.js`. If only bots had to move and nothing was accepted, it logs `Bot runner: game X is stuck`. Games with a bot never count for the statistics. Resigning replaces the human by a bot. `BROCH_BOT_DELAY=0` removes the pause (tests). The demo bundles the same decision code (`demo/mock.js`).

## State, views and updates to the client

`stateFor(c, g)` in `server/index.js` calls `engine.viewFor`, then leaves out `board` when this connection already has the identical one (`boardSame: true`) and sends only new `track` entries (`trackFrom`). `core/core.js` `hydrate()` puts them back and asks for a full `watch` if its copy is out of step. The client computes what is new itself: `fx.js` `diff(prev, next)` yields `fresh` pieces and log `events` that drive builders, dice and banners; after the animations it answers `{t:'fx', v}`. Details and diagrams: `docs/ARCHITECTURE.md`.

## Invariants that must not break

- Hidden information stays server-side: opponents' `res`/`dev`, decks, fog hexes (`X.viewBoard` blanks them), other people's e-mail (`publicUser` has none; only `meUser` does).
- Desktop layout pixel-identical; phone work only in phone queries.
- Security headers on every answer (`securityHeaders()`: CSP, nosniff, DENY framing, no-referrer, COOP, HSTS behind https), WebSocket `Origin` check (`sameOrigin`), hashed session tokens, scrypt passwords, rate limits. `npm run test:security` guards them.
- Static files: `Cache-Control: private, no-cache` plus `CDN-Cache-Control: no-store`, API `no-store`.
- `store.js`: atomic writes, `.bak`, quarantine (`games/_broken/`, `*.corrupt-<time>`), `users.json` unreadable -> the server stops (`FATAL`), it never starts empty.
- One bad game must not stop the server: start-up steps run per game through `eachGame` and quarantine the game that throws.
- Game state stays JSON and migratable; `engine.act` stays atomic.

## Pitfalls that already bit us

- **Half-applied edits in `public/js/games/sgame.js` crashed every standalone game** at once (a syntax or reference error in a shared module takes down all modes that import it). `npm run test:browser` exists for that: it opens all nine modes and fails on page errors. Run it (or at least `node --input-type=module --check`) after any client edit; two agents editing one file at the same time is how it happened.
- **Dynamic import cache busting.** Static imports are revalidated by ETag, but `import('../lang/x/de.js')` is built at run time, so `core/i18n.js` appends `?v=<build id>` read from `<meta name="broch-build">` (the server stamps the page). The demo has no such meta. If you add another dynamic import, bust it the same way.
- **Cloudflare caching.** A shared cache once served old scripts after an update. Static answers are `private, no-cache` + `CDN-Cache-Control: no-store`; keep it so. Check a deploy with the footer build id versus `GET /api/health`.
- **Behind a proxy without `TRUST_PROXY=1`** every visitor looks like the proxy: shared rate limits ("Too many attempts"), no `Secure` cookie. Set `TRUST_PROXY=1` behind Cloudflare.
- **Inline scripts are blocked by the CSP**, so anything generated for the real site must be an external module (this is why `public/demo/` exists).
- **The server computes `BUILD_ID` at start.** Changed files are served at once (mtime check) but the id in the footer only changes after a restart.
- **A game file or user file edited by hand while the app runs is overwritten** by the app's memory. Stop the app first (`scripts/admin.js` says so too).
- **Fuzz/e2e tests can fail rarely.** Replay with `SEED`; formerly flaky: knights bots (forced progress-card deadlock, fixed, the runner now logs `stuck`) and `tb-traders` (test no longer depends on random setup roads).
- **`demo/mock.js` is a second copy of the server's lobby code** (card, create, start). A new lobby field or house rule must be added there too, or the demo shows the switch and ignores it (that happened to `vpAtOnce`, `expBuildAnytime`, `expExtraStart`, see `docs/RULES-AND-GAPS.md` section 4).
- **Text emitted by the server is user-visible too.** Log templates (`log(s, '...')`) and `fail('...')` messages in `server/engine/` are English keys translated by the client. `i18n-check.js` scans only `public/js` and `demo/*.js`: a log line 'The Catanians clear ...' once stayed behind in `energies.js` after its translation row had been renamed (fixed). Search `server/` as well when you rename a text, and keep the key identical on both sides.
- **`.dockerignore` excludes `*.md` and `test/`;** the Dockerfile builds the demo in its own stage because `public/demo/` is not in git.

## Definition of done (before you hand over or release)

1. `npm test` and `npm run test:all` pass; `npm run test:bots` (at least classic, knights, one standalone); `npm run test:browser` and `npm run test:demo` pass in a Chromium (all nine modes, 0 page errors).
2. New visible texts have 15 translations; `build-games-lang.js` reports no problems; no generated file was edited by hand.
3. New client modules are in the `modulepreload` list; desktop screenshots unchanged (compare at 1280x800); phone checked at 390x844.
4. A rule change has a test in `test/rules/`, updated tutorial text if the rule is explained there, and a note in `broch/README.md` (rule notes) and `docs/RULES-AND-GAPS.md`.
5. If saved games are affected: `migrate()` handles old ones (test with a game file from the previous version).
6. `PROGRESS.md` regenerated (`node demo/progress.js` after editing `demo/progress-data.js`).
7. Last step: `node scripts/make-dist.js` then `npm run dist:check`; commit including `dist/`. Deploy with `docs/OPERATIONS.md` (stop app, replace `app/`, start, compare footer build id with `/api/health`).
