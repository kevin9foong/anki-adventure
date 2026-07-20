# CLOUD-6 — Manage cloud-save link recovery and deletion

**Triage:** completed  
**Type:** AFK

## Parent

[Cloud persistence and curated decks PRD](../cloud-persistence-prd.md)

## What to build

Complete the admin cloud-save lifecycle. From the authenticated `/admin` route, an admin can edit a save’s private label, rotate its bearer token, and permanently delete the save after confirmation. Rotation preserves all remote state and selected decks, invalidates the old URL immediately, and returns a new high-entropy URL for the admin to distribute.

Deletion is intentionally permanent and removes only the targeted cloud save and its dependent state. Keep bearer tokens hashed at rest and out of logs/list responses. Do not add user self-service link generation, accounts, cloud backup/export/import, or a public save directory.

## Acceptance criteria

- [x] The admin can relabel a cloud save without changing its token or state.
- [x] Token rotation preserves the save data and deck selections, invalidates the old link, and reveals the new raw URL only to the authorized admin action.
- [x] The admin can permanently delete a selected cloud save only after an explicit confirmation; other saves and published decks remain unaffected.
- [x] Save management APIs enforce current-session admin authorization and never expose token hashes or raw tokens in list/log output.
- [x] Automated tests cover label edits, rotation invalidation/preservation, deletion isolation, authorization, and confirmation-gated deletion.

## Blocked by

- [CLOUD-1 — Create and open an admin-issued cloud save](cloud-1-create-open-cloud-save.md)
