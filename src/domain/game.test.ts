import { describe, expect, it } from 'vitest';
import { applyGrade, cardCounts, catchChance, damageForGrade, effectiveNewCardLimit, encounterLevel, initialMonster, nextBattleCard, nextCard, placeCaught, resolveEnemyDamage, rollDailyNewLimit, scheduleCard, studyDayKey, totalXpForLevel } from './game';

describe('battle rules', () => {
  it('turns self-grades into the locked damage multipliers', () => {
    expect(damageForGrade(20, 'again')).toBe(6);
    expect(damageForGrade(20, 'hard')).toBe(10);
    expect(damageForGrade(20, 'good')).toBe(20);
    expect(damageForGrade(20, 'easy')).toBe(30);
    expect(resolveEnemyDamage(1)).toBe(1);
  });

  it('uses the locked catch chance and HP modifier', () => {
    expect(catchChance('easy', 25, 100)).toBe(0.55);
    expect(catchChance('good', 100, 100)).toBeCloseTo(0.0875);
  });

  it('keeps an encounter level fixed inside the living-party range', () => {
    expect(encounterLevel([{ level: 2, currentHp: 1 }, { level: 5, currentHp: 0 }], () => 0.9)).toBe(7);
  });

  it('grows monsters on the medium-fast curve', () => {
    expect(totalXpForLevel(4)).toBe(64);
    const monster = initialMonster('tanuki', 1);
    const result = applyGrade(monster, 100, 'easy');
    expect(result.monster.level).toBeGreaterThan(1);
  });
});

describe('party storage', () => {
  it('places a catch in the party and then storage without losing the monster', () => {
    const caught = initialMonster('uzu');
    expect(placeCaught([initialMonster('tanuki')], [], caught).party).toHaveLength(2);
    const fullParty = Array.from({ length: 6 }, () => initialMonster('tanuki'));
    const placed = placeCaught(fullParty, [], caught);
    expect(placed.party).toHaveLength(6);
    expect(placed.storage).toEqual([caught]);
  });
});

