import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
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
  return rows.slice(rows[0]?.[0]?.toLowerCase().includes('front') ? 1 : 0).filter((row) => row[0] && row[1]).map((row, index) => makeCard(`csv-${Date.now()}-${index}`, row[0], row[1], row[2]));
}

async function apkgCards(buffer: ArrayBuffer, onProgress?: ImportDeckOptions['onProgress']): Promise<StudyCard[]> {
  const zip = await JSZip.loadAsync(buffer);
  const collection = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collection) throw new Error('This .apkg has no Anki collection database.');
  const SQL = await initSqlJs({ locateFile: () => typeof window === 'undefined' ? new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname : wasmUrl });
  const database = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')));
  const result = database.exec('SELECT id, mid, flds FROM notes');
  const rows = result[0]?.values ?? [];
  const modelFields = ankiModelFields(database);
  const mediaMapFile = zip.file('media');
  const mediaMap = mediaMapFile ? JSON.parse(await mediaMapFile.async('text')) as Record<string, string> : {};
  const cards = rows.map((row) => {
    const fields = String(row[2]).split('\u001f');
    const names = modelFields.get(String(row[1]));
    const field = (aliases: string[], fallback?: number) => strip(names ? namedField(fields, names, aliases) : fallback === undefined ? '' : fields[fallback] ?? '');
    return makeCard(
      `anki-${row[0]}`,
      field(['word', 'front', 'expression', 'vocabulary', 'vocab', 'japanese', 'term'], 0),
      field(['wordmeaning', 'meaning', 'back', 'definition', 'translation', 'english', 'englishmeaning'], 1),
      field(['wordreading', 'reading', 'pronunciation', 'kana'], 2),
      field(['wordfurigana', 'furigana']),
      field(['sentence', 'examplesentence', 'sentencejapanese', 'japanesesentence']),
      field(['sentencemeaning', 'sentencetranslation', 'examplesentencemeaning', 'examplesentencetranslation', 'sentenceenglish', 'englishsentence']),
      field(['sentencefurigana', 'examplesentencefurigana']),
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

function namedField(fields: string[], names: string[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeFieldName));
  const index = names.findIndex((name) => normalizedAliases.has(normalizeFieldName(name)));
  return index === -1 ? '' : fields[index] ?? '';
}

function normalizeFieldName(name: string) { return name.toLowerCase().replace(/[^a-z0-9]/g, ''); }

function makeCard(id: string, front: string, back: string, reading?: string, furigana?: string, exampleSentence?: string, exampleSentenceTranslation?: string, exampleSentenceFurigana?: string): StudyCard {
  return {
    id, front, back, reading, furigana: furigana || undefined,
    exampleSentence: exampleSentence || undefined, exampleSentenceTranslation: exampleSentenceTranslation || undefined,
    exampleSentenceFurigana: exampleSentenceFurigana || undefined,
    state: 'new', dueAt: null, introducedOn: null, intervalDays: 0, reps: 0,
  };
}
