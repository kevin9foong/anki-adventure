import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { ankiField, type AnkiFieldConcept } from '../ankiFields';
import type { StudyCard } from '../domain/game';
import { db } from './db';

const strip = (html: string) => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const MEDIA_BATCH_SIZE = 10;
type AnkiModel = { flds?: Array<{ name?: string }> };

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
    lapses: existing.lapses,
    learningSteps: existing.learningSteps,
    lastReviewedAt: existing.lastReviewedAt,
    stability: existing.stability,
    difficulty: existing.difficulty,
    media: existing.media,
  };
}

async function csvCards(text: string): Promise<StudyCard[]> {
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((field) => field.trim().replace(/^"|"$/g, '')));
  return rows.slice(rows[0]?.[0]?.toLowerCase().includes('front') ? 1 : 0).filter((row) => row[0] && row[1]).map((row, index) => makeCard(`csv-${Date.now()}-${index}`, row[0], row[1], row[2], undefined, undefined, undefined, undefined, index));
}

async function apkgCards(buffer: ArrayBuffer, onProgress?: ImportDeckOptions['onProgress']): Promise<StudyCard[]> {
  const zip = await JSZip.loadAsync(buffer);
  const collection = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collection) throw new Error('This .apkg has no Anki collection database.');
  const SQL = await initSqlJs({ locateFile: () => typeof window === 'undefined' ? new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname : wasmUrl });
  const database = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')));
  // `cards.due` is Anki's stored new-card position. Notes alone have no
  // guaranteed query order, so retain this explicitly before resetting them
  // to this app's fresh scheduling state.
  let result: Array<{ values: unknown[][] }>;
  try {
    result = database.exec(`SELECT n.id, n.mid, n.flds, MIN(c.due) AS new_position
      FROM notes n LEFT JOIN cards c ON c.nid = n.id
      GROUP BY n.id, n.mid, n.flds
      ORDER BY new_position, n.id`);
  } catch {
    // Minimal test/export collections can omit `cards`; note IDs retain a
    // deterministic fallback order in that case.
    result = database.exec('SELECT id, mid, flds, id AS new_position FROM notes ORDER BY id');
  }
  const rows = result[0]?.values ?? [];
  const modelFields = ankiModelFields(database);
  const mediaMapFile = zip.file('media');
  const mediaMap = mediaMapFile ? JSON.parse(await mediaMapFile.async('text')) as Record<string, string> : {};
  const cards = rows.map((row) => {
    const fields = String(row[2]).split('\u001f');
    const names = modelFields.get(String(row[1]));
    const field = (concept: AnkiFieldConcept, fallback?: number) => strip(ankiField(fields, names, concept, fallback));
    return makeCard(
      `anki-${row[0]}`,
      field('front', 0), field('back', 1), field('reading', 2), field('furigana'),
      field('exampleSentence'), field('exampleSentenceTranslation'), field('exampleSentenceFurigana'), Number(row[3] ?? row[0]),
    );
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

function ankiModelFields(database: { exec: (sql: string) => Array<{ values: unknown[][] }> }) {
  try {
    const models = JSON.parse(String(database.exec('SELECT models FROM col')[0]?.values[0]?.[0] ?? '{}')) as Record<string, AnkiModel>;
    return new Map(Object.entries(models).map(([id, model]) => [id, (model.flds ?? []).map((field) => field.name ?? '')]));
  } catch {
    // Older and minimal collections may not include model metadata; retain positional import for them.
    return new Map<string, string[]>();
  }
}

function makeCard(id: string, front: string, back: string, reading?: string, furigana?: string, exampleSentence?: string, exampleSentenceTranslation?: string, exampleSentenceFurigana?: string, newPosition?: number): StudyCard {
  return {
    id, newPosition, front, back, reading, furigana: furigana || undefined,
    exampleSentence: exampleSentence || undefined, exampleSentenceTranslation: exampleSentenceTranslation || undefined,
    exampleSentenceFurigana: exampleSentenceFurigana || undefined,
    state: 'new', dueAt: null, introducedOn: null, intervalDays: 0, reps: 0,
  };
}
