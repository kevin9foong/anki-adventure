# CLOUD-5 — Update and remove curated decks safely

**Triage:** completed  
**Type:** AFK

## Parent

[Cloud persistence and curated decks PRD](../cloud-persistence-prd.md)

## What to build

Complete the admin deck lifecycle with safe, visible effects on active cloud queues. An authorized admin updates a deck by immutable `deck_id`, may rename its display name, previews the membership diff, and confirms publication. Compare memberships by deck ID and stable source-card ID.

For a retained source-card ID, retain every affected save’s FSRS progress and update the visible text in place. A new source-card ID is implicitly new for selected saves. A removed membership permanently deletes its progress from every affected cloud save and removes it from queues. The preview must report added, changed, retained, removed, affected-save, and affected-progress counts before the destructive action. Deleting an entire deck removes it from every selected set and deletes its progress only after the same explicit impact confirmation.

Do not introduce deck version snapshots, archive/unpublish behavior, or recovery of progress for intentionally removed cards.

## Acceptance criteria

- [x] An admin can update a deck by immutable deck ID and rename only its display name without resetting retained progress.
- [x] The publish preview accurately reports added, changed, retained, and removed memberships plus destructive fan-out counts before confirmation.
- [x] Retained source-card IDs preserve FSRS state while updated text becomes visible in cloud play.
- [x] Added cards are new; removed cards disappear from all affected queues and permanently lose their per-save progress after confirmation.
- [x] Deleting a deck removes its selection and all of its progress from affected saves only after a visible impact confirmation.
- [x] Automated tests cover stable-ID diffing, changed-text preservation, add/remove semantics, deck deletion fan-out, transactions, and confirmation-gated destructive operations.

## Blocked by

- [CLOUD-2 — Publish and select a first curated deck](cloud-2-publish-select-curated-deck.md)
- [CLOUD-3 — Persist a cloud review turn safely](cloud-3-persist-cloud-review-turn.md)
