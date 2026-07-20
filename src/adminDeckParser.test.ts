import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { parseCuratedApkg } from './adminDeckParser';

describe('curated APKG parsing', () => {
  it('extracts grammar cards whose semantic fields are named in Japanese', async () => {
    const file = await anki21File(['文型', '意味', '例文1'], ['〜ことにする', 'to decide to do', '〜ことにする。']);

    await expect(parseCuratedApkg(await file.arrayBuffer())).resolves.toEqual([
      expect.objectContaining({
        sourceCardId: '1', front: '〜ことにする', back: 'to decide to do', exampleSentence: '〜ことにする。',
      }),
    ]);
  });
});

async function anki21File(fieldNames: string[], fields: string[]): Promise<File> {
  const SQL = await initSqlJs();
  const collection = new SQL.Database();
  collection.run('CREATE TABLE notes (id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT)');
  collection.run('CREATE TABLE col (models TEXT)');
  collection.run('INSERT INTO col VALUES (?)', [JSON.stringify({ 1: { flds: fieldNames.map((name) => ({ name })) } })]);
  collection.run('INSERT INTO notes VALUES (?, ?, ?)', [1, 1, fields.join('\u001f')]);
  const archive = new JSZip();
  archive.file('collection.anki21', collection.export());
  return Object.assign(await archive.generateAsync({ type: 'blob' }), { name: 'grammar.apkg' }) as File;
}
