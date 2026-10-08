# Broch

An online settlers-style board game for you and your friends, self-hosted on TrueNAS.

- **Base game:** the classic island, 10 points, following the 2025 rulebooks of CATAN – Das Spiel (3–4 players) and its 5–6 player expansion
- **Expansions:** Cities & Knights (13 points, 15 with Seafarers: commodities, city improvements, knights, barbarian raids, all 54 progress cards; the aqueduct at science level 3 asks for your resource once, right when you reach the level, and from then on pays it out by itself whenever a roll (not a 7) gives you nothing; a chip in the science lane changes it. This is the owner's wish: the rulebook has you pick a resource each time), Seafarers (ships, islands, fog, gold, pirate; scenarios Heading for New Shores, The Four Islands, The Fog Islands), Traders & Barbarians (Fishermen of Catan, Rivers of Catan, Event cards; each switchable), Explorers & Pirates (fog map, fish and spice missions, pirate lairs). Cities & Knights can be combined with one of the other three.
- **House rules (switches in the lobby; with a switch off the rulebook applies; "knights without a limit" is on by default, the owner's wish, because the rulebook allows only one development card per turn):**
  - *Forgotten robber:* if a player has to move the robber and ends their turn instead, the robber goes back to the desert
  - *Knights without a limit (classic game):* knight cards can be played as often per turn as you like; every other development card is still limited to one per turn (the rulebook allows one development card per turn, whichever it is)
  - *Starting resources for both:* both buildings from the setup phase pay starting resources (the rulebook pays only the second one); in Cities & Knights the city counts like a settlement (one resource per tile, no commodities)
- **Standalone games** (own rules, own tile row in the lobby, 2–4 players, with the same board animations, a tutorial and all 16 languages; rules rebuilt from research, not copies of the printed ones):
  - *New Energies* (Energiewende): towns and cities, plus power plants. Cities also make science; a fossil plant costs 1 science and makes 2 energy but grows the footprint, a renewable plant costs 3 science, makes 1 energy and adds a green disc to the event bag. Every turn starts by drawing discs from the bag (brown ones bring smog, blackouts, droughts, price spikes; green ones help), hazards block the building or plant they land on until you clear them with 2 energy. 10 points wins, or the cleanest builder when the bag runs dry; if nobody built more renewable than fossil plants, everybody loses together.
  - *Dawn of Humankind* (Aufbruch der Menschheit, 3–4 players): follows the official rulebook. The world map (49 landscape fields in Africa, Europe, Asia, Australia and North/South America, glacier and sea around it) is built from the pictures of the book, with the printed start for 3 and 4 players and the variable "free founding" as a lobby switch. Each player starts with 3 camps and 1 explorer in Africa. Camps (not explorers) harvest: forest fur, wasteland bone, grassland meat, mountains flint. Explorers walk along paths (1 fur or meat for 1–3 crossings, +1 per level of *Food*; the African border blocks the strait), place for 1 fur + 1 meat (max. 2 on the board), and turn into camps on a camp site with a tile (1 fur + 1 bone + 1 flint, +1 point per tile; with 6 camps out one from Africa is taken back). Discovery fields need levels of *Clothing* and *Construction*; the first explorer to cross one takes its tile: hunting luck (the region's hunting marker, +1), desertification (a number chip of a landscape is removed in Africa) or a threat. A 7 gives no yield: hands over 7 cards are halved, then the roller moves the Neanderthal (Europe/Asia) or the Saber-toothed tiger (America/Australia) and steals a card; threats block the yield of their field. Four progress tracks (levels cost flint / bone / bone + flint / meat + bone + flint; first to level 4 takes the track marker, *Hunting* moves a threat), Most Successful Hunter (+1), Fastest Collector (+2) and Collector (+1). Trading with the supply is 3:1, with players only on the turn player's turn. Camps on the board are worth nothing; the first to 10 points wins at once. Deliberate guesses are listed under "Rule notes".
  - *Rise of the Inkas* (Der Aufstieg der Inka): three eras (Chavín, Moche, Inca) on a board of coast, rainforest, highlands and peaks. Goods are fish, feathers, coca and gold; once per turn a player brings a tribute (a whole set of goods, gold stands in for any missing one) to win one of the era's culture tokens (4 + 4 + 3 = 11). When an era's tokens are gone, every village shrinks to a camp, jungle thickets grow over the tiles and the next tribe rises with its own rule (fisheries, terraces). A 7 lets the jungle grow instead of a robber; thickets block their tile until cleared. Six tokens clinch the game, otherwise the most tokens after the last era win. Llamas, fishermen in reed boats, macaws, miners, condors and Nazca lines live on the tiles.
- **5–6 player expansion:** a switch in the lobby: the larger board (30 tiles, 28 number tokens, 11 harbors, 24 cards per resource, 34 development cards) can also be used by fewer players, and is always used from 5 players on. Five or six players share every turn as in the 5–6 rulebook: the player with stone 1 rolls, trades with everybody, builds and plays a development card; then the player three seats to the left (stone 2) takes an adapted turn without dice (bank trades only, building, 1 development card); then both stones move one seat to the left. If both reach the target in the same turn, stone 1 wins. (The old special building phase is no longer used for new games.)
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

The base games follow the printed rulebooks closely (CATAN – Das Spiel 2025, 5–6 player expansion). Where Broch differs on purpose or by necessity:

- **Classic game and 5–6 players:** the tiles and number tokens are laid out at random (no red 6/8 and no equal numbers next to each other) instead of the printed alphabetical spiral, and the harbors sit at evenly spread coast positions instead of on fixed frame pieces; the first player is drawn instead of rolled for; the fixed beginner set-up of the book ("Aufbau für das erste Spiel") is not offered, everybody places their settlements and roads in the setup phase; victory point cards are counted automatically instead of being revealed (they win the game the moment you reach the target on your own turn); the bank-shortage rule of the almanac applies (if the bank cannot pay a resource to several players, nobody gets it; a single player gets what is left); two players can also play (the books are for 3–6).

The expansions are compact versions that fit Broch's engine, not line-by-line copies:

- **Seafarers:** ships, new-island bonus, gold fields, fog and the pirate are in; the full printed scenario set is not, only the three generated scenarios.
- **Traders & Barbarians:** Fishermen, Rivers (bridges, gold, richest/poorest) and Event cards are in. Barbarian Attack, Caravans and Traders-and-Barbarians' other scenarios are **not** implemented. Rivers is a simplified take.
- **Explorers & Pirates:** a simplified mission game (explore, load and deliver fish and spice, hit pirate lairs). It is not the full printed rules with settlers, harbour settlements and the mission-card flow.

Dawn of Humankind (follows the book; what the book leaves open or the pictures do not show exactly):

- **Map:** the 49 fields, their landscapes and number chips, the camp sites (21 tiles for the 3-player side, 33 for the 4-player side), the start places, the printed start and the African border were read from the board pictures of the book. The extra crossings on the glacier and in the sea (stepping stones to Australia, the Bering land bridge) and the exact conditions printed next to the 18 discovery fields (Clothing/Construction levels) were read from small pictures and may be off by a level in places.
- **Discovery tiles:** per region the book lists the backs (Europe: hunting luck, 2 desertifications, threat; Asia, Australia: same with other landscapes; North America: hunting luck, 2 desertifications; South America: hunting luck, desertification, threat). The server shuffles them onto the fields. Desertification asks for a chip of the shown landscape in Africa (it is taken automatically when only one is left). The threat tile shows both pieces, so the player picks one. Hunting luck gives the region's hunting marker; later hunting tiles of that region give nothing.
- **Walking:** the book lets you walk any way within reach; the digital version only asks for the destination and takes the way within reach that crosses the most discovery fields (conditions of Clothing/Construction apply for crossing every discovery field, also after its tile is gone). Both explorers may move each turn for 1 fur or meat each.
- **Start:** the first player is drawn at random instead of rolling the dice. Free founding (lobby switch) follows page 10 (camps 1, 2 reversed, 3, then the explorers in reverse order); the pieces of the printed set-up are used for 3 players with 3 of the 4 colours.
- **Supply:** 20 cards of each resource (80 in all). If the supply cannot pay everyone for one resource, nobody gets it (the book is silent here; this is the usual CATAN rule).
- **Hunting track:** the threat move on a level-up is optional (the book says "darf"). Awards: Collector markers are 3 for 4 players and 2 for 3 players, like the book's component list.

Cities & Knights follows the printed rules (Städte & Ritter, 2025 edition), with these small differences:

- The barbarian track is shown as a bar of 7 steps; the frame piece with the track replaces one 3:1 harbor, so the board has 8 harbors (10 on the 5–6 player board).
- Commodity cards and the Defender of Broch chips are not limited to the printed 12 per kind (18 with 5–6) and 6 chips (8 with 5–6); the robber starts on the desert instead of the stone peninsula, which changes nothing because it may not move before the first attack.
- A settlement cannot be built on a corner that holds one of your own knights: move the knight away first.
- Seafarers: knights follow roads and ships, but a ship line is not pinned by a knight standing at its end, the Diplomat only removes roads, and the optional "choose how many knights to commit" variant is not included.
- A level 4 improvement that would bring a metropolis needs a city that has none yet: with a single city that already carries a metropolis you stop at level 3 in the other tracks (as in the book).

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
