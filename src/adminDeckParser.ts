import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { validateCuratedCards, type CuratedCardInput } from './cloud/decks';

type AnkiModel = { flds?: Array<{ name?: string }> };
const clean = (text: string) => text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
const field = (fields: string[], names: string[] | undefined, aliases: string[], fallback?: number) => clean(names ? (fields[names.findIndex((name) => aliases.includes(normal(name)))] ?? '') : (fallback === undefined ? '' : fields[fallback] ?? ''));

/** Extracts only recognized text fields; APKG media is never uploaded by the admin route. */
export async function parseCuratedApkg(buffer: ArrayBuffer): Promise<CuratedCardInput[]> {
  const zip = await JSZip.loadAsync(buffer);
  const collection = zip.file('collection.anki21b') ?? zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!collection) throw new Error('This .apkg has no Anki collection database.');
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const database = new SQL.Database(new Uint8Array(await collection.async('arraybuffer')));
  const result = database.exec('SELECT id, mid, flds FROM notes')[0]?.values ?? [];
  const models = modelFields(database);
  const cards = result.map((row) => {
    const values = String(row[2]).split('\u001f'); const names = models.get(String(row[1]));
    return {
      sourceCardId: String(row[0]),
      front: field(values, names, ['word', 'front', 'expression', 'vocabulary', 'vocab', 'japanese', 'term'], 0),
      back: field(values, names, ['wordmeaning', 'meaning', 'back', 'definition', 'translation', 'english', 'englishmeaning'], 1),
      reading: field(values, names, ['wordreading', 'reading', 'pronunciation', 'kana'], 2) || undefined,
      furigana: field(values, names, ['wordfurigana', 'furigana']) || undefined,
      exampleSentence: field(values, names, ['sentence', 'examplesentence', 'sentencejapanese', 'japanesesentence']) || undefined,
      exampleSentenceTranslation: field(values, names, ['sentencemeaning', 'sentencetranslation', 'examplesentencemeaning', 'examplesentencetranslation', 'sentenceenglish', 'englishsentence']) || undefined,
      exampleSentenceFurigana: field(values, names, ['sentencefurigana', 'examplesentencefurigana']) || undefined,
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