describe('card queue', () => {
  it('shows today’s new allowance, learning/relearning, and review queues', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const cards = [
      { id: 'new-1', front: '猫', back: 'cat', state: 'new' as const, dueAt: null, introducedOn: null, intervalDays: 0 },
      { id: 'new-2', front: '本', back: 'book', state: 'new' as const, dueAt: null, introducedOn: null, intervalDays: 0 },
      { id: 'new-3', front: '雨', back: 'rain', state: 'new' as const, dueAt: null, introducedOn: null, intervalDays: 0 },
      { id: 'learning-due', front: '犬', back: 'dog', state: 'learning' as const, dueAt: '2026-07-19T11:59:00Z', introducedOn: '2026-07-19', intervalDays: 0 },
      { id: 'learning-later', front: '鳥', back: 'bird', state: 'learning' as const, dueAt: '2026-07-19T23:59:00Z', introducedOn: '2026-07-19', intervalDays: 0 },
      { id: 'review-due', front: '魚', back: 'fish', state: 'review' as const, dueAt: '2026-07-19T12:00:00Z', introducedOn: '2026-07-01', intervalDays: 4 },
      { id: 'review-later', front: '空', back: 'sky', state: 'review' as const, dueAt: '2026-07-20T12:00:00Z', introducedOn: '2026-07-01', intervalDays: 4 },
    ];

    expect(cardCounts(cards, now, 3)).toEqual({ new: 1, learning: 1, review: 1 });
  });

  it('uses Anki’s learn-ahead window for red and the whole study day for green', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const cards = [
      { id: 'learning-now', front: '犬', back: 'dog', state: 'learning' as const, dueAt: '2026-07-19T11:00:00Z', introducedOn: '2026-07-19', intervalDays: 0 },
      { id: 'learning-later', front: '鳥', back: 'bird', state: 'learning' as const, dueAt: '2026-07-19T13:00:00Z', introducedOn: '2026-07-19', intervalDays: 0 },
      { id: 'review-now', front: '魚', back: 'fish', state: 'review' as const, dueAt: '2026-07-19T11:00:00Z', introducedOn: '2026-07-01', intervalDays: 4 },
      { id: 'review-later', front: '空', back: 'sky', state: 'review' as const, dueAt: '2026-07-19T13:00:00Z', introducedOn: '2026-07-01', intervalDays: 4 },
    ];

    expect(cardCounts(cards, now, 5)).toEqual({ new: 0, learning: 1, review: 2 });
  });

  it('starts a battle with a learning card shown in the red learn-ahead count', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const cards = [
      { id: 'learning-soon', front: '鳥', back: 'bird', state: 'learning' as const, dueAt: '2026-07-19T12:10:00Z', introducedOn: '2026-07-19', intervalDays: 0 },
    ];

    expect(cardCounts(cards, now, 5).learning).toBe(1);
    expect(nextCard(cards, now, 5)?.id).toBe('learning-soon');
  });

  it('rolls daily limits over at Anki’s local 04:00 study-day boundary', () => {
    expect(studyDayKey(new Date('2026-07-19T03:59:00Z'), 4)).toBe('2026-07-18');
    expect(studyDayKey(new Date('2026-07-19T04:00:00Z'), 4)).toBe('2026-07-19');
  });

  it('keeps a saved daily setting, while expiring only the temporary Custom Study increase', () => {
    expect(effectiveNewCardLimit(10, 5)).toBe(15);
    expect(effectiveNewCardLimit(0, 5)).toBe(5);
    expect(effectiveNewCardLimit(0, 0)).toBe(0);
    expect(rollDailyNewLimit('2026-07-19', 5, new Date('2026-07-19T12:00:00Z'))).toEqual({ limitDate: '2026-07-19', extraNewCardsToday: 5 });
    expect(rollDailyNewLimit('2026-07-19', 5, new Date('2026-07-20T04:00:00Z'))).toEqual({ limitDate: '2026-07-20', extraNewCardsToday: 0 });
  });

  it('recalculates the blue counter as the saved daily setting changes', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const cards = Array.from({ length: 10 }, (_, index) => ({ id: `new-${index}`, front: '猫', back: 'cat', state: 'new' as const, dueAt: null, introducedOn: index < 3 ? '2026-07-19' : null, intervalDays: 0 }));
    expect(cardCounts(cards, now, effectiveNewCardLimit(5)).new).toBe(2);
    expect(cardCounts(cards, now, effectiveNewCardLimit(10)).new).toBe(7);
    expect(cardCounts(cards, now, effectiveNewCardLimit(5, 5)).new).toBe(7);
  });

  it('prefers overdue cards and only offers allowed new cards once due work is empty', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const cards = [
      { id: 'new', front: '猫', back: 'cat', state: 'new' as const, dueAt: null, introducedOn: null, intervalDays: 0 },
      { id: 'due', front: '犬', back: 'dog', state: 'review' as const, dueAt: '2026-07-18T12:00:00Z', introducedOn: '2026-07-18', intervalDays: 4 },
    ];
    expect(nextCard(cards, now, 10)?.id).toBe('due');
    expect(nextCard([cards[0]], now, 0)).toBeUndefined();
    expect(nextCard([cards[0]], now, 10)?.id).toBe('new');
  });

  it('schedules a graded card with FSRS state and a future due date', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const card = { id: 'card', front: '空', back: 'sky', state: 'new' as const, dueAt: null, introducedOn: null, intervalDays: 0 };
    const updated = scheduleCard(card, 'good', now);
    expect(updated.reps).toBe(1);
    expect(updated.dueAt).not.toBeNull();
    expect(new Date(updated.dueAt!).getTime()).toBeGreaterThan(now.getTime());
    expect(updated.stability).toBeGreaterThan(0);
    expect(updated.lastReviewedAt).toBe(now.toISOString());
    expect(updated.learningSteps).toBeGreaterThanOrEqual(0);
  });

  it('retains the FSRS lapse and review timestamp needed for later answers', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const lapsed = scheduleCard({ id: 'review', front: '空', back: 'sky', state: 'review', dueAt: '2026-07-18T04:00:00Z', introducedOn: '2026-01-01', intervalDays: 30, reps: 8, lapses: 2, stability: 30, difficulty: 5, lastReviewedAt: '2026-06-18T12:00:00Z' }, 'again', now);
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(3);
    expect(lapsed.lastReviewedAt).toBe(now.toISOString());
  });

  it('moves a continuing battle to another available card after a review', () => {
    const now = new Date('2026-07-19T12:00:00Z');
    const cards = [
      { id: 'reviewed', front: '海', back: 'sea', state: 'review' as const, dueAt: '2026-07-19T11:00:00Z', introducedOn: '2026-07-18', intervalDays: 4 },
      { id: 'next', front: '山', back: 'mountain', state: 'new' as const, dueAt: null, introducedOn: null, intervalDays: 0 },
    ];

    expect(nextBattleCard(cards, 'reviewed', now, 10)?.id).toBe('next');
  });
});
