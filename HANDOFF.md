# Handoff: Anki Adventure (browser Pokémon-style Anki game)

## Product intent

Build a **Game boy advance Pokémon–like learning game** for **Anki-style spaced repetition**, specifically for Japanese vocabulary, playable in a **web browser (safari) on iPhone**. Working title/repo: `anki-adventure` at `/Users/kevin9foong/apps/anki-adventure` (**empty greenfield repo** as of this handoff).

Fantasy ↔ learning mapping:

- Overworld explore → towns/routes
- Wild encounters → battle vs a **monster** (small roster of varying sprites)
- Each attack turn → show a **due Anki card** (JP vocab); player answers + grades
- Grade → **damage multiplier** on that attack (FSRS still updates from the same grade)
- Gyms / landmarks → **gym trainers** (scripted leaders) + tougher checks / deck-or-tag gates
- Routes / towns → **random overworld trainers** (like Pokémon route trainers) in addition to wild monsters
- Catch wild monsters → also an **Anki review** (grade affects catch success)
- Monster storage → hub “PC” / storage building (party vs boxed monsters)

### Battle system (locked direction)

- Fight a monster with HP; the card review **resolves your attack**, it is not the enemy itself.
- Formula: `damage = round(basePower × gradeMultiplier)`
- Grade multipliers:

| Grade | Multiplier | Next enemy attack | Feel |
|--------|------------|-------------------|------|
| Again | 0.3x | Normal damage | Weak hit |
| Hard | 0.5× | 0.7× damage | Glancing blow |
| Good | 1.0× | No damage | Normal hit |
| Easy | 1.5× | No damage | Strong / crit-ish |

- **Wild monsters:** a few distinct types with different sprites for MVP (suggesting 3 per location, inspired by what the location might be known/unique for, for example near Naruto whirlpools, there might be whirlpool monsters). Same battle rules; different HP/basePower/art.
- **Enemy scaling (MVP, locked):** encounter level is fixed at battle start. It is selected from the lowest non-fainted party level through the highest non-fainted party level + 5, excluding fainted monsters. Wilds are uniform; route trainers weight higher levels linearly; gym trainers weight them quadratically; gym leaders use the maximum.
- **Route trainers:** NPCs placed on routes and around landmarks (Pokémon-style). Talking starts a battle. Mid difficulty between wilds and gym leaders. Able to rematch. Same grade→damage rules.
- **Gym trainers / leaders:** human NPCs in gyms / landmark “gyms.” Scripted progression gates — e.g. Mt. Bizan gym leader, Naruto gym, Nijigen exhibition. Higher HP/level or multi-monster parties; denser due-card pressure or tougher enemy stats.
- **Catching (locked):** available from the start of **wild** battles (not trainers), and replaces the normal attack review. Grade and current wild HP determine success; failed catches let the wild attack, and wilds do not flee in MVP. Caught monsters go to the party if there is space, otherwise to storage.
- **Storage (locked):** a building in hubs (Pokémon Center–style PC) to **deposit / withdraw** monsters. The party has up to 6 slots; boxed monsters are kept in IndexedDB save data.
- **Levelling (locked):**
  - **Party monster:** wins grant XP; level raises battle **HP / basePower** (combat strength).
  - **Player character (trainer):** level is derived from the **current number of Anki-mature cards** — not battle XP or permanent milestones. Higher character level gates **world progress** (routes, gyms). Raw attack power stays on the party monster.
  - Three parallel tracks: monster combat XP, character level = mature-card count (`min(100, 1 + floor(matureCardCount / 20))`), and FSRS scheduling per card.
- MVP: **one** starter party monster + catch + hub storage; the starter is level 1.

## Detailed mechanics decisions

These decisions were resolved during the mechanics review and should guide implementation.

### Battle loop

1. Select exactly one review card.
2. Show the Japanese word; the player recalls the meaning mentally.
3. The player taps `Show Answer`.
4. Show English meaning, reading, and available media.
5. The player self-grades `Again`, `Hard`, `Good`, or `Easy`.
6. FSRS updates immediately.
7. The player monster attacks.
8. If the enemy survives, it attacks automatically.
9. Start the next turn with another card.

