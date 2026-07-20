# Cloud persistence and curated decks

**Triage:** ready-for-agent

## Problem Statement

Anki Adventure currently keeps one player save, imported cards, scheduling state, and media in browser IndexedDB. That makes the game local-first and offline-capable, but a learner cannot resume the same game on another device or use an admin-curated catalogue of decks without importing each deck locally.

For a small private beta, the admin needs to publish and update text-only curated decks. The admin also needs to generate high-entropy links that resume a cloud-backed game session. Recipients need to choose multiple published decks and retain that choice and their FSRS progress whenever they return to the link. The existing local save, local deck import, and local JSON backup workflow must remain available and unchanged.

## Solution

Add Cloudflare D1-backed cloud sessions to the existing Cloudflare Pages deployment through Pages Functions. A normal game URL remains the existing local IndexedDB experience. A URL containing a high-entropy `?save=` bearer token opens an online-only cloud session whose player state, selected decks, and per-deck-card FSRS progress are persisted in D1.

Provide a separate `/admin` route. It authenticates each browser session by asking for an admin key that the Pages Function checks against the `ADMIN_KEY` Cloudflare secret. The admin can publish/update text-only `.apkg` and CSV decks, create and label cloud save links, rotate a leaked token, and permanently delete a save or deck after reviewing its impact. The key is never embedded in the frontend, stored in browser persistence, or placed in a URL.

## User Stories

1. As a local player, I can continue opening the ordinary game URL and play from IndexedDB without needing a network connection.
2. As a local player, I can continue importing `.apkg` and CSV decks into my local game.
3. As a local player, I can continue exporting and restoring my local JSON backups.
4. As an admin, I can open a separate `/admin` page without publishing controls appearing in the game UI.
5. As an admin, I can enter my admin key each time I start an admin browser session so that the key is not retained after a refresh.
6. As an admin, I can publish a text-only `.apkg` deck so that learners can study its recognized vocabulary, meaning, reading, furigana, and example fields.
7. As an admin, I can publish a CSV deck with stable card IDs so that later deck updates can preserve the correct learning history.
8. As an admin, I can create a deck with a generated immutable deck ID and an editable display name.
9. As an admin, I can rename a published deck without resetting its learners’ queues.
10. As an admin, I can update a deck by deck ID so that retained source-card IDs preserve their FSRS progress.
11. As an admin, I can edit the text of a retained source card and have learners see the revised text without losing that card’s scheduling history.
12. As an admin, I can see a publish preview showing cards added, removed, changed, and retained before I confirm a deck update.
13. As an admin, I can remove a card from a deck and know that it will disappear from every affected learner queue and its cloud progress will be deleted.
14. As an admin, I can add a card to a deck and know it will be treated as a new card for every selected save.
15. As an admin, I can delete an entire deck only after seeing how many cloud saves and progress records will be affected.
16. As an admin, I can create a new cloud save link with an admin-only, human-readable label so that I can safely distinguish saves in the admin list.
17. As an admin, I can share a generated cloud save URL myself without granting any recipient the ability to create another cloud link.
18. As a cloud player, I can open my `?save=` URL on another device and resume the same party, monster storage, settings, deck selections, and study progress.
19. As a cloud player, I can see in Settings whether I am using Local or Cloud persistence.
20. As a cloud player, I see curated-deck selection in Settings instead of local import and backup-restore controls.
21. As a cloud player, I can select one or several published decks when first opening a newly created save.
22. As a cloud player, I can change my selected deck set later, and that selection is remembered when I reopen the same link.
23. As a cloud player, I can deselect a deck without deleting its progress, then reselect it and resume that deck’s existing schedule.
24. As a cloud player, I see due and learning cards from all selected decks according to their FSRS timings.
25. As a cloud player, I use one shared daily new-card allowance across all selected decks.
26. As a cloud player, I receive due/learning cards before new cards; equally eligible cards across decks are interleaved fairly.
27. As a cloud player, I can study visually identical cards from two different decks as two distinct queue entries with independent FSRS histories.
28. As a cloud player, I can continue using battle grades, catching, party management, healing, and daily-limit changes with cloud persistence.
29. As a cloud player, I am told to reload rather than silently losing work if the same save changed on another active device or tab.
30. As a cloud player, I understand that cloud mode requires a network connection and cannot be used as an offline pending-sync mode.
31. As a cloud player, I cannot use local deck import, local backup restore, cloud backup export, or cloud backup import while in cloud mode.
32. As a recipient, I can access only the cloud save represented by the bearer link I possess, not a public deck catalogue or other saves.
33. As an admin, I can rotate a cloud save token if its link is lost or leaked, preserving the save data but invalidating the old URL.
34. As an admin, I can permanently delete a cloud save after a confirmation step.
35. As an operator, I can run the private beta without collecting accounts, email addresses, analytics identifiers, or other personal profile data.

