import type { StudyCardContent } from '../domain/game';

/** Returns the ordered sections visible at the current point in a review. */
export function visibleCardSections(content: StudyCardContent, answerRevealed: boolean) {
  return answerRevealed ? content.answer : content.prompt;
}
