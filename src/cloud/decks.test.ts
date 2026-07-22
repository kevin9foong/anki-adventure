import { describe, expect, it } from 'vitest';
import { InvalidCuratedDeckError, nextCloudCard, parseCuratedCsv, queueCloudCards } from './decks';

describe('curated deck publishing', () => {
  it('normalizes recognized CSV fields while retaining the publisher supplied stable IDs', () => {
    expect(parseCuratedCsv('id,Word,Meaning,Reading\nlesson-01,猫,cat,ねこ')).toMatchObject([
      { sourceCardId: 'lesson-01', profile: 'simple', fields: { front: '猫', back: 'cat', reading: 'ねこ' } },
    ]);
  });

  it('rejects an unsafe CSV publish without stable source IDs', () => {
    expect(() => parseCuratedCsv('Word,Meaning\n猫,cat')).toThrow(InvalidCuratedDeckError);
    expect(() => parseCuratedCsv('id,front,back\nsame,猫,cat\nsame,犬,dog')).toThrow('Duplicate source card ID: same');
  });
});

describe('cloud deck queue', () => {
  it('makes selected cards without a progress row available as implicit new cards', () => {
    const cards = queueCloudCards({
      selectedDeckIds: ['core'],
      cards: [{ deckId: 'core', sourceCardId: 'one', front: '猫', back: 'cat' }],
      progress: [],
      now: new Date('2026-07-20T12:00:00.000Z'),
      dailyNewLimit: 1,
    });

    expect(cards).toMatchObject([{ id: 'core:one', deckId: 'core', sourceCardId: 'one', state: 'new' }]);
  });

  it('prioritizes learning and due cards across selected decks before the shared new allowance', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const input = {
      selectedDeckIds: ['core', 'travel'],
      cards: [
        { deckId: 'core', sourceCardId: 'due', front: '猫', back: 'cat' },
        { deckId: 'travel', sourceCardId: 'new', front: '駅', back: 'station' },
      ],
      progress: [{ deckId: 'core', sourceCardId: 'due', state: 'review' as const, dueAt: '2026-07-20T11:00:00.000Z', introducedOn: '2026-07-01', intervalDays: 5 }],
      now,
      dailyNewLimit: 1,
    };

    expect(nextCloudCard(input)).toMatchObject({ deckId: 'core', sourceCardId: 'due' });
    expect(nextCloudCard({ ...input, selectedDeckIds: ['travel'] })).toMatchObject({ deckId: 'travel', sourceCardId: 'new' });
  });

  it('keeps identical content deck-scoped and restores its progress after reselecting a deck', () => {
    const input = {
      selectedDeckIds: ['core', 'travel'],
      cards: [
        { deckId: 'core', sourceCardId: 'cat', front: '猫', back: 'cat' },
        { deckId: 'travel', sourceCardId: 'cat', front: '猫', back: 'cat' },
      ],
      progress: [{ deckId: 'core', sourceCardId: 'cat', state: 'review' as const, dueAt: '2026-07-21T12:00:00.000Z', introducedOn: '2026-07-01', intervalDays: 21 }],
      now: new Date('2026-07-20T12:00:00.000Z'), dailyNewLimit: 5,
    };

    expect(queueCloudCards(input)).toMatchObject([
      { id: 'core:cat', state: 'review', intervalDays: 21 },
      { id: 'travel:cat', state: 'new', intervalDays: 0 },
    ]);
    expect(queueCloudCards({ ...input, selectedDeckIds: ['travel'] })).toHaveLength(1);
    expect(queueCloudCards(input)[0]).toMatchObject({ state: 'review', intervalDays: 21 });
  });

  it('uses one selected-set new allowance and chooses equal urgency ties deck-first', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const input = {
      selectedDeckIds: ['core', 'travel'],
      cards: [
        { deckId: 'core', sourceCardId: 'due-1', front: '一', back: 'one' },
        { deckId: 'core', sourceCardId: 'due-2', front: '二', back: 'two' },
        { deckId: 'travel', sourceCardId: 'due', front: '駅', back: 'station' },
        { deckId: 'travel', sourceCardId: 'new', front: '海', back: 'sea' },
        { deckId: 'travel', sourceCardId: 'old-new', front: '山', back: 'mountain' },
      ],
      progress: [
        ...['due-1', 'due-2'].map((sourceCardId) => ({ deckId: 'core', sourceCardId, state: 'review' as const, dueAt: '2026-07-20T11:00:00.000Z', introducedOn: '2026-07-01', intervalDays: 2 })),
        { deckId: 'travel', sourceCardId: 'due', state: 'review' as const, dueAt: '2026-07-20T11:00:00.000Z', introducedOn: '2026-07-01', intervalDays: 2 },
        { deckId: 'travel', sourceCardId: 'old-new', state: 'learning' as const, dueAt: '2026-07-21T12:00:00.000Z', introducedOn: '2026-07-20', intervalDays: 0 },
      ],
      now, dailyNewLimit: 1,
    };

    expect(nextCloudCard({ ...input, random: () => 0.9 })).toMatchObject({ deckId: 'travel', sourceCardId: 'due' });
    expect(nextCloudCard({ ...input, selectedDeckIds: ['travel'] })).toMatchObject({ sourceCardId: 'due' });
    expect(nextCloudCard({ ...input, selectedDeckIds: ['travel'], progress: input.progress.filter((entry) => entry.sourceCardId !== 'due') })).toBeUndefined();
  });

  it('introduces curated cards in publisher order, independent of their source IDs', () => {
    const input = {
      selectedDeckIds: ['core'],
      cards: [
        { deckId: 'core', sourceCardId: 'z-last', newPosition: 2, front: '三', back: 'three' },
        { deckId: 'core', sourceCardId: 'a-first', newPosition: 0, front: '一', back: 'one' },
        { deckId: 'core', sourceCardId: 'm-middle', newPosition: 1, front: '二', back: 'two' },
      ],
      progress: [], now: new Date('2026-07-20T12:00:00.000Z'), dailyNewLimit: 1,
    };

    expect(nextCloudCard(input)).toMatchObject({ sourceCardId: 'a-first' });
  });
});
