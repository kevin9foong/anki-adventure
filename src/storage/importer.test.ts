import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import initSqlJs from 'sql.js/dist/sql-asm.js';
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

  it('imports an Anki 2.1 package whose collection is named collection.anki21', async () => {
    const file = await anki21File([[1, '猫', 'cat', 'ねこ']]);

    await expect(importDeck(file)).resolves.toBe(1);
    await expect(db.cards.get('anki-1')).resolves.toMatchObject({ front: '猫', back: 'cat', reading: 'ねこ' });
  });

  it('retains Anki new-card positions when importing a package', async () => {
    const file = await anki21File([[10, '三', 'three'], [20, '一', 'one'], [30, '二', 'two']], {}, undefined, [3, 1, 2]);

    await importDeck(file);

    expect((await db.cards.orderBy('newPosition').toArray()).map((card) => card.front)).toEqual(['一', '二', '三']);
  });

  it('imports Kaishi meanings, examples, and furigana by their field names', async () => {
    const file = await anki21File(
      [[1, '私', 'わたし', 'I', '私[わたし]', '<b>私</b>はアンです。', 'I am Ann.', '<b>私[わたし]</b>はアンです。']],
      {},
      ['Word', 'Word Reading', 'Word Meaning', 'Word Furigana', 'Sentence', 'Sentence Meaning', 'Sentence Furigana'],
    );

    await importDeck(file);

    await expect(db.cards.get('anki-1')).resolves.toMatchObject({
      front: '私', back: 'I', reading: 'わたし', furigana: '私[わたし]',
      exampleSentence: '私はアンです。', exampleSentenceTranslation: 'I am Ann.', exampleSentenceFurigana: '私[わたし]はアンです。',
    });
  });

  it('imports grammar cards with Japanese semantic field names', async () => {
    const file = await anki21File(
      [[1, '〜ことにする', 'to decide to do', 'V-dictionary form', 'N4', '〜ことにする。']],
      {},
      ['文型', '意味', '接続', 'JLPTレベル', '例文1'],
    );

    await expect(importDeck(file)).resolves.toBe(1);
    await expect(db.cards.get('anki-1')).resolves.toMatchObject({
      front: '〜ことにする', back: 'to decide to do', exampleSentence: '〜ことにする。',
    });
  });

  it('reports card and media progress while importing a package', async () => {
    const progress: unknown[] = [];

    await importDeck(await anki21File([[1, '猫', 'cat', 'ねこ']], { '0': 'cat.jpg', '1': 'cat.mp3' }), { onProgress: (update) => progress.push(update) });

    expect(progress).toEqual([
      { stage: 'reading' },
      { stage: 'cards', completed: 1, total: 1 },
      { stage: 'media', completed: 0, total: 2 },
      { stage: 'media', completed: 2, total: 2 },
    ]);
  });

  it('keeps existing review progress and adds cards when an updated package is re-imported', async () => {
    await importDeck(await anki21File([[1, '猫', 'cat', 'ねこ']]));
    await db.cards.update('anki-1', { state: 'review', dueAt: '2026-08-01T12:00:00.000Z', introducedOn: '2026-07-01', intervalDays: 14, reps: 6, lapses: 2, learningSteps: 1, lastReviewedAt: '2026-07-18T12:00:00.000Z', stability: 12, difficulty: 4 });

    await expect(importDeck(await anki21File([[1, '猫', 'kitty', 'ねこ'], [2, '犬', 'dog', 'いぬ']]))).resolves.toBe(2);

    await expect(db.cards.get('anki-1')).resolves.toMatchObject({ back: 'kitty', state: 'review', dueAt: '2026-08-01T12:00:00.000Z', intervalDays: 14, reps: 6, lapses: 2, learningSteps: 1, lastReviewedAt: '2026-07-18T12:00:00.000Z', stability: 12, difficulty: 4 });
    await expect(db.cards.get('anki-2')).resolves.toMatchObject({ front: '犬', state: 'new' });
  });
});

async function anki21File(notes: Array<[number, ...string[]]>, media: Record<string, string> = {}, fieldNames?: string[], newPositions?: number[]): Promise<File> {
  const SQL = await initSqlJs();
  const collection = new SQL.Database();
  collection.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT)');
  if (newPositions) collection.run('CREATE TABLE cards (id INTEGER PRIMARY KEY, nid INTEGER, due INTEGER)');
  if (fieldNames) {
    collection.run('CREATE TABLE col (models TEXT)');
    collection.run('INSERT INTO col VALUES (?)', [JSON.stringify({ 1: { flds: fieldNames.map((name) => ({ name })) } })]);
  }
  for (const [index, [id, ...fields]] of notes.entries()) {
    collection.run('INSERT INTO notes VALUES (?, ?, ?)', [id, fieldNames ? 1 : 0, fields.join('\u001f')]);
    if (newPositions) collection.run('INSERT INTO cards VALUES (?, ?, ?)', [id + 100, id, newPositions[index]]);
  }
  const archive = new JSZip();
  archive.file('collection.anki21', collection.export());
  if (Object.keys(media).length) {
    archive.file('media', JSON.stringify(media));
    for (const key of Object.keys(media)) archive.file(key, key);
  }
  return Object.assign(await archive.generateAsync({ type: 'blob' }), { name: 'anki-21.apkg' }) as File;
}