## Implementation Decisions

- Use Cloudflare Pages Functions bound to D1, alongside the existing Pages deployment. The feature targets a small private beta: tens of cloud saves, a handful of decks, and up to a few thousand text cards per deck.
- Treat URL mode as authoritative. A normal URL uses the current local IndexedDB repository. `?save=<token>` creates a cloud repository/session and does not read from, write to, migrate, or overwrite local game data.
- Cloud sessions are online-only. Do not implement an offline cache, pending-write queue, reconnect replay, or automatic conflict merge.
- Generate save tokens with cryptographically secure random 256-bit URL-safe values. Persist only a one-way token hash in D1. Never return raw tokens from read APIs, log them, store them in browser persistence, or put them in admin labels. Send a `Referrer-Policy: no-referrer` response header.
- The bearer token grants read/write access only to its one cloud save. Cloud save API requests authenticate with that token outside the request URL. Content/catalogue APIs require either a valid save token or admin authorization; they are not public download endpoints.
- `ADMIN_KEY` is an encrypted Cloudflare secret. `/admin` asks for it after every page load and keeps it in memory only. Pages Functions, not route obscurity or frontend code, enforce admin authorization.
- The admin route supports: authenticate for the current page session; list, create, relabel, rotate, and delete cloud saves; create, update, rename, preview, publish, and delete curated decks. Link creation remains admin-only.
- Store a cloud save’s player-owned state separately from deck content: party, monster storage, active monster, daily new-card configuration, daily rollover fields, selected decks, revision, timestamps, and admin-only label.
- Normalize published content into deck records, canonical text-card records where exact text can be shared, and deck-card memberships. A generated immutable `deck_id` is the deck identity; the display name is mutable metadata.
- The review identity is deck-scoped: `(save_id, deck_id, source_card_id)`. The same source-card content in two decks intentionally appears twice and has separate FSRS histories. Do not use an Anki note ID as a global cross-deck identity.
- For `.apkg` updates, use the source Anki note ID only within the maintained source deck. For CSV publishing/updating, require an explicit stable `id` column. Reject an unsafe CSV update rather than treating all cards as newly unrelated.
- Published cloud decks accept text only. Parse the existing supported card fields, but do not upload or serve APKG images/audio/media from D1. Local import retains its current media behavior.
- Deck publish compares memberships by `(deck_id, source_card_id)`. Retained memberships keep their per-save FSRS records; changed text updates in place; new memberships are new; removed memberships delete their per-save progress records. The publish preview reports the resulting impact before confirmation.
- Deleting a deck removes it from every cloud save selection and deletes all of that deck’s per-save progress after an explicit impact-confirmation step.
- Save selected deck IDs persistently. A fresh cloud save starts with no selected decks; its recipient selects decks on first launch and can edit the selection later. Deselecting a deck hides it from the queue but retains its progress unless an admin removes its cards/deck.
- Represent unseen selected cards implicitly. The absence of a progress row means the card is new; create a progress row only once the card is introduced/graded. This avoids eagerly creating thousands of rows on deck selection.
- Build the cloud queue from the selected deck memberships joined with existing progress. Apply the existing FSRS/scheduling semantics across the combined queue: learning/due cards first by urgency, then new cards under the save-wide daily allowance; randomly interleave ties across decks.
- Keep cloud mutations small and purpose-built rather than posting full save snapshots. Required operations include loading a session, listing/selecting decks, grading a deck-card, saving player/party/settings state, and admin operations. A grade changes only its relevant progress state plus any game state affected by that turn.
- Use an integer save revision for optimistic concurrency. Every cloud mutation supplies the expected revision and atomically increments it. On a mismatch, return a conflict response; the UI preserves remote data, displays a reload-required message, and never retries a grade automatically.
- Preserve the existing gameplay domain as the scheduling and combat authority. Introduce a narrow persistence abstraction that presents local and cloud implementations through compatible game-facing operations, while moving cloud queue/state loading and mutation rules behind a testable repository/service boundary.
- In cloud mode, Settings displays the Local/Cloud label, deck selector, shared new-card controls, party/storage data, and cloud-appropriate notices. Hide local deck import and backup restore; do not add cloud export/import controls in this scope.
- Validate request payloads, enforce save/deck ownership in queries, use D1 transactions for related writes, return clear authorization/not-found/conflict/validation errors, and avoid recording credentials in logs.

