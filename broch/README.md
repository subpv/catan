# Broch

An online settlers-style board game for you and your friends, self-hosted on TrueNAS.

- **Base game:** the classic island, 10 points
- **Expansions:** Cities & Knights (13 points: commodities, city improvements, knights, barbarian raids, progress cards; the aqueduct at science level 3 asks for your resource once, right when you reach the level, and from then on pays it out by itself whenever a roll (not a 7) gives you nothing; a chip in the science lane changes it), Seafarers (ships, islands, fog, gold, pirate; scenarios Heading for New Shores, The Four Islands, The Fog Islands), Traders & Barbarians (Fishermen of Catan, Rivers of Catan, Event cards; each switchable), Explorers & Pirates (fog map, fish and spice missions, pirate lairs). Cities & Knights can be combined with one of the other three.
- **House rules (switches in the lobby):**
  - *Forgotten robber:* if a player has to move the robber and ends their turn instead, the robber goes back to the desert
  - *Knights without a limit (classic game):* knight cards can be played as often per turn as you like; every other development card is still limited to one per turn
  - *Starting resources for both:* both buildings from the setup phase pay starting resources; in Cities & Knights the city counts like a settlement (one resource per tile, no commodities)
- **Standalone games** (own rules, own tile row in the lobby, 2–4 players, with the same board animations, a tutorial and all 16 languages; rules rebuilt from research, not copies of the printed ones):
  - *New Energies* (Energiewende): towns and cities, plus power plants. Cities also make science; a fossil plant costs 1 science and makes 2 energy but grows the footprint, a renewable plant costs 3 science, makes 1 energy and adds a green disc to the event bag. Every turn starts by drawing discs from the bag (brown ones bring smog, blackouts, droughts, price spikes; green ones help), hazards block the building or plant they land on until you clear them with 2 energy. 10 points wins, or the cleanest builder when the bag runs dry; if nobody built more renewable than fossil plants, everybody loses together.
  - *Dawn of Humankind* (Aufbruch der Menschheit): the stone age. The island starts hidden in the mist; every trail and camp lifts it tile by tile, and each new land hides a find (a rich hunting ground, a herd, a bright idea, or a sleeping Smilodon). Four resources (meat, hide, flint, bone), four progress tracks with three steps each (Fire raises the hand limit, Tools make building cheaper, Language improves the bank, Art scores points), camps and villages, the Pathfinder award (+2 for the most explored land) and a prowling Smilodon in place of the robber (a 7 moves it and steals a card). Mammoths, bison, berry pickers, flint knappers and cave painters live on the tiles. 10 points wins.
  - *Rise of the Inkas* (Der Aufstieg der Inka): three eras (Chavín, Moche, Inca) on a board of coast, rainforest, highlands and peaks. Goods are fish, feathers, coca and gold; once per turn a player brings a tribute (a whole set of goods, gold stands in for any missing one) to win one of the era's culture tokens (4 + 4 + 3 = 11). When an era's tokens are gone, every village shrinks to a camp, jungle thickets grow over the tiles and the next tribe rises with its own rule (fisheries, terraces). A 7 lets the jungle grow instead of a robber; thickets block their tile until cleared. Six tokens clinch the game, otherwise the most tokens after the last era win. Llamas, fishermen in reed boats, macaws, miners, condors and Nazca lines live on the tiles.
