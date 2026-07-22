import type { StudyCard } from '../domain/game';
import type { CloudDeckCard } from './client';

/** Adapts cloud data into the same StudyCard shape used by local persistence. */
export function cloudStudyCard(id: string, card: CloudDeckCard): StudyCard {
  return {
    id, newPosition: card.newPosition, content: card.content,
    front: card.front, back: card.back, reading: card.reading, furigana: card.furigana,
    exampleSentence: card.exampleSentence, exampleSentenceTranslation: card.exampleSentenceTranslation, exampleSentenceFurigana: card.exampleSentenceFurigana,
    state: (card.progress?.state as StudyCard['state'] | undefined) ?? 'new', dueAt: (card.progress?.dueAt as string | null | undefined) ?? null,
    introducedOn: (card.progress?.introducedOn as string | null | undefined) ?? null, intervalDays: (card.progress?.intervalDays as number | undefined) ?? 0,
    stability: card.progress?.stability as number | undefined, difficulty: card.progress?.difficulty as number | undefined,
    reps: card.progress?.reps as number | undefined, lapses: card.progress?.lapses as number | undefined,
    learningSteps: card.progress?.learningSteps as number | undefined, lastReviewedAt: card.progress?.lastReviewedAt as string | null | undefined,
  };
}
