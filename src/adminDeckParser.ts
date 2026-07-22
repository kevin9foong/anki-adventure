import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { ankiField, type AnkiFieldConcept } from './ankiFields';
import { cardContent, type DeckProfileId } from './deckMapper';
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
    if (names?.includes('Jlab-Kanji')) return profiledCard(String(row[0]), values, names, 'jlab');
    if (names?.includes('Word') && names.includes('Word Meaning')) return profiledCard(String(row[0]), values, names, 'kaishi');
    return {
      sourceCardId: String(row[0]),
      profile: 'simple' as const,
      fields: {
        front: field(values, names, 'front', 0), back: field(values, names, 'back', 1), reading: field(values, names, 'reading', 2),
        furigana: field(values, names, 'furigana'), exampleSentence: field(values, names, 'exampleSentence'),
        exampleSentenceTranslation: field(values, names, 'exampleSentenceTranslation'), exampleSentenceFurigana: field(values, names, 'exampleSentenceFurigana'),
      },
    };
  }).filter((card) => {
    const content = cardContent(card.profile ?? 'simple', card.fields ?? {});
    return content.prompt.length > 0 && content.answer.length > 0;
  });
  return validateCuratedCards(cards);
}

/**
 * Preserve source fields and profile. The shared domain materializer decides
 * which fields become prompt/answer sections for both local and cloud play.
 */
function profiledCard(sourceCardId: string, values: string[], names: string[], profile: DeckProfileId): CuratedCardInput {
  return { sourceCardId, profile, fields: Object.fromEntries(names.map((name, index) => [name, values[index] ?? ''])) };
}

function modelFields(database: { exec(sql: string): Array<{ values: unknown[][] }> }) {
  try {
    const raw = database.exec('SELECT models FROM col')[0]?.values[0]?.[0] ?? '{}';
    const models = JSON.parse(String(raw)) as Record<string, AnkiModel>;
    return new Map(Object.entries(models).map(([id, model]) => [id, (model.flds ?? []).map((entry) => entry.name ?? '')]));
  } catch { return new Map<string, string[]>(); }
}
