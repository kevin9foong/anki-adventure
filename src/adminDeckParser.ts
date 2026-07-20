import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { ankiField, type AnkiFieldConcept } from './ankiFields';
import { validateCuratedCards, type CuratedCardInput } from './cloud/decks';

type AnkiModel = { flds?: Array<{ name?: string }> };
const clean = (text: string) => text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const field = (fields: string[], names: string[] | undefined, concept: AnkiFieldConcept, fallback?: number) => clean(ankiField(fields, names, concept, fallback));

/** Extracts only recognized text fields; APKG media is never uploaded by the admin route. */
export async function parseCuratedApkg(buffer: ArrayBuffer): Promise<CuratedCardInput[]> {
  const zip = await JSZip.loadAsync(buffer);
  const collection = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collection) throw new Error('This .apkg has no Anki collection database.');
  const SQL = await initSqlJs({ locateFile: () => typeof window === 'undefined' ? new URL('../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname : wasmUrl });
  const database = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')));
  const result = database.exec('SELECT id, mid, flds FROM notes')[0]?.values ?? [];
  const models = modelFields(database);
  const cards = result.map((row) => {
    const values = String(row[2]).split('\u001f'); const names = models.get(String(row[1]));
    return {
      sourceCardId: String(row[0]),
      front: field(values, names, 'front', 0),
      back: field(values, names, 'back', 1),
      reading: field(values, names, 'reading', 2) || undefined,
      furigana: field(values, names, 'furigana') || undefined,
      exampleSentence: field(values, names, 'exampleSentence') || undefined,
      exampleSentenceTranslation: field(values, names, 'exampleSentenceTranslation') || undefined,
      exampleSentenceFurigana: field(values, names, 'exampleSentenceFurigana') || undefined,
    };
  }).filter((card) => card.front && card.back);
  return validateCuratedCards(cards);
}

function modelFields(database: { exec(sql: string): Array<{ values: unknown[][] }> }) {
  try {
    const raw = database.exec('SELECT models FROM col')[0]?.values[0]?.[0] ?? '{}';
    const models = JSON.parse(String(raw)) as Record<string, AnkiModel>;
    return new Map(Object.entries(models).map(([id, model]) => [id, (model.flds ?? []).map((entry) => entry.name ?? '')]));
  } catch { return new Map<string, string[]>(); }
}
