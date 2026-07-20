# CLOUD-4 — Support multiple independent deck queues

**Triage:** completed  
**Type:** AFK

## Parent

[Cloud persistence and curated decks PRD](../cloud-persistence-prd.md)

## What to build

Extend cloud deck selection and review scheduling from one curated deck to a user-editable set. A cloud player can add or deselect several published decks in Settings, and the persisted selected set drives one combined review queue. Deselecting hides a deck’s cards without deleting its progress; reselecting restores its schedule.

Keep review identity deck-scoped as `(save_id, deck_id, source_card_id)`. Identical-looking cards from distinct decks are deliberately listed and scheduled twice, so their FSRS histories never collide. Across selected decks, choose learning/due cards first by urgency; use new cards only under the one save-wide allowance; randomly interleave equally eligible cards so a large deck does not monopolize the queue.

## Acceptance criteria

- [x] A cloud player can select and deselect multiple published decks, and the resulting set persists on reopen.
- [x] Deselecting a deck removes it from the current queue without deleting its per-save progress; reselecting restores that progress.
- [x] The combined queue honors due/learning timing before new cards and one shared daily new-card allowance.
- [x] Equally eligible cards are fairly interleaved across decks.
- [x] Same-looking cards in different decks appear as distinct reviews with independent deck-scoped FSRS progress.
- [x] Automated tests cover selected-set persistence, deselection/reselection, queue priority/interleaving, shared allowance, and duplicate-content deck isolation.

## Blocked by

- [CLOUD-2 — Publish and select a first curated deck](cloud-2-publish-select-curated-deck.md)
- [CLOUD-3 — Persist a cloud review turn safely](cloud-3-persist-cloud-review-turn.md)