MVP reviews are Japanese → English only. No typed answers or automatic answer checking.

### Card queue

- Choose overdue cards first; choose randomly among cards with equal urgency.
- Use new cards only when no due cards remain.
- The daily new-card limit is customizable in Settings; recommended default is 10, with 0 allowed.
- When the queue is empty, free-practice battles cannot start.
- The player can explicitly increase today’s new-card limit. Each expansion adds 5 cards, can be repeated, requires confirmation, and resets the next calendar day.
- Immediate new-card availability after expansion remains to be confirmed if needed.

### Party, health, and switching

- The player can carry up to 6 monsters; a monster at 0 HP cannot be active.
- HP persists between battles. A health center at the latest hub/safe checkpoint restores the party.
- If all carried monsters reach 0 HP, the player returns automatically to that health center.
- Battles cannot start without at least one non-fainted monster.
- Voluntary switching is allowed between review turns, costs the player’s turn, requires no card review, and causes one enemy attack.
- If the active monster faints while others remain, the player must replace it; replacement costs the next turn and the enemy attacks once.
- In multi-monster trainer battles, the next enemy enters immediately after one is defeated. The player may switch before the next review for free because the defeated enemy cannot attack.

### Catching

- Catching is available from the start of every wild battle; there is no HP threshold.
- `Catch` replaces the normal attack review. Base chances: Again 5%, Hard 15%, Good 35%, Easy 55%.
- HP multipliers: 100% HP ×0.25; 75% ×0.5; 50% ×0.75; 25% or less ×1.0.
- Formula: `success chance = grade chance × HP modifier`.
- A failed catch lets the wild monster attack; the player can retry or attack. Wild monsters do not flee in MVP.
- A successful catch ends the battle and awards no XP.
- If party space exists, the caught monster goes to the party; otherwise it goes to storage.
- Storage has a recommended 100-monster box limit. If party and storage are full, Catch is unavailable until space is created.

### XP and monster levels

- XP is awarded when an enemy reaches 0 HP, not when it is captured.
- Only the active monster that deals the defeating attack receives XP.
- Use the Pokémon FireRed Medium Fast growth curve: total XP at level `n` is `n³`, levels 1–100; excess XP carries over.
- Recommended XP reward: `floor((enemy base XP × enemy level) / 7)`; trainer and gym enemy XP is 1.5× normal.
- Level-up increases combat stats; a fainted monster remains fainted.

### Combat stats and damage

- Every species has base HP and base power.
- `maxHP = speciesBaseHP + (10 × level)` and `basePower = speciesBasePower + (2 × level)`.
- The same formulas apply to player and enemy monsters. Level-up increases current HP by the max-HP increase, except a fainted monster remains at 0 HP.
- Player damage is `round(player basePower × grade multiplier)`; there is no separate level factor.
- Grade multipliers: Again 0.3×, Hard 0.5×, Good 1.0×, Easy 1.5×.
- Enemy damage is `round(enemy basePower × 0.75 × gradeDefense)`, minimum 1 unless the battle is already over or the player chose Good or Easy. Grade defense is 1.0× for Again, 0.7× for Hard, and 0 for Good/Easy.

### Encounter level scaling

Encounter level is fixed when battle begins and does not change after switching.

- Range: lowest non-fainted party level through highest non-fainted party level + 5; fainted monsters are excluded.
- Wild monsters use a uniform distribution across the range.
- Route trainers use ascending linear weights toward higher levels.
- Gym trainers use ascending quadratic weights toward higher levels.
- Gym leaders use the maximum level: highest party level + 5.

Exact handling of one-monster parties, range clamping, and whether every gym encounter uses the same `+5` upper bound remain to be verified.

### Character progression

- Character level is separate from monster level and FSRS, based on the current number of Anki-mature cards.
- A card is mature when it is currently in review and its current interval is at least 21 days; lapsing removes maturity until it reaches the threshold again.
- Character level is `min(100, 1 + floor(matureCardCount / 20))`.
- Character level gates world progression but never directly increases monster combat power. No deck tags gate progression.
- Routes use story order plus character-level gates: Tokushima hub immediately; Mt. Bizan level 2; Naruto route level 4; Nijigen no Mori/Awaji level 6; first gym level 8.

