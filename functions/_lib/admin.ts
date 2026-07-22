import { InvalidCuratedDeckError, validateCuratedCards, type CuratedCardInput } from '../../src/cloud/decks';
import { json } from './cloud';

export interface AdminDeckCard extends CuratedCardInput {}

export function adminId(request: Request, collection: 'decks' | 'saves'): string | null {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const index = parts.lastIndexOf(collection);
  const value = index === -1 ? undefined : parts[index + 1];
  return value && value !== 'rotate' && value !== 'preview' ? decodeURIComponent(value) : null;
}

export function validLabel(value: unknown): string | null {
  const label = typeof value === 'string' ? value.trim() : '';
  return label.length >= 1 && label.length <= 120 ? label : null;
}

export function deckCards(value: unknown): AdminDeckCard[] | Response {
  if (!Array.isArray(value)) return json({ error: 'invalid_cards' }, { status: 400 });
  try {
    return validateCuratedCards(value.map((card) => ({
      sourceCardId: typeof card?.sourceCardId === 'string' ? card.sourceCardId : '',
      newPosition: typeof card?.newPosition === 'number' ? card.newPosition : undefined,
      profile: typeof card?.profile === 'string' ? card.profile as never : undefined,
      fields: card?.fields && typeof card.fields === 'object' && !Array.isArray(card.fields)
        ? Object.fromEntries(Object.entries(card.fields).filter(([, value]) => typeof value === 'string')) as Record<string, string> : undefined,
      front: typeof card?.front === 'string' ? card.front : '',
      back: typeof card?.back === 'string' ? card.back : '',
      reading: typeof card?.reading === 'string' ? card.reading : undefined,
      furigana: typeof card?.furigana === 'string' ? card.furigana : undefined,
      exampleSentence: typeof card?.exampleSentence === 'string' ? card.exampleSentence : undefined,
      exampleSentenceTranslation: typeof card?.exampleSentenceTranslation === 'string' ? card.exampleSentenceTranslation : undefined,
      exampleSentenceFurigana: typeof card?.exampleSentenceFurigana === 'string' ? card.exampleSentenceFurigana : undefined,
    })));
  } catch (error) {
    return json({ error: 'invalid_cards', message: error instanceof InvalidCuratedDeckError ? error.message : 'Invalid cards' }, { status: 400 });
  }
}

export function isHttpResponse(value: unknown): value is Response { return value instanceof Response; }
