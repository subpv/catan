# Rules, house rules and known gaps

Which books the games follow, every house rule and experiment with the exact place where it lives, the known data gaps and the Beta status of each mode, and step lists for adding a house rule, an experiment or a whole game. Paths are relative to the `broch/` folder of the repository unless they start with `rulebooks/`. The long list of deliberate deviations per game is the "Rule notes" section of `broch/README.md`; do not duplicate it here.

## 1. Rulebooks (`rulebooks/`)

Rules were implemented from these PDFs (what each is, judged by its file name). When the German and the English edition disagree, the table says which one wins.

| Game / part | File(s) | Notes |
|---|---|---|
| Classic game 3-4 players | `de/4002051684655_CAT_NE_Basis34_Manual_DE_web.pdf` | 2025 edition |
| Classic 5-6 players | `de/CATAN_Das Spiel_5-6_Anleitung.pdf` | two "stones" share each turn (paired turns), see README |
| Cities & Knights 3-4 / 5-6 | `de/400205684754_CAT_NE_SuR_Manual_DE_web.pdf`, `de/400205685133_CAT_NE_SuR56_Manual_web.pdf` | printed rules, small deviations listed in README |
| Seafarers 3-4 / 5-6 | `de/400205684679_CAT_NE_SEE34_Manual_DE_web.pdf`, `de/400205685126_CAT_NE_SEE56_Manual_DE_web.pdf` | maps transcribed from the pictures |
| Traders & Barbarians 3-4 / 5-6 | `en/CATAN_Traders_Barbarians_6th_ed_CN3089.pdf`, `en/..._5-6_6th_ed_CN3090.pdf` (wins); fallback `de/685140_CATAN_HuB_Manual_DE_web.pdf`, `de/685157_CATAN_HuB56_Manual_DE_web.pdf` | English 6th edition is the reference |
| Explorers & Pirates 3-4 / 5-6 | `de/685164_CATAN_EuP_Manual_250408_web.pdf`, `de/685171_CATAN_EuP56_Manual_web.pdf` | German books only |
| New Energies | `de/684365_CAT_ENERGIEN_Manual_0_compressed.pdf` | |
| Dawn of Humankind | `de/683221_CATAN_Aufbruch der Menschheit_Manual_DE_web.pdf` | board read from pictures |
| Rise of the Inkas | `de/CATAN_Inka_Spielanleitun.pdf` and `en/CATAN_Rise_of_the_Inkas_Almanac.pdf` | the almanac wins where it differs |

Tests that pin the rules to the books are named in each test file's header (`test/rules/*.js`): one assertion per rule that is easy to get wrong, with the page in a comment.

## 2. Modes, engines, status

"Beta" is shown as a badge in the lobby, the game list and the game title. It means "books, cards or pictures are incomplete", not "buggy". All modes pass the same fuzz and bot tests.

| Mode (lobby) | Engine | Points to win | Status | Where the Beta label comes from |
|---|---|---|---|---|
| Classic (2-6; books are for 3-6) | `engine/classic/game.js` | 10 | complete | - |
| Cities & Knights | `engine/knights/knights.js` in the classic engine | 13 (Seafarers scenario points + 2) | complete | - |
| Seafarers (8 scenarios, optionally with C&K) | `engine/seafarers/` | scenario: 14, 13, 12, 14, 13, 14, 10, 12 | **Beta** | `app.js` (every `expansion !== 'none'`), `classic/screen.js` `modeLabel` |
| Traders & Barbarians (the 5 scenarios of the book, one per game, plus the variants Event cards, Friendly robber and Harbors; the 3 big scenarios only with the classic rules, not with C&K) | `engine/traders-barbarians/` | `tradersVp(variants)` in `shared/constants.js`: 10 (Fishermen, Rivers, plain), 12 (Merchant Trains, Barbarian Attack), 13 (wagon scenario), +1 with the Harbors variant | **Beta** | same |
| Explorers & Pirates (5 scenarios, 2-6) | `engine/explorers-pirates/explorers.js` (own engine) | 8, 12, 15, 15, 17 | **Beta** | `app.js` (`g.mode === 'explorers'`) |
| New Energies (3-4) | `engine/energies/` on the kit | 10 | complete | - |
| Dawn of Humankind (3-4) | `engine/humankind/` on the kit | 10 | **Beta** | `beta: true` in `games/humankind/plugin.js` |
| Rise of the Inkas (3-4) | `engine/inkas/` on the kit | 11 culture markers (`fixedVp`) | complete | - |

