# CLOUD-3 — Persist a cloud review turn safely

**Triage:** completed  
**Type:** AFK

## Parent

[Cloud persistence and curated decks PRD](../cloud-persistence-prd.md)

## What to build

Make a selected curated deck playable through the existing battle loop with authoritative cloud persistence. A cloud player receives an eligible deck-card, grades it, and has its deck-scoped FSRS state plus any affected party/game state persisted through small purpose-built APIs—not a client-posted complete save snapshot.

Use the existing scheduling and combat domain as the authority. Store progress by save, deck, and source-card identity. A missing record means new; the first introduced/graded card creates its record. The combined cloud session uses one save-wide daily new-card allowance. Each mutation supplies the current integer save revision and atomically increments it alongside related updates. A revision mismatch must preserve remote state and show reload-required feedback; do not automatically retry a grade.

Cloud gameplay remains online-only. Continue persisting meaningful game changes such as grades, party outcomes, healing, storage changes, and daily-limit changes, but never movement/render state. Related writes must be transactional and validate that the card belongs to a selected deck for that save.

## Acceptance criteria

- [x] A selected deck supplies due/learning cards before allowed new cards, and the first cloud grade persists the appropriate FSRS progress.
- [x] Reloading the cloud URL shows the persisted scheduling state and player state, including meaningful battle/party/settings mutations.
- [x] Grade and player-state APIs are narrow, authorized, validated, and transactional; they do not accept arbitrary full deck/save uploads.
- [x] Every mutation uses save revision optimistic concurrency; a stale client receives a conflict and the UI requires an explicit reload without replaying the grade.
- [x] Cloud mode stays connection-dependent and reports request failures safely rather than falling back to or modifying local data.
- [x] Automated tests cover scheduling persistence, state mutation, authorization, revision conflicts, and reload-required behavior.

## Blocked by

- [CLOUD-1 — Create and open an admin-issued cloud save](cloud-1-create-open-cloud-save.md)
- [CLOUD-2 — Publish and select a first curated deck](cloud-2-publish-select-curated-deck.md)
