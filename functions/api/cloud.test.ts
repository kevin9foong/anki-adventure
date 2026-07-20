import { describe, expect, it } from 'vitest';
import { onRequest as verifyAdmin } from './admin/verify';
import { onRequest as saveAdmin } from './admin/saves';
import { onRequest as updatePlayerState } from './session/player-state';
import { onRequest as gradeCard } from './session/grade';
import { onRequest as selectDecks } from './session/decks';
import { onRequest as loadSession } from './session';
import { onRequest as decksAdmin } from './admin/decks';
import { onRequest as deckAdmin } from './admin/decks/[deckId]';
import { onRequest as saveAdminItem } from './admin/saves/[saveId]';
import { onRequest as rotateSave } from './admin/saves/[saveId]/rotate';

describe('cloud session endpoint', () => {
  it('loads only the cloud save named by a valid bearer token', async () => {
    const response = await loadSession({
      request: new Request('https://anki.example/api/session', {
        headers: { Authorization: `Bearer ${'a'.repeat(43)}` },
      }),
      env: {
        DB: {
          prepare: () => ({
            bind: () => ({
              first: async () => ({
                id: 'save-1',
                party_json: '[]',
                storage_json: '[]',
                active_monster_id: null,
                daily_new_card_limit: 10,
                limit_date: '2026-07-20',
                extra_new_cards_today: 0,
                revision: 0,
                created_at: '2026-07-20T00:00:00.000Z',
                updated_at: '2026-07-20T00:00:00.000Z',
              }),
            }),
          }),
        },
      },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    await expect(response.json()).resolves.toMatchObject({
      save: { id: 'save-1', party: [], revision: 0 },
    });
  });
});

describe('admin verification endpoint', () => {
  it('accepts only the configured key and never echoes it', async () => {
    const valid = await verifyAdmin({
      request: new Request('https://anki.example/api/admin/verify', {
        method: 'POST', headers: { 'X-Admin-Key': 'correct-key' },
      }),
      env: { ADMIN_KEY: 'correct-key' },
    } as never);
    const invalid = await verifyAdmin({
      request: new Request('https://anki.example/api/admin/verify', { method: 'POST' }),
      env: { ADMIN_KEY: 'correct-key' },
    } as never);

    expect(valid.status).toBe(204);
    expect(valid.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(invalid.status).toBe(401);
    expect(await invalid.text()).not.toContain('correct-key');
  });
});

describe('admin save endpoints', () => {
  it('creates a labeled save, returns its bearer URL once, and lists no credential material', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const db = {
      prepare(query: string) {
        const statement = {
          bind(...values: unknown[]) {
            return {
              async first() { return null; },
              async all() { return { results: rows }; },
              async run() {
                rows.push({
                  id: values[0], token_hash: values[1], label: values[2], party_json: values[3], storage_json: values[4],
                  active_monster_id: values[5], daily_new_card_limit: values[6], limit_date: values[7], extra_new_cards_today: values[8],
                  revision: values[9], created_at: values[10], updated_at: values[11], query,
                });
              },
            };
          },
          async all() { return { results: rows }; },
        };
        return statement;
      },
    };
    const env = { ADMIN_KEY: 'correct-key', DB: db };
    const headers = { 'X-Admin-Key': 'correct-key', 'Content-Type': 'application/json' };
    const created = await saveAdmin({
      request: new Request('https://anki.example/api/admin/saves', { method: 'POST', headers, body: JSON.stringify({ label: 'Mina iPhone' }) }),
      env,
    } as never);
    const body = await created.json() as { save: { label: string }; url: string };
    const listed = await saveAdmin({ request: new Request('https://anki.example/api/admin/saves', { headers }), env } as never);
    const listText = await listed.text();

    expect(created.status).toBe(201);
    expect(body.save.label).toBe('Mina iPhone');
    expect(body.url).toMatch(/^https:\/\/anki\.example\/\?save=[A-Za-z0-9_-]{43}$/);
    expect(listed.status).toBe(200);
    expect(listText).toContain('Mina iPhone');
    expect(listText).not.toContain('token_hash');
    expect(listText).not.toContain(body.url.split('=')[1]);
    expect(JSON.parse(String(rows[0].party_json))).toMatchObject([{ species: 'tanuki', name: 'Tanukiwi', level: 1 }]);
    expect(rows[0].active_monster_id).toMatch(/^tanuki-/);
  });
});

describe('admin deck lifecycle endpoints', () => {
  it('requires admin authorization before publishing a text deck', async () => {
    const response = await decksAdmin({
      request: new Request('https://anki.example/api/admin/decks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: 'Core', cards: [] }) }),
      env: { ADMIN_KEY: 'correct-key', DB: {} },
    } as never);
    expect(response.status).toBe(401);
  });

  it('publishes broad text fields and requires confirmation before card removal', async () => {
    const writes: Array<{ query: string; values: unknown[] }> = [];
    const db = {
      prepare(query: string) { return { bind(...values: unknown[]) { return {
        async first() { return query.includes('SELECT id FROM curated_decks') ? { id: 'deck-1' } : null; },
        async all() { return { results: query.includes('FROM deck_cards') ? [{ source_card_id: 'old', front: '犬', back: 'dog', reading: null, furigana: null, example: null, example_translation: null, example_furigana: null }] : [] }; },
        async run() { writes.push({ query, values }); return { meta: { changes: 1 } }; },
      }; } }; },
      async batch(statements: Array<{ run(): Promise<unknown> }>) { return Promise.all(statements.map((statement) => statement.run())); },
    };
    const headers = { 'X-Admin-Key': 'correct-key', 'Content-Type': 'application/json' };
    const preview = await deckAdmin({ request: new Request('https://anki.example/api/admin/decks/deck-1', { method: 'PATCH', headers, body: JSON.stringify({ displayName: 'Core', previewOnly: true, cards: [{ sourceCardId: 'new', front: '猫', back: 'cat' }] }) }), env: { ADMIN_KEY: 'correct-key', DB: db } } as never);
    expect(await preview.json()).toMatchObject({ preview: { added: 1, removed: 1 } });
    expect(writes).toEqual([]);
    const rejected = await deckAdmin({ request: new Request('https://anki.example/api/admin/decks/deck-1', { method: 'PATCH', headers, body: JSON.stringify({ displayName: 'Core', cards: [{ sourceCardId: 'new', front: '猫', back: 'cat' }] }) }), env: { ADMIN_KEY: 'correct-key', DB: db } } as never);
    expect(rejected.status).toBe(409);
    const published = await deckAdmin({ request: new Request('https://anki.example/api/admin/decks/deck-1', { method: 'PATCH', headers, body: JSON.stringify({ displayName: 'Core', confirmDestructive: true, cards: [{ sourceCardId: 'new', front: '猫', back: 'cat', reading: 'ねこ', furigana: '猫[ねこ]', exampleSentence: '猫です。', exampleSentenceTranslation: 'It is a cat.' }] }) }), env: { ADMIN_KEY: 'correct-key', DB: db } } as never);
    expect(published.status).toBe(200);
    expect(writes.some(({ query }) => query.includes('DELETE FROM cloud_card_progress'))).toBe(true);
    expect(writes.some(({ values }) => values.includes('猫です。'))).toBe(true);
  });
});

describe('admin save recovery endpoints', () => {
  it('relabels without returning a token, rotates only through the rotation action, and gates deletion', async () => {
    const writes: Array<{ query: string; values: unknown[] }> = [];
    const db = {
      prepare(query: string) { return { bind(...values: unknown[]) { return {
        async first() { return query.includes('SELECT') ? { id: 'save-1' } : null; },
        async all() { return { results: [] }; },
        async run() { writes.push({ query, values }); return { meta: { changes: 1 } }; },
      }; } }; },
      async batch(statements: Array<{ run(): Promise<unknown> }>) { return Promise.all(statements.map((statement) => statement.run())); },
    };
    const headers = { 'X-Admin-Key': 'correct-key', 'Content-Type': 'application/json' };
    const relabeled = await saveAdminItem({ request: new Request('https://anki.example/api/admin/saves/save-1', { method: 'PATCH', headers, body: JSON.stringify({ label: 'Mina laptop' }) }), env: { ADMIN_KEY: 'correct-key', DB: db } } as never);
    expect(await relabeled.json()).toEqual({ id: 'save-1', label: 'Mina laptop' });
    const unconfirmed = await saveAdminItem({ request: new Request('https://anki.example/api/admin/saves/save-1', { method: 'DELETE', headers, body: JSON.stringify({}) }), env: { ADMIN_KEY: 'correct-key', DB: db } } as never);
    expect(unconfirmed.status).toBe(409);
    const rotated = await rotateSave({ request: new Request('https://anki.example/api/admin/saves/save-1/rotate', { method: 'POST', headers }), env: { ADMIN_KEY: 'correct-key', DB: db } } as never);
    expect((await rotated.json() as { url: string }).url).toMatch(/\?save=[A-Za-z0-9_-]{43}$/);
    expect(writes.some(({ query }) => query.includes('token_hash'))).toBe(true);
  });
});

describe('revision-guarded cloud mutations', () => {
  const saveRow = {
    id: 'save-1', token_hash: 'hash', label: 'Mina', party_json: '[]', storage_json: '[]', active_monster_id: null,
    daily_new_card_limit: 10, limit_date: null, extra_new_cards_today: 0, revision: 3,
    created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z',
  };

  it('returns reload-required conflict instead of overwriting a stale player state', async () => {
    const response = await updatePlayerState({
      request: new Request('https://anki.example/api/session/player-state', {
        method: 'PATCH', headers: { Authorization: `Bearer ${'a'.repeat(43)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 2, party: [] }),
      }),
      env: { DB: { prepare: () => ({ bind: () => ({ first: async () => saveRow, run: async () => ({ meta: { changes: 0 } }) }) }) } },
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'revision_conflict', reloadRequired: true });
  });

  it('rejects malformed or oversized player-owned monster state before persistence', async () => {
    const response = await updatePlayerState({
      request: new Request('https://anki.example/api/session/player-state', {
        method: 'PATCH', headers: { Authorization: `Bearer ${'a'.repeat(43)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 3, party: [{ id: 'bad', species: 'not-a-species', name: 'Oops', level: 1, xp: 1, currentHp: 1 }] }),
      }),
      env: { DB: { prepare: () => ({ bind: () => ({ first: async () => saveRow }) }) } },
    } as never);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_player_state' });
  });

  it('grades only a selected deck-card and returns the incremented revision', async () => {
    let firstCall = true;
    const response = await gradeCard({
      request: new Request('https://anki.example/api/session/grade', {
        method: 'POST', headers: { Authorization: `Bearer ${'a'.repeat(43)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 3, deckId: 'core', sourceCardId: 'cat', grade: 'good', playerState: { party: [], storage: [], activeMonsterId: null, dailyNewCardLimit: 10, limitDate: '2026-07-20', extraNewCardsToday: 0 } }),
      }),
      env: {
        DB: {
          prepare: () => ({ bind: () => ({
            first: async () => firstCall ? (firstCall = false, saveRow) : {
              front: '猫', back: 'cat', reading: null, furigana: null, state: null, due_at: null, introduced_on: null,
              interval_days: null, stability: null, difficulty: null, reps: null, lapses: null, learning_steps: null, last_reviewed_at: null,
            },
          }) }),
          batch: async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }],
        },
      },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ revision: 4, card: { deckId: 'core', sourceCardId: 'cat', reps: 1 } });
  });

  it('replaces selected decks only when the caller has the current revision', async () => {
    let first = true;
    const response = await selectDecks({
      request: new Request('https://anki.example/api/session/decks', {
        method: 'PUT', headers: { Authorization: `Bearer ${'a'.repeat(43)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: 3, deckIds: ['core', 'travel'] }),
      }),
      env: {
        DB: {
          prepare: () => ({
            bind: () => ({ first: async () => first ? (first = false, saveRow) : null, all: async () => ({ results: [{ id: 'core' }, { id: 'travel' }] }) }),
          }),
          batch: async () => [{ meta: { changes: 1 } }],
        },
      },
    } as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ selectedDeckIds: ['core', 'travel'], revision: 4 });
  });
});

describe('cloud deck catalogue authorization', () => {
  it('gives a valid save holder published deck metadata for first selection without exposing cards from unselected decks', async () => {
    let first = true;
    const response = await selectDecks({
      request: new Request('https://anki.example/api/session/decks', { headers: { Authorization: `Bearer ${'a'.repeat(43)}` } }),
      env: { DB: { prepare: (query: string) => ({
        bind: () => ({
          first: async () => first ? (first = false, { id: 'save-1', token_hash: 'hash', label: 'Mina', party_json: '[]', storage_json: '[]', active_monster_id: null, daily_new_card_limit: 10, limit_date: null, extra_new_cards_today: 0, revision: 3, created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-20T00:00:00.000Z' }) : null,
          all: async () => ({ results: [] }),
        }),
        all: async () => ({ results: query.includes('FROM curated_decks d LEFT JOIN') ? [{ id: 'core', display_name: 'Core', card_count: 2 }] : [] }),
      }) } },
    } as never);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ selectedDeckIds: [], decks: [], catalogue: [{ id: 'core', displayName: 'Core', cardCount: 2 }], revision: 3 });
  });
});