To drop a Beta label once the data is complete: remove the `beta: true` flag (standalone plug-in) or the hard-coded `· Beta` in `app.js` / `classic/screen.js`, and update `demo/progress-data.js`.

Seafarers scenario keys (`engine/seafarers/scenarios.js`): `shores`, `islands`, `fog`, `desert`, `tribe`, `cloth`, `wonders`, `newworld`; texts for the lobby in `public/js/games/seafarers/scen.js`. Traders & Barbarians keys (`meta.variants`): scenarios `fishermen, rivers, caravans (Merchant Trains), barbarians, traders (wagon scenario)`, variants `events, friendly, harbors`.

## 3. House rules and experiments

House rules are switches in the lobby with a "House rules" group; with a switch off the rulebook applies. Experiments are the "Experiments" group (ideas beyond the book). The path of every switch: lobby checkbox (`public/js/app.js` `newGame`) -> `POST /api/games` body -> `meta.<key>` (`server/index.js`) -> `engine.createGame(... options)` at start -> `state.options.<key>` (`engine/classic/game.js` `createGame`) -> rule code and `legalFor` -> client reads `view.options.<key>`.

| Key | Lobby label | Default | Modes | Effect | Engine | Client | Tested in |
|---|---|---|---|---|---|---|---|
| `robberReturn` | House rule: forgotten robber | off | all classic-family modes | A player who must move the robber may end the turn instead; the robber goes back to his home hex (desert, Seafarers `robberStart`, never a face-down fog tile; Traders & Barbarians home kept, also "beside the board"). | `game.js`: `robberHomeHex`, handler `leaveRobber`, `L.leaveRobber` in `legalFor` | `classic/screen.js` ("forgetRobber") | `test/rules/robustness.js`; fuzz configs `classic-rr`, `knights-rr`, `sea-rr` in `test/fuzz/simulate.js` |
| `knightsFree` | House rule: knights without a limit | **on** | classic only (not Cities & Knights) | Knight cards may be played any number of times per turn; every other development card still once. | `game.js` (`playDev`: `devPlayed` check and flag); `migrate` sets old saves to `mode !== 'knights'` | `classic/screen.js` (card playable, costs dialog) | fuzz config `classic-kf` |
| `startBoth` | House rule: starting resources for both | off | classic and C&K | Both setup buildings pay starting resources (the book pays only the second); in C&K the city counts like a settlement (no commodities). | `game.js` `placeSettlement` (`startingResources`) | `classic/screen.js` (setup hint) | fuzz configs `classic-sb`, `knights-sb` |
| `vpAtOnce` | House rule: show victory point cards at once | off | classic only | A bought victory point card is revealed and counts for everybody immediately. | `game.js` `buyDev` (sets `revealed`) | uses `view.players[].dev` as usual | `test/rules/experiments.js` |
| `expBuildAnytime` | Experiment: build anytime | off | classic and C&K | After the dice, every player may build and buy development cards (and in C&K knights, walls, improvements), not only the active player. Trading and moving ships stay with the active player. Reaching the points target by building out of turn wins at once (`checkWin(s, who)`). | `game.js`: `anytimeBuilder`, `requireActor`, `legalFor` passes `isActor \|\| anytimeBuilder` to `X.legalExtra` | `classic/screen.js` (`actor`), `knights/ui.js` | `test/rules/experiments.js`, `test/rules/robustness.js` |
| `expExtraStart` | Experiment: bigger start | off | classic and C&K, not with Traders & Barbarians or scenarios that already have a third setup round | A third setup round: classic 2 settlements + 1 city, C&K 1 settlement + 2 cities (`setup.needs`). | `game.js` `createGame` (`extraStart`, `setup.queue`) | setup status text | `test/rules/experiments.js` |
| (always on) robber statistics | stats page, "Robber at {name}" | - | all | Counts on whose land each player moved the robber (`stats.robbed`, summary `robbed`). | `game.js` `moveRobber` | `core/stats.js` | `test/rules/experiments.js` |

