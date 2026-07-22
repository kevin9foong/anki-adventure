import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { db } from './db';
import { importDeck } from './importer';

describe('deck import', () => {
  afterEach(async () => { await db.cards.clear(); });

  it('imports a CSV deck into the local card store', async () => {
    const blob = new Blob(['front,back,reading\n海,sea,うみ\n山,mountain,やま'], { type: 'text/csv' });
    const file = Object.assign(blob, { name: 'starter.csv' }) as File;
    await expect(importDeck(file)).resolves.toBe(2);
    await expect(db.cards.count()).resolves.toBe(2);
    await expect(db.cards.get('csv-0')).resolves.toBeUndefined();
    expect((await db.cards.toArray()).map((card) => card.content?.prompt[0]?.text)).toEqual(['海', '山']);
  });

  it('imports a JLab note into the app’s generic card sections', async () => {
    const file = await anki21File(
      [[1, '14', '1600425700000', 'Inu X Boku Secret Service', 'Read this sentence aloud.', 'そして僕は彼女の息子に会った', 'そして 僕[ぼく] は 彼女[かのじょ] の 息子[むすこ] に 会[あ]った', 'And as for me, I met her son.']],
      {},
      ['Version', 'Sequence', 'Source', 'RemarksFront', 'Jlab-Kanji', 'Other-Front', 'RemarksBack'],
    );

    await expect(importDeck(file)).resolves.toBe(1);
    const card = await db.cards.get('anki-1');
    expect(card).toMatchObject({
      content: {
        prompt: [{ text: 'そして僕は彼女の息子に会った', emphasis: 'primary' }, { text: 'Read this sentence aloud.', emphasis: 'detail' }],
        answer: [{ text: 'そして 僕[ぼく] は 彼女[かのじょ] の 息子[むすこ] に 会[あ]った', emphasis: 'primary' }, { text: 'And as for me, I met her son.', emphasis: 'detail' }],
      },
    });
    expect(card).not.toHaveProperty('front');
    expect(card).not.toHaveProperty('back');
  });

  it('retains Anki new-card positions when importing a package', async () => {
    const file = await anki21File([
      [10, '14', '10', 'source', '', '三', '三', 'three'],
      [20, '14', '20', 'source', '', '一', '一', 'one'],
      [30, '14', '30', 'source', '', '二', '二', 'two'],
    ], {}, ['Version', 'Sequence', 'Source', 'RemarksFront', 'Jlab-Kanji', 'Other-Front', 'RemarksBack'], [3, 1, 2]);

    await importDeck(file);

    expect((await db.cards.orderBy('newPosition').toArray()).map((card) => card.content?.prompt.at(-1)?.text)).toEqual(['一', '二', '三']);
  });

  it('imports a Kaishi note into generic, non-duplicated card sections', async () => {
    const file = await anki21File(
      [[1, '私', 'わたし', 'I', '私[わたし]', '<b>私</b>はアンです。', 'I am Ann.', '<b>私[わたし]</b>はアンです。']],
      {},
      ['Word', 'Word Reading', 'Word Meaning', 'Word Furigana', 'Sentence', 'Sentence Meaning', 'Sentence Furigana'],
    );

    await expect(importDeck(file)).resolves.toBe(1);

    await expect(db.cards.get('anki-1')).resolves.toMatchObject({
      content: {
        prompt: [{ text: '私', emphasis: 'primary' }],
        answer: [
          { text: '私[わたし]', emphasis: 'primary' },
          { text: 'I', emphasis: 'supporting' },
          { text: '私[わたし]はアンです。', emphasis: 'supporting' },
          { text: 'I am Ann.', emphasis: 'supporting' },
        ],
      },
    });
  });

  it('ignores package media and reports card progress only', async () => {
    const progress: unknown[] = [];

    await importDeck(await anki21File([[1, '14', '1', 'source', '', '猫', '猫', 'cat']], { '0': 'cat.jpg', '1': 'cat.mp3' }, ['Version', 'Sequence', 'Source', 'RemarksFront', 'Jlab-Kanji', 'Other-Front', 'RemarksBack']), { onProgress: (update) => progress.push(update) });

    expect(progress).toEqual([
      { stage: 'reading' },
      { stage: 'cards', completed: 1, total: 1 },
    ]);
  });

  it('keeps existing review progress and adds cards when an updated package is re-imported', async () => {
    const fields = ['Version', 'Sequence', 'Source', 'RemarksFront', 'Jlab-Kanji', 'Other-Front', 'RemarksBack'];
    await importDeck(await anki21File([[1, '14', '1', 'source', '', '猫', '猫', 'cat']], {}, fields));
    await db.cards.update('anki-1', { state: 'review', dueAt: '2026-08-01T12:00:00.000Z', introducedOn: '2026-07-01', intervalDays: 14, reps: 6, lapses: 2, learningSteps: 1, lastReviewedAt: '2026-07-18T12:00:00.000Z', stability: 12, difficulty: 4 });

    await expect(importDeck(await anki21File([[1, '14', '1', 'source', '', '猫', '猫', 'kitty'], [2, '14', '2', 'source', '', '犬', '犬', 'dog']], {}, fields))).resolves.toBe(2);

    await expect(db.cards.get('anki-1')).resolves.toMatchObject({ content: { answer: [{ text: '猫', emphasis: 'primary' }, { text: 'kitty', emphasis: 'detail' }] }, state: 'review', dueAt: '2026-08-01T12:00:00.000Z', intervalDays: 14, reps: 6, lapses: 2, learningSteps: 1, lastReviewedAt: '2026-07-18T12:00:00.000Z', stability: 12, difficulty: 4 });
    await expect(db.cards.get('anki-2')).resolves.toMatchObject({ content: { prompt: [{ text: '犬', emphasis: 'primary' }] }, state: 'new' });
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
