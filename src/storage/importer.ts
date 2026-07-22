import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { materializeCard, type DeckProfileId } from '../deckMapper';
import type { StudyCard, StudyCardContent } from '../domain/game';
import { db } from './db';

type AnkiModel = { flds?: Array<{ name?: string }> };

export type ImportProgress =
  | { stage: 'reading' }
  | { stage: 'cards'; completed: number; total: number };

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
  };
}

async function csvCards(text: string): Promise<StudyCard[]> {
  const rows = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(',').map((field) => field.trim().replace(/^"|"$/g, '')));
  return rows.slice(rows[0]?.[0]?.toLowerCase().includes('front') ? 1 : 0).filter((row) => row[0] && row[1]).map((row, index) => makeCard(`csv-${Date.now()}-${index}`, materializeCard('', 'simple', { front: row[0], back: row[1], reading: row[2] ?? '' }).content, index));
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
  const cards = rows.map((row) => {
    const fields = String(row[2]).split('\u001f');
    const names = modelFields.get(String(row[1]));
    const sourceFields = Object.fromEntries((names ?? []).map((name, index) => [name, fields[index] ?? '']));
    const profile: DeckProfileId | undefined = names?.includes('Jlab-Kanji') ? 'jlab'
      : names?.includes('Word') && names.includes('Word Meaning') ? 'kaishi'
      : undefined;
    return profile ? makeCard(`anki-${row[0]}`, materializeCard(String(row[0]), profile, sourceFields).content, Number(row[3] ?? row[0])) : undefined;
  }).filter((card): card is StudyCard => Boolean(card));
  if (!cards.length) throw new Error('This app supports JLab and Kaishi APKG note types.');
  onProgress?.({ stage: 'cards', completed: cards.length, total: cards.length });
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

function makeCard(id: string, content: StudyCardContent, newPosition?: number): StudyCard {
  return { id, newPosition, content, state: 'new', dueAt: null, introducedOn: null, intervalDays: 0, reps: 0 };
}