### Trainers, gyms, and roster

- Route trainers are rematchable without a limit; each rematch grants normal XP/rewards. The first route should have 2 route trainers.
- MVP gym structure: 3 gym trainers with 2 enemy monsters each, then 1 leader with 3 enemy monsters.
- There are no extra cards per turn; gym difficulty comes from level distribution, multiple monsters, and persistent HP.
- Starter: an original Japan-inspired tanuki-like monster, balanced and distinct from catchable species, at level 1.
- The first playable area should have 3 catchable species: balanced, high-HP/low-power, and low-HP/high-power, plus the starter.

## Stack decisions (agreed direction)

| Layer | Choice | Notes |
|--------|--------|--------|
| Engine | **Phaser** (3 battle-tested; 4 OK if accepting younger ecosystem) | MIT, open source, **no royalties** on games |
| Language | **TypeScript** | |
| Bundler | **Vite** | Static deploy |
| Maps | **Tiled** → Phaser tilemaps | |
| Art | Pixel (32×32, generated by AI) | |
| Local save | **IndexedDB** (e.g. Dexie) | Not `localStorage` for full saves |
| SRS | **FSRS in-game** (or SM-2) | Phone-first; don’t require live Anki desktop |
| Ship as | **PWA** | Add to Home Screen on iPhone |
| Deploy (1 user) | **Static** — Cloudflare Pages / Vercel | No backend for MVP |

## Must support saves & deploy (1-user scope)

- **Single user → IndexedDB only**; skip Supabase/Firebase until multi-device needed.
- IndexedDB has **no fixed TTL**; persists until cleared/evicted. More durable as **Home Screen PWA**; fragile as a casual Safari tab. Recommend **Export/Import JSON** backup.
- Cloud sync only if later need phone ↔ laptop continuity.

### Static hosting ≠ huge first load

No backend does **not** mean download the whole game upfront. Assets are CDN files; load on demand.

| Thing | Typical size | Notes |
|--------|----------------|--------|
| Phaser + game JS | ~0.5–2 MB gzipped | Manageable |
| Pixel tilemaps + sprites | Small if disciplined | 32×32 sheets; load by area |
| Music / SFX | Often the bulk | Compress; don’t preload everything |
| Full Japan art dump | Huge | Don’t ship later regions until needed |
| Card text (CSV/JSON) | Still modest at ~2k | Text is small; **card images** dominate if present |
| Saves in IndexedDB | Local only | Schedule state for ~2k cards is fine |

Strategies:

1. **Load by area** — boot hub only; fetch Awaji/Naruto assets when approaching
2. **Code-split scenes** — Vite dynamic `import()` for Battle/Overworld
3. **PWA cache** — first visit downloads; later visits from Cache Storage
4. **Audio on demand** — after first tap / when entering area
5. **One region at a time** — don’t bundle all of Japan in `public/assets`
6. **Card media on demand** — the Anki `.apkg` import is about 150 MB, so don’t include it in the initial game bundle or preload all media; import it separately and fetch/cache media per card when shown in battle

Targets: **~3–5 MB** to playable hub; **+1–3 MB** packs per later area. Deck **text** is cheap; budget separately for **card image** packs (lazy). Size is an asset/partitioning problem, not a “need a backend” problem.

## Anki / FSRS requirements (locked)

- Must support **FSRS locally** for on the order of **~2,000 cards** (reference: **Kaishi 1.5k**-class JP vocab decks; design headroom to ~2k).
- Full schedule state (due dates, stability, etc.) in **IndexedDB**; one grade update per battle/catch turn must stay smooth on iPhone Safari.
- Cards may include **images** (and later audio): store media as separate files or blobs; **lazy-load** when the card is shown — never require downloading all card images before first play.
- **New-card drip** (daily new-card cap) so 2k cards aren’t introduced at once; encounters prefer due reviews, then allowed news.
- **MVP import:** Anki-compatible `.apkg` file, approximately 150 MB for the target deck.
- Import the package into the local IndexedDB card/schedule store; keep card media lazy-loaded rather than requiring the entire package in the playable first load.
- **Later:** optional sync backend.
- **AnkiConnect:** awkward on iPhone; not primary.

## World / map direction

