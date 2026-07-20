# CLOUD-1 — Create and open an admin-issued cloud save

**Triage:** completed  
**Type:** AFK

## Parent

[Cloud persistence and curated decks PRD](../cloud-persistence-prd.md)

## What to build

Deliver the first complete D1-backed cloud-save path in the existing Cloudflare Pages deployment. An admin opens `/admin`, enters the `ADMIN_KEY` for the current in-memory browser session, and creates/lists a labeled cloud save. Creation returns a newly generated share URL. Opening that `?save=` URL loads a fresh online-only cloud game, while the normal URL continues using the existing local IndexedDB game unchanged.

Use Pages Functions with a D1 binding. Generate a cryptographically secure 256-bit URL-safe bearer token, persist only its one-way hash, and authenticate cloud requests without putting the token in API request URLs. The token grants access only to its one save. The server must set `Referrer-Policy: no-referrer`, avoid credential logging, and return clear authorization/not-found errors. The configured `ADMIN_KEY` is verified only by server code; it is never embedded in frontend output, persisted in the browser, or accepted through a URL.

Persist the minimal cloud player state needed for a fresh game—party, storage, active monster, daily-limit state, revision, timestamps, and admin-only label. The cloud Settings UI identifies Cloud mode; the local Settings UI identifies Local mode. Do not introduce accounts, public link generation, offline cloud caching, or automatic migration from local data.

## Acceptance criteria

- [x] `/admin` asks for the configured admin key after every page load and retains it only in memory; invalid/missing keys cannot access admin APIs.
- [x] An authorized admin can create and list labeled cloud saves, receiving the raw bearer URL only at creation time; D1 retains only a hashed token.
- [x] Opening a valid `?save=` link loads its remote fresh game without reading or overwriting local IndexedDB data; an invalid link receives a safe error state.
- [x] Opening the normal app URL remains the existing offline-capable local game, and Settings clearly labels Local versus Cloud mode.
- [x] Cloud mode reports that it requires a connection; it does not implement an offline write queue or full-save snapshot synchronization.
- [x] Authorization boundaries, token hashing, local/cloud isolation, response security headers, and admin-key lifetime are covered by automated tests.

## Blocked by

None - can start immediately.