Other lobby settings that are not house rules: `big` (use the 5-6 board with fewer players), `variable` (Seafarers: deal tiles and numbers again inside the printed outline), `scenario`, `variants` (Traders & Barbarians), `vpTarget`, and per-game `gameOptions` (booleans, whitelisted by `cleanOptions` in `server/index.js`): Inkas `freeStart`, `variableLand`; Dawn of Humankind `free`. The Cities & Knights aqueduct (choose the resource once, then automatic) is a fixed owner's decision, not a switch (README, Expansions).

## 4. Known data gaps

These are missing facts, not missing code. Each says where the stand-in lives, so that a photo of the real component can be turned into a one-line fix.

| Gap | Effect now | Where | When the data exists |
|---|---|---|---|
| 12 extra development cards of the Traders & Barbarians 5-6 box | placeholder: 8 Knight, 2 Road Building, 1 Swift Journey, 1 Victory Point | `DEV_EXTRA_56` in `engine/traders-barbarians/wagon-scenario.js` (wagon scenario only) | edit the counts; check `test/rules/tb-traders.js` |
| Numbers on the back of the 6 pirate lairs of the Explorers & Pirates base box | assumed 4, 5, 6, 8, 9, 10 (the two lairs of the 5-6 box: 9 and 10, told by the owner, unchecked) | `LAIR_NUMBERS` in `engine/explorers-pirates/eup-board.js` | edit the arrays |
| Seafarers scenario 7 "The Pirate Islands" (pirate fleet, fortresses, warships) | not available; the other seven scenarios plus New World are | `engine/seafarers/scenarios.js` (add `MAPS.<key>`, `SCENARIOS`, `scen.js` texts), new rules need a plug-in section in `seafarers.js` | `test/rules/scenario-maps.js` checks tile and number tables |
| Seafarers harbour types | dealt at random on the printed harbour spots (the icons are unreadable in the PDF) | `scenarios.js` `ports` lists | put types into the `ports` entries |
| Dawn of Humankind map | read from the pictures of the book: crossings on glacier/sea and some discovery conditions may be off by one level | `engine/humankind/humankind-map.js` (`HEXES`, `NODES`, `THREAT_HOME`) | fix tables |
| Catan for Two (Traders & Barbarians, two players, neutral players, trade tokens) | not implemented (the engine already supports the two-wagon Merchant Trains round for it) | would be a variant in `traders-barbarians/hub.js` | - |
| Traders & Barbarians 5-6 pictures | bridge-site edges on the river art and the positions of the 5-6 fishing grounds read from pictures; event card counts per number not printed (36 shuffled cards) | `engine/traders-barbarians/hub.js` | - |
| New Energies slot counts of the events (4/4/3/3 brown, 4 climate, 3/4 green) | read from the frame picture | `EVENTS` in `engine/energies/energies.js` | - |
| Rise of the Inkas | the 2 pure ocean fields of the real board are not drawn (no rule effect) | `FRAME` in `engine/inkas/inkas.js`, art in `public/js/games/inkas/art.js` | cosmetic |
| Demo ignores three switches | `demo/mock.js` never copies `vpAtOnce`, `expBuildAnytime`, `expExtraStart` into `meta` or into the `createGame` options (lines ~78, ~131, ~188). The public `/demo` hides every switch with CSS (`demo/demo.css`), so nobody notices there; the single-file `dist/broch-demo.html` shows the switches and they have no effect | `demo/mock.js` | add the three keys next to `robberReturn` in the three places, rebuild the demo |