## Testing Decisions

- Good tests verify observable persistence and scheduling behavior, authorization boundaries, conflict results, and UI mode—not internal SQL statement shape or framework implementation details.
- Add unit tests for deck-diff classification, stable source-card matching, selected-deck queue composition, implicit-new-card behavior, deck-scoped duplicate cards, and revision conflict decisions. These are deep, deterministic modules with small interfaces and should be isolated from HTTP and browser APIs.
- Add repository/API integration tests against a D1-compatible test database for token hashing/lookup, bearer authorization isolation, admin authorization, token rotation, narrow grade/player mutations, transactional deck publish effects, card/deck deletion fan-out, and conflict responses.
- Add UI tests for URL-selected local versus cloud mode, cloud Settings content, hidden local-only controls in cloud mode, first-run deck selection, reload-required conflict feedback, and the admin key’s in-memory-only session behavior where practical.
- Keep and extend the existing Vitest style: test exported domain behavior, existing FSRS scheduling functions, deck import parsing, battle progression, and local IndexedDB behavior. Use fake IndexedDB for local-mode regression coverage.
- Run a production build and test the deployed-function routing/bindings configuration before release. Manually verify an iPhone/Safari cloud-link flow because cloud mode is explicitly network-dependent.

## Out of Scope

- User accounts, email/password login, OAuth, Cloudflare Access, roles beyond the single admin key, and public link creation.
- Public browsing or downloading of curated deck content.
- Cloud media storage, images, audio, R2 integration, or APKG media upload for curated decks.
- Cloud backup export, cloud backup import, or migration of an existing local save into a cloud save.
- Offline cloud play, a pending-write outbox, background synchronization, automatic conflict merging, or automatic mutation retry.
- Per-deck daily new-card limits; the cloud save retains one shared limit.
- Deck version snapshots, migration between immutable deck versions, archiving/unpublishing, and preserving progress for cards explicitly removed from a deck.
- Changing the existing local import, local persistence, or local JSON backup semantics.
- Scaling guarantees beyond the private-beta target, billing automation, analytics, or operational dashboards.

## Further Notes

- The Cloudflare secret only gives the server a value to verify; it does not identify a visitor on its own. The explicit per-session admin-key prompt is therefore required in this no-account design.
- A bearer cloud link is effectively a password for its save. The admin is responsible for distributing it, and token rotation is the recovery path for a leak.
- Card removal is intentionally destructive for every affected cloud save. The admin workflow must make this effect visible before the action is confirmed.
- Local mode remains the offline and backup-capable option. Cloud mode intentionally prioritizes a simple, authoritative D1 state model over offline synchronization complexity.