- Style: old-school GBA Pokémon (top-down, routes, towns, set-piece dungeons).
- Setting: **Japan landmarks**, starting regional focus **Awaji + Tokushima / eastern Shikoku**, not all of Japan.
- Example landmarks to encode as game nodes:
  - **Nijigen no Mori** → theme-park / safari-like area.
  - **Naruto whirlpools** → water route
  - **Mt. Bizan** → mountain + ropeway unlock / lookout
  - Bridge / Tokushima hub / Awa Odori–style hub as progression graph
- Design rule: **stylized node graph**, not real geography; **1 landmark = 1 map + 1 mechanic + 1 story beat**.
- Suggested build order: Tokushima hub → Mt. Bizan → Naruto route → Awaji / Nijigen → expand Shikoku later.

## iPhone constraints to bake in early

- On-screen D-pad + A/B
- Portrait + letterboxed GBA-ish canvas
- Touch `preventDefault` (no scroll/zoom while playing)
- Safari audio unlock on first tap
- Modest canvas resolution; scale with CSS

## Suggested project shape (not scaffolded yet)

```
src/game/     # Phaser scenes: Boot, Overworld, Battle, Menu
src/srs/      # FSRS + due-card picker
src/data/     # decks, dialogue, region atlas
src/ui/       # HTML/CSS touch controls
src/storage/  # IndexedDB save + scheduling
public/assets/
```

## Not done yet

- No code, deps, or scaffold in the repo
- No region atlas JSON, Tiled maps, or card schema
- No final Phaser 3 vs 4 pin
- No art pipeline locked
- Mechanics review still has unresolved MVP details listed below.

## Sensible next agent tasks

1. Continue resolving the deferred mechanics below, then scaffold **Vite + TypeScript + Phaser + PWA** with touch controls and one stub overworld + battle scene.
2. Add IndexedDB save + FSRS for ~2k cards (Kaishi-scale, optional images lazy-loaded); wire grade → damage + catch; party/storage; character level from mature-card count.
3. Draft **Awaji–Tokushima region atlas** (locations, connections, landmark → mechanic).
4. First Tiled map: Tokushima hub + one route.
5. Keep first-load budget in mind: hub assets only; lazy-load other areas.

## Unresolved mechanics and implementation choices

Continue the mechanics review in dependency order. Do not start implementation of affected systems until these are resolved or explicitly deferred as MVP decisions.

- Confirm first-area catchable roster, names, types, and base stats.
- Choose exact FSRS implementation/version and card schema; define answer/media behavior, same-card repeats, review intervals, and what happens when a battle needs a card but no eligible card remains.
- Define exact rounding/clamping for damage, catch probabilities, enemy levels, and HP thresholds.
- Define encounter minimum/maximum clamps and the exact weighted-random implementation for wild, trainer, and gym encounters.
- Define battle rewards beyond XP: money/items, capture placement UI, duplicate species, nicknames, release behavior, and storage/deposit/withdraw UI.
- Define party ordering, active monster at battle start, switching during catch flow, and whether monsters can be healed outside health centers.
- Define gym locations, story unlock events, trainer rosters, leader identities, win/loss state, badge benefits, and gym rematches.
- Define route/town map content, the first vertical slice, and whether real landmark names are used.
- Pin Phaser 3 or 4; define `.apkg` parsing/media extraction, PWA/offline behavior, export/import backup format, and save schema/versioning.

The next session should resume the one-question-at-a-time mechanics review using the `grill-me` skill.

## Open choices for the user

- Phaser **3 vs 4**
- First-area catchable species names, types, and base stats
- Exact FSRS implementation/version, card schema, intervals, and empty-queue behavior
- Exact rounding/clamping and weighted encounter implementation
- Storage UI, duplicate species, nicknames, release behavior, and rewards beyond XP
- Party ordering, active monster at battle start, catch-flow switching, and healing outside health centers
- Gym locations, story unlocks, rosters, leaders, badges, win/loss state, and rematches
- Route/town content, first vertical slice, and real versus stylized landmark names
- `.apkg` parsing/media extraction strategy, including how the approximately 150 MB import is handled on iPhone Safari
- PWA/offline behavior, export/import backup format, and save schema/versioning
