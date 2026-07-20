# CLOUD-2 — Publish and select a first curated deck

**Triage:** completed  
**Type:** AFK

## Parent

[Cloud persistence and curated decks PRD](../cloud-persistence-prd.md)

## What to build

Deliver an end-to-end curated-deck path. An authenticated admin creates a published text-only deck from an `.apkg` or CSV input. A cloud-save holder can see the authorized catalogue in Cloud Settings, select the deck, and have that selection stored on the cloud save and restored on return.

Use an immutable generated `deck_id` as the deck identity and editable display name as metadata. Reuse recognized existing text fields, but do not upload or serve media. An APKG source card is identified by its note ID only within that maintained source deck. A CSV requires an explicit stable `id` for publish/update safety. Content/catalogue APIs must require either the valid cloud-save bearer token or admin authorization; no unauthenticated catalogue endpoint is permitted.

A new cloud save begins with no selected decks. In Cloud mode, replace local import and backup-restore controls with this curated deck selector; local mode retains its current import/restore behavior. Represent selected unseen cards implicitly rather than pre-creating scheduling records.

## Acceptance criteria

- [x] An authorized admin can publish a new text-only `.apkg` or CSV deck with a generated immutable deck ID and editable name.
- [x] CSV publish/update rejects missing stable card IDs; APKG parsing uses the maintained source deck’s note IDs and recognized text fields.
- [x] A valid cloud-save bearer can retrieve only the published deck metadata/content needed to select and study decks; unauthenticated requests cannot enumerate or download the catalogue.
- [x] A cloud player can select the published deck in Settings, and that selection survives reopening the same save URL.
- [x] Cloud Settings hides local deck import and backup restore, while normal local mode retains them unchanged.
- [x] Selecting a large deck creates no eager per-card FSRS rows; absence of progress is treated as a new card.
- [x] Publish, authorization, selection persistence, cloud/local UI separation, and implicit-new behavior have automated coverage.

## Blocked by

- [CLOUD-1 — Create and open an admin-issued cloud save](cloud-1-create-open-cloud-save.md)
