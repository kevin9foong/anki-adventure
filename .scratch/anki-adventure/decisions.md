# Decisions

- 2026-07-19 — Pin Phaser 3.90.0, the final stable Phaser 3 release, rather than Phaser 4. It matches the handoff's mature-ecosystem requirement and avoids Phaser 4 migration risk for an iOS-first MVP.
- 2026-07-19 — Import Anki media in batches of 10. This bounds peak decompression/blob memory for Kaishi-scale packages on iOS while still preserving every media file for offline use; import takes longer than an unbounded parallel write.
- 2026-07-19 — Keep import status separate from the normal deck summary until the import settles. This prevents settings saves from hiding an active import, at the cost of deferring summary refreshes until completion.