- **5–6 player expansion:** a switch in the lobby, independent of the player count, so even four players can use the larger board; the special building phase runs when more than four play
- **Accounts:** email and password; the first account becomes the admin
- **Stats ("Siedlermeister"):** standings per year, wins over time, records, and the full game history. Online games are recorded automatically, and games played at a real table can be logged by hand.
- **Feedback:** if something breaks, a banner appears with a button to https://feedback.maidev.dk/ and copies the error details for you
- Works in any browser: desktop, tablet or phone. Games survive server restarts.
- **16 languages:** English, Deutsch, Dansk, Svenska, Norsk, Nederlands, Français, Español, Italiano, Português, Polski, Türkçe, Українська, 한국어, 日本語, 中文. Each player picks their own (the game log is translated per player too).
- **Colors and flags:** 10 clearly different player colors, picked in the waiting room before a game starts; everyone chooses their country at sign-up and their flag appears next to their name
- **Animations and sound:** dice with real pips are thrown onto the board and the matching number tokens jump, a little builder in the player's colour steps out of the nearest house of that colour, walks only along edges of the board (that player's roads first, where none is built yet along the free edges where a road could go, never across the land), hammers each new road, settlement, city, wall and metropolis into place (the road draws itself behind him, the house rises out of the ground in a cloud of smoke, then he walks home; full-screen moments such as dice or a new turn wait until the builders are done), bought cards fly to their owner, resources fly to whoever gets them, points pop on the score rings, plus full-screen moments for the robber, barbarian raids, awards and played cards. The speaker button in the top bar mutes sound.
- **Side panel:** chat (shown first), the last move as a card (dice, who got which cards, builds, trades; only the latest turn, so nobody can scroll back through other players' hands) and graphs (points over time, dice rolls against the odds, resources received).
- **Living board (switch next to the zoom buttons):** sheep graze and wander on pastures, a woodcutter fells trees, brick kilns smoke, wheat sways, mine carts roll, tumbleweeds cross the desert and fish jump in the sea. No two tiles of a kind look alike: a black sheep here, lambs on about every third pasture, a rainbow sheep (one sheep in a hundred), another shirt on the woodcutter there, a pumpkin, a haystack, other ore colours, scenes mirrored; every mountain has a miner chipping ore out of a rock and carts full of different materials, every brick hill a mason chipping bricks. On the robber's tile the work stops and the robber guards his loot. The setting is remembered per device.
- **Cities & Knights barbarian attacks** show every player's knight strength, and the Defender of Broch (+1 point), the players who draw a progress card or the ones who lose a city are named and highlighted.
- **Awards on the board:** the roads (and ships) of the Longest Road are trimmed with gold, glow and a light runs along the trail (no counter); the holder of the Largest Army flies crimson war banners over every settlement and city; a metropolis is the wooden gate piece in yellow (two pointed pillars, an opening that fits over the city), always yellow whatever the track; the old boot (Fishermen) leans against its owner's house.
- **How to play, for every mode:** a 1-minute interactive tutorial per mode (Classic, Cities & Knights, Seafarers, Traders & Barbarians, Explorers & Pirates, 5–6 players). A small living board plays the rules out like a video with one short caption at a time; at the glowing spots you tap yourself (or the hand taps for you). Open it with "How to play" or the "?" on a mode tile in the lobby, from the costs button in a game, or from the offer shown in your first game of a mode.
- **Victory:** a flash, fireworks and confetti cannons, a fanfare, the winner's house stamped onto a golden laurel and crowned, the name popping in letter by letter, the points counting up with what earned them, how the race went, the final standings and a few highlights. "Celebrate" in the status bar plays it again.

## Run it on TrueNAS SCALE (24.10 or newer)

### 1. Create two datasets

In **Datasets**, create (adjust `tank` to your pool name):

- `tank/apps/broch/src`: holds the code
- `tank/apps/broch/data`: holds accounts, games and stats

Give the **apps** user (uid 568) read/write access to `tank/apps/broch/data` (Edit permissions → owner `apps`).

### 2. Copy the code to the NAS

Unzip `broch.zip` into `/mnt/tank/apps/broch/src` (for example through an SMB share, or with `scp`), so that the `Dockerfile` sits directly in that folder.

### 3. Build the image

Open **System → Shell** (or SSH in) and run:

```sh
cd /mnt/tank/apps/broch/src
sudo docker build -t broch:latest .
```

### 4. Install it as a custom app

**Apps → Discover Apps → ⋮ → Install via YAML**, name it `broch`, and paste:

```yaml
services:
  broch:
    image: broch:latest
    pull_policy: never
    restart: unless-stopped
    user: "568:568"
    ports:
      - "8080:8080"
    environment:
      REGISTRATION_CODE: ""        # set a code to stop strangers from signing up
      FEEDBACK_URL: "https://feedback.maidev.dk/"
    volumes:
      - /mnt/tank/apps/broch/data:/data
```

Open `http://<your-nas-ip>:8080` and create your account first, so you become the admin. Then send the link to your friends.

If port 8080 is taken, change the left side, for example `"8095:8080"`.

### Updating

Copy the new code over `src`, run the `docker build` command again, then stop and start the app in the Apps screen. Your data stays in the `data` dataset.

### Backups

Everything lives in the `data` dataset as plain JSON files (`users.json`, `history.json`, `games/*.json`). Snapshots of that dataset are your backup.

## Playing outside your home network

Broch serves plain HTTP. To play with friends elsewhere, put it behind a reverse proxy with HTTPS (Nginx Proxy Manager or Traefik from the TrueNAS app catalog), or use Tailscale. WebSockets must be allowed through the proxy (in Nginx Proxy Manager, tick "Websockets Support"). When it's reachable from the internet, set `REGISTRATION_CODE`.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Port inside the container |
| `DATA_DIR` | `/data` | Where data is stored |
| `REGISTRATION_CODE` | empty | If set, new accounts need this code |
| `FEEDBACK_URL` | `https://feedback.maidev.dk/` | Where the "Send feedback" button points |

## Running it without Docker (for development)

```sh
npm install
npm start          # http://localhost:8080, data in ./data
npm test           # plays 60 random games through the rules engine
```

## Translations

Each language lives in `public/js/lang/src/<code>.txt`, one line per text: `N|translation`, where N is the line number of the English text in `public/js/lang/_keys.json`. After editing, rebuild and check:

```sh
node public/js/lang/build-lang.js
```

It reports missing lines and any translation that dropped a placeholder like `{n}` or `{@p}`.

## Try it without a server

`demo/broch-demo.html` is a self-contained copy of the app that runs entirely in the browser: you play one seat, bots play the others, and nothing is saved. Rebuild it after changes with `npm i -D esbuild && node demo/build.js`.

## Rule notes

The base games follow the familiar board game closely. The expansions are compact versions that fit Broch's engine, not line-by-line copies:

- **Seafarers:** ships, new-island bonus, gold fields, fog and the pirate are in; the full printed scenario set is not, only the three generated scenarios.
- **Traders & Barbarians:** Fishermen, Rivers (bridges, gold, richest/poorest) and Event cards are in. Barbarian Attack, Caravans and Traders-and-Barbarians' other scenarios are **not** implemented. Rivers is a simplified take.
- **Explorers & Pirates:** a simplified mission game (explore, load and deliver fish and spice, hit pirate lairs). It is not the full printed rules with settlers, harbour settlements and the mission-card flow.

A few simplifications in Cities & Knights:

- **Commercial Harbor:** you give your most plentiful resource and receive a random commodity from each opponent.
- **Deserter:** the opponent's weakest knight is the one that deserts.
- If you have no free city when you reach level 4, the metropolis stays open: you get it with your next improvement in that track, unless someone else reaches level 4 first.

## Speed

- The server only sends what changed: the board is left out of an update while it stays the same, and the per-turn history is sent as new turns only. WebSocket messages are compressed.
- Static files are served compressed (brotli/gzip) with ETags, so a phone re-downloads nothing that did not change.
- The browser only redraws the board when something on it changed. The whole board is always painted: zooming makes it bigger inside a clipped frame and panning only moves it, so dragging never shows empty sea where tiles should be. While you pinch or scroll-zoom, the painted picture is scaled and sharpened once you let go.
- Endless animations (the living board, waves, pulsing buttons) run on one shared clock, so a redraw after a move continues them seamlessly instead of restarting them.

## Project layout

```
server/engine/   rules: board generation, game state machines (index.js picks the engine, kit.js is shared by the standalone games)
server/index.js  HTTP API, accounts, lobby, WebSocket play, stats
server/store.js  JSON file storage
public/          the web app (no build step); js/sgame.js + js/games/ the standalone games; js/zoom.js zoom & pan, js/feed.js chat, history and graphs,
                 js/tutorial.js the interactive tutorials, js/victory.js the victory scene
test/            random-play rules tester (node test/simulate-games.js [games] [mode] for the standalone games)
```
