# Implementation decisions

## 2026-07-20 — Local cloud development uses Pages Functions and local D1 together

- **Decision:** `npm run dev:cloud` first applies the committed migrations to Wrangler's local D1 state, then builds `dist` and serves it through `wrangler pages dev`; `.dev.vars` supplies the local-only `ADMIN_KEY`.
- **Rationale:** This exercises the actual Pages routing, D1 binding, and admin authorization boundary rather than Vite's static-only server.
- **Trade-off:** The command performs a production-style browser build before starting, rather than offering Vite hot-module replacement for cloud mode.

## 2026-07-20 — Catalogue metadata is separate from selected deck content

- **Decision:** A bearer-authenticated deck request returns the published deck IDs, names, and card counts for selection, while returning card text only for that save's selected decks.
- **Rationale:** A new save needs an authorized catalogue to choose its first deck, but a bearer link must not become a broad content-download endpoint.
- **Trade-off:** The client makes one response handle both catalogue and selected-content views; future pagination can split those concerns if the catalogue grows.

## 2026-07-20 — Lifecycle service receives only atomic persistence operations

- **Decision:** Keep deck publish/delete and save delete policy in a portable service that asks its repository port to perform each fan-out write atomically.
- **Rationale:** The same service can calculate the visible impact before confirmation while the D1 adapter owns SQL transaction details and token hashing.
- **Trade-off:** The adapter must implement a small set of lifecycle operations instead of exposing generic table access.

## 2026-07-20 — Equal-urgency cloud queue ties select a deck before a card

- **Decision:** When selected cloud cards have the same eligible due time (or are all eligible new cards), choose uniformly among their decks and then among that deck's tied cards.
- **Rationale:** This preserves urgency ordering while preventing a large selected deck from dominating equal-time ties solely through card count.
- **Trade-off:** The queue is deck-fair, rather than perfectly uniform over every tied card.

## 2026-07-19 — Defeated party recovery returns directly to the Health House

- **Decision:** When the last living party monster faints, restore the whole party, close the battle, and move the overworld character to the Health House.
- **Rationale:** The current map has one Health House and no persisted multi-hub checkpoint, so it is the concrete implementation of the product brief's latest health-center checkpoint.
- **Trade-off:** A future multi-hub world will need a saved checkpoint position instead of the fixed Health House spawn.

## 2026-07-19 — New-card progress follows the daily allowance

- **Decision:** The Pack reports new cards first answered in the current Anki study day against the effective daily new-card allowance.
- **Rationale:** It directly explains the blue remaining-new counter; review and learning repeats must not consume this allowance.
- **Trade-off:** It is not a count of every card answered today; a separate review-activity statistic would be needed for that.

## 2026-07-19 — Grade defense applies to the immediate enemy response

- **Decision:** Easy negates, and Good reduces to 0.7×, the automatic enemy attack following that review grade.
- **Rationale:** The battle loop resolves the player's grade-based attack before the enemy's response, so this makes the requested “next turn” effect observable without persisting a separate status across cards or battles.
- **Trade-off:** The protection does not carry to a later turn when the enemy is defeated or a catch succeeds, because no enemy attack occurs in those outcomes.

## 2026-07-19 — APKG fields are resolved by Anki model name

- **Decision:** Resolve common word, meaning, reading, furigana, and example-sentence fields from the note model's field names; fall back to the original first-three-field convention when model metadata is unavailable.
- **Rationale:** Kaishi places its translation and examples after reading, while other decks commonly use Front/Back fields. Named resolution preserves both formats and makes sentence support reusable.
- **Trade-off:** Decks with unconventional field names still need aliases added to the importer or will use the positional fallback.

## 2026-07-19 — Catch and fight can be changed before a grade

- **Decision:** In a wild battle, the revealed card stays visible while the player switches between Catch and Fight; the selected grade only resolves the currently selected mode.
- **Rationale:** Changing intent before grading should not hide, consume, or reschedule the review card, and it lets a failed capture plan be reconsidered without restarting the turn.
- **Trade-off:** The mode button is deliberately unavailable before the answer is revealed, when there is no gradeable review to redirect.
- **Verification gap:** This repository has neither a design source/Storybook nor `agent-browser`, so visual verification was limited to the interaction test and production build.

## 2026-07-20 — Cloud mutations use the save revision as their write gate

- **Decision:** Every cloud player mutation updates `cloud_saves.revision` only when it equals the request's `expectedRevision`; a failed update returns `409` with `reloadRequired` instead of retrying.
- **Rationale:** The bearer link can be open on multiple devices, and a reload is safer than replaying a grade or overwriting remotely changed party state.
- **Trade-off:** A player must reload after a concurrent change; cloud mode intentionally does not keep an offline outbox or merge edits automatically.

## 2026-07-20 — Admin normalizes deck files before publishing

- **Decision:** The admin browser parses CSV and APKG sources into recognized text cards before sending them to the admin API; APKG media is discarded.
- **Rationale:** The server API persists only normalized text-card fields, and keeping APKG parsing in the browser avoids sending opaque archives or media into D1.
- **Trade-off:** The APKG parser adds a lazy-loaded SQL/WebAssembly chunk to the admin route only; it is not part of normal gameplay startup.

## 2026-07-20 — APKG fields are matched by semantic aliases across scripts

- **Decision:** Both local and curated APKG imports use one Unicode-preserving resolver for semantic fields, with localized aliases and numbered example-sentence fields.
- **Rationale:** Note-type field labels are user-facing and commonly localized; matching semantic concepts such as pattern, meaning, and example rather than a source deck's schema preserves Kaishi support while importing grammar decks.
- **Trade-off:** An unfamiliar semantic label still requires a deliberate alias addition; guessing from field order remains limited to collections without model metadata.