Deliberate deviations that are not gaps (classic board laid out at random, first player drawn, victory point cards counted automatically, ...) are listed in `broch/README.md`, "Rule notes".

## 5. How to add things

### 5.1 A house rule or an experiment (classic family)

1. **Engine** `server/engine/classic/game.js`: in `createGame` add `myRule: !!options.myRule` (with the mode restriction, e.g. `&& !knights`) to `s.options`. Implement it where the rule applies; if it changes what the player may do, also offer it in `legalFor` (the `legal` block), because the client never decides legality. If it adds a player action, add a handler to `HANDLERS` (or the expansion's `handlers`). In `migrate(s)` give old saves a default (see how `knightsFree` is handled at the end of the file).
2. **Server** `server/index.js`: in `POST /games` put `myRule: !!b.myRule && <mode condition>` into `meta`; in the `start` branch pass `myRule: !!meta.myRule` in the `engine.createGame` options. Add it to `gameCard()` only if the lobby needs it.
3. **Demo** `demo/mock.js`: the same two spots (create `meta` around line 188, `createGame` options around line 131; the card at line 78 if you added it to `gameCard`). Forgetting this is how the three newest switches got lost in the demo.
4. **Lobby** `public/js/app.js`: default in `newGame`, a `sw('myRule', label, hint)` entry in the right group (`house` or `exp`, there is a list of keys per group for the phone fold-out), and nothing else: the whole `newGame` object is posted.
5. **In-game UI**: `public/js/games/classic/screen.js` (and `knights/ui.js` for C&K) read `v.options.myRule`; show the active house rules in the costs dialog list (`house` in `costsDialog`).
6. **Texts**: label, hint, any new log line (`log(s, 'English template', {...})`), any new refusal message (`fail('...')`) and tutorial text, each as a tsv row with 15 translations in `public/js/lang/games/` (an existing file such as `experiments.tsv`, or a new one); run `node public/js/lang/build-games-lang.js`.
7. **Tests**: a case in `test/rules/experiments.js` (helpers: `setupAll(mode, options)` plays the setup phase and returns the state; `started(bool)` is specific to `expBuildAnytime`), and a config line in `CONFIGS` of `test/fuzz/simulate.js` (`'classic-myrule': ['classic', { myRule: true }]`) so random games exercise it. `npm test` runs only the first two configs (`classic`, `knights`); run yours with `node test/fuzz/simulate.js 30 classic-myrule`. Check the whole path with a real server: create a game with the switch through `POST /api/games` (see `test/e2e/bots-server.js` for a minimal client), start it and look at `options` in the first `state` message.
8. **Docs**: house rule list in `broch/README.md`, the table in section 3 above, `demo/progress-data.js` if the status changes.
9. Run `npm test`, `npm run test:demo`, `npm run test:browser`.

### 5.2 A rule fix or a new rule inside an existing game

Write the failing case in `test/rules/<game>.js` first (build a small state, play one action, assert). Fix in the engine; keep `viewFor` free of private data; if the saved state gains a field, default it in `migrate`. If the rule is explained in a tutorial (`public/js/games/<game>/tutorial.js`) or in a text under `lang/games/`, change the English key *and* all 15 translations. Add a line to the README "Rule notes" when the digital version deviates from the book.

### 5.3 A new standalone game (the four existing ones are the templates)

Server:
1. `server/engine/<id>/<id>.js`: `const K = createKit(spec)` (hand items, `costs`, `pieces`, `supply`, `vp`, `breakdown`, `bankRate`, `roll`, hooks), `HANDLERS = { ...K.HANDLERS, ...own }`, a board builder (use `shared/board.js` `generate` / `geometryFromCenters`), `createGame` (start from `K.baseState`, then `K.start(s)`), `viewFor` on `K.viewCommon`, `migrate`. Export `{ createGame, act: (s, p, a) => K.act(s, p, a, HANDLERS), viewFor, summary: s => K.summary(s), migrate, _internal: { spec, minPlayers?, fixedVp?, HANDLERS, ... } }`. Everything private stays out of `viewFor`; all refusals are `fail('English sentence')`.
2. Register in `server/engine/index.js`: add to `STANDALONE`. `MODES`, `minPlayers`, `maxPlayers`, `defaultVp`, `fixedVp` follow from `_internal.spec`.
3. Bots: `server/bots/fuzz-<id>.js` (return every plausible move for a view) and a branch in `server/bots/standalone.js` `BOTS` (a heuristic `decide`); register the fuzzer in `FUZZ` of `server/bots/runner.js` and in `test/fuzz/simulate-games.js`.
4. Server lobby: nothing, `isStandalone(mode)` accepts it; `gameOptions` booleans pass through `cleanOptions`. Add the mode to `demo/mock.js` only if it has special create handling.

Client:
5. `public/js/games/<id>/plugin.js`: `register({ id, name, vp, minPlayers, maxPlayers, tutorial, blurb, tagline, lobbyOptions?, tokenKeys, limited, bankBuys, tradeKeys, hud, side, playerMeta, awards, rollStatus, mainStatus, pendingText, pendingDialog, actions, onBoardClick, fresh, ext, boardKey, ... })`, `extendCore({ names, colors, terms, glyphs, cards })`, loot/threat entries in `core/fx.js` (`LOOT_BY_MODE`, `THREAT_BY_MODE`, ...). Copy `games/energies/plugin.js` and cut down. Art in `games/<id>/art.js`.
6. `public/js/games/<id>/tutorial.js` using `addChapter` of `core/tutorial.js`.
7. Import both in `public/js/app.js` (that registers them) and list every new module in `public/index.html` as `<link rel="modulepreload">` (`node test/rules/preload.js` checks).
8. Texts: tsv rows for everything new (names, blurbs, log templates, errors, tutorial).
9. Tests: `test/rules/<id>-rules.js` for the book's rules (and add it to the `test` script in `package.json`, which lists every suite by name), `test/fuzz/simulate-games.js` picks the game up from `engine.STANDALONE` (it needs `server/bots/fuzz-<id>.js`), add the mode as an entry of the `modes` table in `test/e2e/bots-server.js` and of the mode table near the top of `test/e2e/mobile-shots.js`, and to the mode list of the `test:browser` script in `package.json`. Also check `test/rules/counter-offers.js` (it loops over the games) and `STANDALONE` in `public/js/core/stats.js` (display names on the stats page).
10. Docs: README mode list and rule notes, `demo/progress-data.js` row (status `Beta` until the data is complete), this file's tables, `CLAUDE.md` repo map if a folder is new. Then `node scripts/make-dist.js`.

### 5.4 A Seafarers scenario or a Traders & Barbarians variant

Seafarers: add `MAPS.<key>` (rows in the token language documented at the top of `scenarios.js`, one block per player count) and a `SCENARIOS` entry (title, points); add texts to `SCEN` in `public/js/games/seafarers/scen.js`; extend `test/rules/scenario-maps.js` with the tables printed in the book. Special rules go through `board.rules` flags read by `seafarers.js` / `game.js` (see `thirdSettlement`, `noReturn`, `bonus`, `start`). T&B variants: `traders-barbarians/hub.js` (`normalize`, `defaultVp`, `viewDefaults`), the lobby tiles in `app.js`, tests in `test/rules/tb-*.js`.
