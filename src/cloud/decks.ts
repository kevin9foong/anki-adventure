import { cardContent, type DeckProfileId } from '../deckMapper';
import { ANKI_LEARN_AHEAD_MINUTES, nextStudyDayAt, studyDayKey, type CardState, type StudyCard } from '../domain/game';

export interface CuratedCardInput {
  sourceCardId: string;
  /** Zero-based source-deck position. The publisher's input sequence is used when omitted. */
  newPosition?: number;
  profile?: DeckProfileId;
  fields?: Record<string, string>;
  /** Transitional publisher input only; never persisted in D1. */
  front?: string;
  back?: string;
  reading?: string;
  furigana?: string;
  exampleSentence?: string;
  exampleSentenceTranslation?: string;
  exampleSentenceFurigana?: string;
}

export interface CuratedDeckCard extends CuratedCardInput { deckId: string; }

/** A progress row is deliberately absent until the selected card is introduced. */
export interface CloudCardProgress {
  deckId: string;
  sourceCardId: string;
  state: CardState;
  dueAt: string | null;
  introducedOn: string | null;
  intervalDays: number;
  stability?: number;
  difficulty?: number;
  reps?: number;
  lapses?: number;
  learningSteps?: number;
  lastReviewedAt?: string | null;
}

export type CloudQueueCard = CuratedDeckCard & Omit<StudyCard, 'front' | 'back'>;

export interface CloudQueueInput {
  selectedDeckIds: readonly string[];
  cards: readonly CuratedDeckCard[];
  progress: readonly CloudCardProgress[];
  now: Date;
  dailyNewLimit: number;
  random?: () => number;
}

export class InvalidCuratedDeckError extends Error {}

type CuratedTextField = 'front' | 'back' | 'reading' | 'furigana' | 'exampleSentence' | 'exampleSentenceTranslation' | 'exampleSentenceFurigana';
const aliases: Record<CuratedTextField, string[]> = {
  front: ['front', 'word', 'expression', 'vocabulary', 'vocab', 'japanese', 'term'],
  back: ['back', 'wordmeaning', 'meaning', 'definition', 'translation', 'english', 'englishmeaning'],
  reading: ['reading', 'wordreading', 'pronunciation', 'kana'],
  furigana: ['furigana', 'wordfurigana'],
  exampleSentence: ['sentence', 'examplesentence', 'sentencejapanese', 'japanesesentence'],
  exampleSentenceTranslation: ['sentencemeaning', 'sentencetranslation', 'examplesentencemeaning', 'examplesentencetranslation', 'sentenceenglish', 'englishsentence'],
  exampleSentenceFurigana: ['sentencefurigana', 'examplesentencefurigana'],
};

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const strip = (value: string) => value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Parse text-only CSV content accepted by the curated-deck publisher. */
export function parseCuratedCsv(text: string): CuratedCardInput[] {
  const rows = parseCsvRows(text);
  if (!rows.length) throw new InvalidCuratedDeckError('A curated CSV must contain a header and at least one card.');
  const headers = rows[0].map(normalizeHeader);
  const idIndex = headers.indexOf('id');
  if (idIndex === -1) throw new InvalidCuratedDeckError('A curated CSV requires an explicit stable id column.');
  const fieldIndex = (field: keyof typeof aliases) => headers.findIndex((header) => aliases[field].includes(header));
  const frontIndex = fieldIndex('front');
  const backIndex = fieldIndex('back');
  if (frontIndex === -1 || backIndex === -1) throw new InvalidCuratedDeckError('A curated CSV requires recognized front and back fields.');
  const optional = Object.fromEntries((Object.keys(aliases) as Array<keyof typeof aliases>).map((field) => [field, fieldIndex(field)])) as Record<keyof typeof aliases, number>;
  return validateCuratedCards(rows.slice(1).filter((row) => row.some((value) => value.trim())).map((row) => {
    const card: CuratedCardInput = { sourceCardId: row[idIndex] ?? '', profile: 'simple', fields: { front: row[frontIndex] ?? '', back: row[backIndex] ?? '' } };
    for (const field of Object.keys(aliases) as Array<keyof typeof aliases>) {
      if (field === 'front' || field === 'back') continue;
      const value = optional[field] === -1 ? '' : row[optional[field]] ?? '';
      if (strip(value)) card.fields![field] = strip(value);
    }
    return card;
  }));
}

