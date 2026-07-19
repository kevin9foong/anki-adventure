import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { StudyCard } from '../domain/game';
import { db } from './db';

const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const MEDIA_BATCH_SIZE = 10;

export type ImportProgress =
  | { stage: 'reading' }
  | { stage: 'cards'; completed: number; total: number }
  | { stage: 'media'; completed: number; total: number };

export interface ImportDeckOptions { onProgress?: (progress: ImportProgress) => void; }

export async function importDeck(file: File, options: ImportDeckOptions = {}): Promise<number> {
  options.onProgress?.({ stage: 'reading' });
  const cards = file.name.toLowerCase().endsWith('.csv')
    ? await csvCards(await file.text())
    : await apkgCards(await file.arrayBuffer(), options.onProgress);
  if (file.name.toLowerCase().endsWith('.csv')) options.onProgress?.({ stage: 'cards', completed: cards.length, total: cards.length });
  const existing = await db.cards.bulkGet(cards.map((card) => card.id));
  await db.cards.bulkPut(cards.map((card, index) => existing[index] ? keepScheduling(card, existing[index]) : card));
  return cards.length;
}

function keepScheduling(imported: StudyCard, existing: StudyCard): StudyCard {
  return {
    ...imported,
    state: existing.state,
    dueAt: existing.dueAt,
    introducedOn: existing.introducedOn,
    intervalDays: existing.intervalDays,
    reps: existing.reps,
    stability: existing.stability,
    difficulty: existing.difficulty,
    media: existing.media,
  };
}

async function csvCards(text: string): Promise<StudyCard[]> {
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((field) => field.trim().replace(/^"|"$/g, '')));
  return rows.slice(rows[0]?.[0]?.toLowerCase().includes('front') ? 1 : 0).filter((row) => row[0] && row[1]).map((row, index) => makeCard(`csv-${Date.now()}-${index}`, row[0], row[1], row[2]));
}

async function apkgCards(buffer: ArrayBuffer, onProgress?: ImportDeckOptions['onProgress']): Promise<StudyCard[]> {
  const zip = await JSZip.loadAsync(buffer);
  const collection = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collection) throw new Error('This .apkg has no Anki collection database.');
  const SQL = await initSqlJs({ locateFile: () => typeof window === 'undefined' ? new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname : wasmUrl });
  const database = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')));
  const result = database.exec('SELECT id, flds FROM notes');
  const rows = result[0]?.values ?? [];
  const mediaMapFile = zip.file('media');
  const mediaMap = mediaMapFile ? JSON.parse(await mediaMapFile.async('text')) as Record<string, string> : {};
  const cards = rows.map((row) => {
    const fields = String(row[1]).split('\u001f');
    return makeCard(`anki-${row[0]}`, strip(fields[0] ?? ''), strip(fields[1] ?? ''), strip(fields[2] ?? ''));
  }).filter((card) => card.front && card.back);
  onProgress?.({ stage: 'cards', completed: cards.length, total: cards.length });
  // Decode only a few blobs at a time: large Anki packages can contain thousands of images.
  const mediaEntries = Object.entries(mediaMap);
  onProgress?.({ stage: 'media', completed: 0, total: mediaEntries.length });
  for (let offset = 0; offset < mediaEntries.length; offset += MEDIA_BATCH_SIZE) {
    await Promise.all(mediaEntries.slice(offset, offset + MEDIA_BATCH_SIZE).map(async ([key, name]) => {
      const entry = zip.file(key); if (entry) await db.media.put({ id: name, blob: await entry.async('blob') });
    }));
    onProgress?.({ stage: 'media', completed: Math.min(offset + MEDIA_BATCH_SIZE, mediaEntries.length), total: mediaEntries.length });
  }
  return cards;
}

function makeCard(id: string, front: string, back: string, reading?: string): StudyCard {
  return { id, front, back, reading, state: 'new', dueAt: null, introducedOn: null, intervalDays: 0, reps: 0 };
}
