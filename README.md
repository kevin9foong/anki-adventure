# Anki Adventure

Anki Adventure is a small, browser-based Japanese-vocabulary game with the feel of a handheld monster RPG. Explore a stylized Tokushima map, meet original monsters, and turn each self-graded Anki review into a battle action.

It is designed for local-first study: cards, scheduling state, monsters, and saves stay in the browser's IndexedDB. It runs on desktop browsers and is laid out for iPhone Safari in portrait orientation.

## Play the game

Move with arrow keys/WASD or the on-screen D-pad. Press the red **A / Check** button to interact with nearby locations and trainers, or to begin a battle on the route.

In battle:

1. Read the Japanese prompt and recall its English meaning.
2. Choose **Show answer**.
3. Self-grade your recall: Again, Hard, Good, or Easy.
4. The card is scheduled with FSRS and your monster attacks.

Wild encounters can be caught. Choosing **Catch instead** makes the next graded review a catch attempt rather than an attack.

## Game mechanics

### Reviews and scheduling

- The queue follows Anki's default ordering: due learning/relearning first, then reviews due in the current study day, then new cards.
- The blue/red/green counters follow Anki's queue semantics: remaining new allowance; learning/relearning due in the 20-minute learn-ahead window; and reviews due before the next 04:00 local study-day cutoff.
- New cards use a configurable permanent daily limit (10 by default). “Increase today's limit by 5” is a separate Custom Study override and resets at the next study-day rollover. Set the permanent limit to `0` to study reviews only.
- Grades are written locally using FSRS-6 with Anki's stock 90% retention, 1m/10m learning, and 10m relearning steps. Stability, difficulty, repetitions, lapses, learning step, review timestamp, due date, and interval are retained with each card.
- The player’s trainer level is based on mature cards: `1 + floor(mature cards / 20)`, capped at level 100. A mature card is currently in review with an interval of at least 21 days.

### Battles

Every attack turn is one review. Grade multipliers are:

| Grade | Damage multiplier | Next enemy attack |
| --- | ---: | --- |
| Again | 0.3× | Normal damage |
| Hard | 0.5× | Normal damage |
| Good | 1.0× | 0.7× damage |
| Easy | 1.5× | No damage |

Monster combat stats scale with level:

```text
max HP     = species base HP + 10 × level
base power = species base power + 2 × level
player damage = round(base power × grade multiplier)
enemy damage  = max(1, round(enemy base power × 0.75 × grade defense))
```

Grade defense is 1.0× for Again and Hard, 0.7× for Good, and 0 for Easy. The minimum-damage rule does not apply to Easy's guard.

Enemy levels are selected at battle start from the lowest living party level through the highest living party level plus five. Route trainers use the same review-driven battle loop; the Mt. Bizan gym unlocks at trainer level 8 and sends a three-monster challenge.

### Catching, party, and storage

- Catching is available in wild battles and replaces an attack review.
- Catch chances by grade are 5%, 15%, 35%, and 55% (Again through Easy), reduced when the wild monster has more HP.
- A party holds up to six monsters. Further catches go to a 100-monster box.
- Open the ☰ pack menu to deposit or withdraw monsters. The final party monster cannot be deposited.
- Winning grants XP to the active monster using the Medium Fast `level³` growth curve. HP persists between battles; interact with the Health House to restore the party.

## World and monsters

The playable **Awa Gate** map is an intentionally stylized, non-geographic Awaji–Tokushima region. It includes:

- **Health House** — restores the party.
- **Grass route** — wild encounters and two route trainers, Rin and Kai.
- **Mt. Bizan** — mountain landmark and gym.
- **Naruto Sea** — water-route edge, inspired by the Naruto whirlpools.

All game art is original runtime pixel-style art. The roster is deliberately small for the first area:

| Monster | Role | Base HP / Power |
| --- | --- | ---: |
| Tanukiwi | Tanuki-inspired starter; balanced | 29 / 9 |
| Uzumi | Naruto-water wild monster | 24 / 12 |
| Mosslug | Mt. Bizan wild monster; durable | 38 / 6 |
| Awaflash | Tokushima-route wild monster; fast hitter | 19 / 15 |

See [map research](docs/map-research.md) for the public location references used to shape the setting.

## Importing a deck and backups

Open the **☰ pack** menu and select a `.csv` or Anki `.apkg` file.

- CSV expects `front,back,reading` columns; a header row is optional.
- APKG files are parsed entirely in the browser. Recognized Anki field names include word/front, meaning/back, reading, furigana, example sentence, and sentence meaning; package media is stored separately in IndexedDB so it is not part of the initial game download.
- Importing cards currently adds/replaces records with matching IDs; use a fresh browser profile for a completely clean game.
- Use **Export backup** to download a JSON copy of the cards and player save. **Restore backup** imports it on the same device.

Browser storage can be cleared by the user or browser. Keep periodic backups, especially on iOS.

## Technical choices

| Area | Choice | Why |
| --- | --- | --- |
| Rendering | Phaser 3.90 + Canvas | Mature, compact 2D engine with a pixel-art friendly render path. |
| Language/build | TypeScript + Vite | Static deployment, fast development, and a small production bundle. |
| Scheduling | `ts-fsrs` | Local FSRS grade updates with no server round-trip. |
| Persistence | Dexie / IndexedDB | Better suited than localStorage for saves, cards, and imported media. |
| Deck import | JSZip + sql.js | Parses Anki package ZIPs and SQLite collections in the browser. |
| Offline | Web manifest + service worker | Installable/static-app behavior after first visit. |
| Tests | Vitest + fake IndexedDB | Covers battle maths, queue selection, FSRS updates, party storage, and CSV import. |

The Anki import implementation is lazy-loaded, so JSZip, SQLite parsing, and the SQLite WebAssembly file are not needed for the initial playable map. The production application JavaScript is roughly 377 KB gzipped; the import-only SQLite WebAssembly payload is roughly 323 KB gzipped.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173`. To test on an iPhone on the same network, open the displayed LAN URL and use Safari’s **Share → Add to Home Screen**.

Other commands:

```bash
npm test       # run the test suite
npm run build  # type-check and create ./dist
npm run preview # serve the production build
```

Deploy the `dist/` folder to any static host such as Cloudflare Pages, Vercel, or Netlify. No backend, database, or environment variables are required.