/** Validates source identities before a deck is published or updated. */
export function validateCuratedCards(cards: CuratedCardInput[]): CuratedCardInput[] {
  const seen = new Set<string>();
  return cards.map((card) => {
    const sourceCardId = card.sourceCardId.trim();
    if (!sourceCardId) throw new InvalidCuratedDeckError('Every curated card requires a stable source card ID.');
    if (seen.has(sourceCardId)) throw new InvalidCuratedDeckError(`Duplicate source card ID: ${sourceCardId}`);
    seen.add(sourceCardId);
    const profile = card.profile ?? 'simple';
    if (!['simple', 'jlab', 'kaishi'].includes(profile)) throw new InvalidCuratedDeckError(`Card ${sourceCardId} has an invalid profile.`);
    const fields = Object.fromEntries(Object.entries(card.fields ?? {
      front: card.front ?? '', back: card.back ?? '', reading: card.reading ?? '', furigana: card.furigana ?? '',
      exampleSentence: card.exampleSentence ?? '', exampleSentenceTranslation: card.exampleSentenceTranslation ?? '', exampleSentenceFurigana: card.exampleSentenceFurigana ?? '',
    }).filter(([name, value]) => typeof name === 'string' && typeof value === 'string').map(([name, value]) => [name, strip(value)]).filter(([, value]) => Boolean(value)));
    const content = cardContent(profile, fields);
    if (!content.prompt.length || !content.answer.length) throw new InvalidCuratedDeckError(`Card ${sourceCardId} has no renderable prompt and answer.`);
    const normalized = { sourceCardId, ...(card.newPosition === undefined ? {} : { newPosition: card.newPosition }), profile, fields };
    return normalized;
  });
}


/**
 * Materializes the selected queue only. Missing progress is intentionally a
 * new card, so selecting a large deck needs no up-front progress writes.
 */
export function queueCloudCards(input: CloudQueueInput): CloudQueueCard[] {
  const selected = new Set(input.selectedDeckIds);
  const progress = new Map(input.progress.map((entry) => [progressKey(entry.deckId, entry.sourceCardId), entry]));
  return input.cards.filter((card) => selected.has(card.deckId)).map((card) => {
    const saved = progress.get(progressKey(card.deckId, card.sourceCardId));
    return {
      ...card,
      content: cardContent(card.profile ?? 'simple', card.fields ?? {}),
      id: cloudCardId(card.deckId, card.sourceCardId),
      state: saved?.state ?? 'new', dueAt: saved?.dueAt ?? null,
      introducedOn: saved?.introducedOn ?? null, intervalDays: saved?.intervalDays ?? 0,
      stability: saved?.stability, difficulty: saved?.difficulty, reps: saved?.reps,
      lapses: saved?.lapses, learningSteps: saved?.learningSteps, lastReviewedAt: saved?.lastReviewedAt,
    };
  });
}

/** Selects one combined cloud review with the game's learning → review → new order. */
export function nextCloudCard(input: CloudQueueInput): CloudQueueCard | undefined {
  const cards = queueCloudCards(input);
  const now = input.now.getTime();
  const dueAt = (card: CloudQueueCard) => card.dueAt ? new Date(card.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const choose = (candidates: CloudQueueCard[]) => chooseAcrossDecks(candidates, input.random ?? Math.random);
  const learning = cards.filter((card) => (card.state === 'learning' || card.state === 'relearning') && dueAt(card) <= now + ANKI_LEARN_AHEAD_MINUTES * 60_000);
  if (learning.length) return choose(earliest(learning, dueAt));
  const reviews = cards.filter((card) => card.state === 'review' && dueAt(card) <= nextStudyDayAt(input.now).getTime());
  if (reviews.length) return choose(earliest(reviews, dueAt));
  const introducedToday = cards.filter((card) => card.introducedOn === studyDayKey(input.now)).length;
  if (introducedToday >= Math.max(0, input.dailyNewLimit)) return undefined;
  const newCards = cards.filter((card) => card.state === 'new');
  const firstPosition = Math.min(...newCards.map((card) => card.newPosition ?? Number.POSITIVE_INFINITY));
  return choose(newCards.filter((card) => (card.newPosition ?? Number.POSITIVE_INFINITY) === firstPosition));
}

function earliest(cards: CloudQueueCard[], dueAt: (card: CloudQueueCard) => number) {
  const earliestDue = Math.min(...cards.map(dueAt));
  return cards.filter((card) => dueAt(card) === earliestDue);
}

function chooseAcrossDecks(cards: CloudQueueCard[], random: () => number) {
  if (!cards.length) return undefined;
  const deckIds = [...new Set(cards.map((card) => card.deckId))];
  const deckId = deckIds[Math.min(deckIds.length - 1, Math.floor(random() * deckIds.length))];
  const withinDeck = cards.filter((card) => card.deckId === deckId);
  return withinDeck[Math.min(withinDeck.length - 1, Math.floor(random() * withinDeck.length))];
}

/** A UI/scheduler ID; persistence identity remains the two explicit fields. */
export const cloudCardId = (deckId: string, sourceCardId: string) => `${encodeURIComponent(deckId)}:${encodeURIComponent(sourceCardId)}`;
const progressKey = (deckId: string, sourceCardId: string) => `${deckId}\u0000${sourceCardId}`;

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new InvalidCuratedDeckError('CSV contains an unterminated quoted field.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
