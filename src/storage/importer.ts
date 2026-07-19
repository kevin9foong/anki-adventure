import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { StudyCard } from '../domain/game';
import { db } from './db';

const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export async function importDeck(file: File): Promise<number> {
  const cards = file.name.toLowerCase().endsWith('.csv') ? await csvCards(await file.text()) : await apkgCards(await file.arrayBuffer());
  await db.cards.bulkPut(cards);
  return cards.length;
}

async function csvCards(text: string): Promise<StudyCard[]> {
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((field) => field.trim().replace(/^"|"$/g, '')));
  return rows.slice(rows[0]?.[0]?.toLowerCase().includes('front') ? 1 : 0).filter((row) => row[0] && row[1]).map((row, index) => makeCard(`csv-${Date.now()}-${index}`, row[0], row[1], row[2]));
}

async function apkgCards(buffer: ArrayBuffer): Promise<StudyCard[]> {
  const zip = await JSZip.loadAsync(buffer);
  const collection = zip.file('collection.anki21b') ?? zip.file('collection.anki2');
  if (!collection) throw new Error('This .apkg has no Anki collection database.');
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const database = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')));
  const result = database.exec('SELECT id, flds FROM notes');
  const rows = result[0]?.values ?? [];
  const mediaMapFile = zip.file('media');
  const mediaMap = mediaMapFile ? JSON.parse(await mediaMapFile.async('text')) as Record<string, string> : {};
  const cards = rows.map((row) => {
    const fields = String(row[1]).split('\u001f');
    return makeCard(`anki-${row[0]}`, strip(fields[0] ?? ''), strip(fields[1] ?? ''), strip(fields[2] ?? ''));
  }).filter((card) => card.front && card.back);
  // Persist blobs but do not read them until a card references one; this keeps battle rendering lazy.
  await Promise.all(Object.entries(mediaMap).slice(0, 5000).map(async ([key, name]) => {
    const entry = zip.file(key); if (entry) await db.media.put({ id: name, blob: await entry.async('blob') });
  }));
  return cards;
}

function makeCard(id: string, front: string, back: string, reading?: string): StudyCard {
  return { id, front, back, reading, state: 'new', dueAt: null, introducedOn: null, intervalDays: 0, reps: 0 };
}
