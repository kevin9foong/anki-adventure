import { describe, expect, it } from 'vitest';
import { cloudStudyCard } from './studyCard';

describe('cloud StudyCard adapter', () => {
  it('retains the D1 new-card position for the shared scheduler', () => {
    const studyCard = cloudStudyCard('deck:card', { sourceCardId: 'card', newPosition: 17, content: { prompt: [{ text: '猫', emphasis: 'primary' }], answer: [{ text: 'cat', emphasis: 'supporting' }] }, progress: null });
    expect(studyCard.newPosition).toBe(17);
  });
});
