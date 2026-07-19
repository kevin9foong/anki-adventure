## Problem Statement

Japanese learners need a pleasant, phone-friendly way to complete Anki-style reviews without being locked into a flashcard interface. They need to import a deck locally, retain scheduling and progress offline, and turn each review into meaningful game progress.

## Solution

A static, installable browser game set in a stylized Awaji–Tokushima region. The player explores by touch or keyboard, enters encounters, self-grades Japanese-to-English cards, and uses those grades to resolve battles and catches. All deck and save state remains local in IndexedDB.

## User Stories

1. As a learner, I can import an Anki package or CSV so I can study my own vocabulary.
2. As a learner, I can enter a battle only when a due or allowed new card exists.
3. As a learner, I can reveal an answer and choose Again, Hard, Good, or Easy.
4. As a player, I see my grade translate into damage and progression.
5. As a player, I can catch wild original monsters and manage a six-monster party.
6. As a mobile player, I can move with a touch D-pad and play in Safari without page scrolling.
7. As an offline player, I can reopen the app with my deck and save intact.
8. As a learner, I can export a backup and restore it later.
9. As a player, I can explore a world inspired by Tokushima, Mt. Bizan, Naruto whirlpools, and Awaji.

## Implementation Decisions

- Phaser 3 powers a fixed-resolution, portrait-friendly overworld and battle presentation.
- A small GameState module is the public gameplay boundary; it owns party, battle, grades, catch, and persistent save updates.
- IndexedDB stores cards, player save, and imported media records. `.apkg` is parsed client-side with JSZip; text cards are extracted immediately while media is retained in IndexedDB lazily.
- A practical SM-2-compatible local scheduler is used for this MVP, with a schema that retains FSRS-ready scheduling fields. It preserves the locked grade interface and due-first queue behavior.
- Original pixel-style assets are generated in canvas at runtime, keeping boot payload small and avoiding unlicensed art.

## Testing Decisions

- Test public behavior of scheduling, battle damage, catch chance, levelling, and import parsing.
- Use Vitest. Tests exercise exported domain functions, not Phaser internals.

## Out of Scope

Cloud sync, automatic answer checking, audio playback, full Anki collection database fidelity, and additional regions are deferred.

## Further Notes

Location references were checked against Japan National Tourism Organization and local attraction sources where available; the game uses stylized, non-geographic map layouts and original names/art.
