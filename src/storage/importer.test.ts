import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { importDeck } from './importer';

describe('deck import', () => {
  afterEach(async () => { await db.cards.clear(); await db.media.clear(); });

  it('imports a CSV deck into the local card store', async () => {
    const blob = new Blob(['front,back,reading\n海,sea,うみ\n山,mountain,やま'], { type: 'text/csv' });
    const file = Object.assign(blob, { name: 'starter.csv' }) as File;
    await expect(importDeck(file)).resolves.toBe(2);
    await expect(db.cards.count()).resolves.toBe(2);
    await expect(db.cards.get('csv-0')).resolves.toBeUndefined();
    expect((await db.cards.toArray()).map((card) => card.front)).toEqual(['海', '山']);
  });
});
