import { fsrs, GenSeedStrategyWithCardId, Rating, State, StrategyMode } from 'ts-fsrs';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
/** The four states used by Anki's v3 scheduler. */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

// Anki's default learn-ahead window. The red counter includes cards that will
// become available in this window, even if they are not answerable quite yet.
export const ANKI_LEARN_AHEAD_MINUTES = 20;
export const ANKI_DAY_CUTOFF_HOUR = 4;

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  reading?: string;
  furigana?: string;
  exampleSentence?: string;
  exampleSentenceTranslation?: string;
  exampleSentenceFurigana?: string;
  media?: string[];
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

export type SpeciesId = 'tanuki' | 'uzu' | 'mosslug' | 'sparkite';
export interface Monster {
  id: string;
  species: SpeciesId;
  name: string;
  level: number;
  xp: number;
  currentHp: number;
}

export const species: Record<SpeciesId, { name: string; baseHp: number; basePower: number; color: number; baseXp: number; habitat: string }> = {
  tanuki: { name: 'Tanukiwi', baseHp: 29, basePower: 9, color: 0xa66b43, baseXp: 45, habitat: 'starter' },
  uzu: { name: 'Uzumi', baseHp: 24, basePower: 12, color: 0x52c8db, baseXp: 42, habitat: 'Naruto water' },
  mosslug: { name: 'Mosslug', baseHp: 38, basePower: 6, color: 0x79a850, baseXp: 50, habitat: 'Mt. Bizan' },
  sparkite: { name: 'Awaflash', baseHp: 19, basePower: 15, color: 0xffcd4e, baseXp: 55, habitat: 'Tokushima route' },
};

export const maxHp = (monster: Pick<Monster, 'species' | 'level'>) => species[monster.species].baseHp + 10 * monster.level;
export const basePower = (monster: Pick<Monster, 'species' | 'level'>) => species[monster.species].basePower + 2 * monster.level;
export const totalXpForLevel = (level: number) => level ** 3;
export const damageForGrade = (power: number, grade: Grade) => Math.max(1, Math.round(power * ({ again: 0.3, hard: 0.5, good: 1, easy: 1.5 } as const)[grade]));
export const resolveEnemyDamage = (power: number, grade?: Grade) => grade === 'easy' ? 0 : Math.max(1, Math.round(power * 0.75 * (grade === 'good' ? 0.7 : 1)));

export function catchChance(grade: Grade, currentHp: number, enemyMaxHp: number) {
  const base = ({ again: 0.05, hard: 0.15, good: 0.35, easy: 0.55 } as const)[grade];
  const ratio = currentHp / enemyMaxHp;
  const hpModifier = ratio <= 0.25 ? 1 : ratio <= 0.5 ? 0.75 : ratio <= 0.75 ? 0.5 : 0.25;
  return base * hpModifier;
}

export function initialMonster(speciesId: SpeciesId, level = 1): Monster {
  const info = species[speciesId];
  return { id: `${speciesId}-${crypto.randomUUID()}`, species: speciesId, name: info.name, level, xp: totalXpForLevel(level), currentHp: info.baseHp + level * 10 };
}

export function placeCaught(party: Monster[], storage: Monster[], caught: Monster) {
  if (party.length < 6) return { party: [...party, caught], storage, placed: 'party' as const };
  if (storage.length < 100) return { party, storage: [...storage, caught], placed: 'storage' as const };
  return { party, storage, placed: 'full' as const };
}

export const partyIsDefeated = (party: Array<Pick<Monster, 'currentHp'>>) => party.every((monster) => monster.currentHp <= 0);

export const restoreParty = (party: Monster[]) => party.map((monster) => ({ ...monster, currentHp: maxHp(monster) }));

export function grantXp(monster: Monster, amount: number): Monster {
  const before = maxHp(monster);
  const xp = monster.xp + amount;
  let level = monster.level;
  while (level < 100 && xp >= totalXpForLevel(level + 1)) level++;
  const after = maxHp({ ...monster, level });
  return { ...monster, xp, level, currentHp: monster.currentHp === 0 ? 0 : Math.min(after, monster.currentHp + after - before) };
}

// Used by the game UI after a defeated enemy. The grade is intentionally accepted to keep this public API battle-turn shaped.
export function applyGrade(monster: Monster, enemyXp: number, _grade: Grade) { return { monster: grantXp(monster, enemyXp) }; }

export function encounterLevel(party: Array<Pick<Monster, 'level' | 'currentHp'>>, random = Math.random) {
  const living = party.filter((member) => member.currentHp > 0).map((member) => member.level);
  if (!living.length) return 1;
  const low = Math.min(...living);
  const high = Math.min(100, Math.max(...living) + 5);
  return low + Math.floor(random() * (high - low + 1));
}

/**
 * Anki's study day rolls over at 04:00 local time by default, not at UTC
 * midnight. Keeping this key with the save makes a daily cap survive reloads.
 */
export function studyDayKey(now: Date, cutoffHour = ANKI_DAY_CUTOFF_HOUR) {
  const day = new Date(now);
  if (day.getHours() < cutoffHour) day.setDate(day.getDate() - 1);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

export function nextStudyDayAt(now: Date, cutoffHour = ANKI_DAY_CUTOFF_HOUR) {
  const cutoff = new Date(now);
  cutoff.setHours(cutoffHour, 0, 0, 0);
  if (now.getTime() >= cutoff.getTime()) cutoff.setDate(cutoff.getDate() + 1);
  return cutoff;
}

/** The permanent deck option plus Anki Custom Study's temporary increase. */
export const effectiveNewCardLimit = (dailyNewLimit: number, extraNewCardsToday = 0) => Math.max(0, dailyNewLimit) + Math.max(0, extraNewCardsToday);

/** Custom Study increases expire on the next Anki study day; the deck option does not. */
export function rollDailyNewLimit(limitDate: string, extraNewCardsToday: number | undefined, now: Date) {
  const currentDate = studyDayKey(now);
  return limitDate === currentDate
    ? { limitDate, extraNewCardsToday: extraNewCardsToday ?? 0 }
    : { limitDate: currentDate, extraNewCardsToday: 0 };
}

const dueAtOrInfinity = (card: StudyCard) => card.dueAt ? new Date(card.dueAt).getTime() : Number.POSITIVE_INFINITY;
const byDueThenId = (a: StudyCard, b: StudyCard) => dueAtOrInfinity(a) - dueAtOrInfinity(b) || a.id.localeCompare(b.id);

/**
 * The order used by Anki's scheduler: intraday learning/relearning within the
 * learn-ahead window, then today's reviews, then the remaining new allowance.
 */
export function nextCard(cards: StudyCard[], now: Date, dailyNewLimit: number): StudyCard | undefined {
  const learnAhead = now.getTime() + ANKI_LEARN_AHEAD_MINUTES * 60_000;
  const intraday = cards.filter((card) => (card.state === 'learning' || card.state === 'relearning') && dueAtOrInfinity(card) <= learnAhead).sort(byDueThenId);
  if (intraday.length) return intraday[0];
  const reviews = cards.filter((card) => card.state === 'review' && dueAtOrInfinity(card) <= nextStudyDayAt(now).getTime()).sort(byDueThenId);
  if (reviews.length) return reviews[0];
  return cardCounts(cards, now, dailyNewLimit).new > 0 ? cards.filter((card) => card.state === 'new').sort((a, b) => a.id.localeCompare(b.id))[0] : undefined;
}

export function nextBattleCard(cards: StudyCard[], reviewedCardId: string, now: Date, dailyNewLimit: number): StudyCard | undefined {
  return nextCard(cards.filter((card) => card.id !== reviewedCardId), now, dailyNewLimit);
}

export function cardCounts(cards: StudyCard[], now: Date, dailyNewLimit: number) {
  const today = studyDayKey(now);
  const learnAhead = now.getTime() + ANKI_LEARN_AHEAD_MINUTES * 60_000;
  const endOfStudyDay = nextStudyDayAt(now).getTime();
  const introducedToday = cards.filter((card) => card.introducedOn === today).length;
  return {
    // These are queue counts, not a count of every card in each state.
    new: Math.min(cards.filter((card) => card.state === 'new').length, Math.max(0, dailyNewLimit - introducedToday)),
    learning: cards.filter((card) => (card.state === 'learning' || card.state === 'relearning') && dueAtOrInfinity(card) <= learnAhead).length,
    review: cards.filter((card) => card.state === 'review' && dueAtOrInfinity(card) <= endOfStudyDay).length,
  };
}

/** New cards first answered during the current Anki study day. */
export function newCardProgress(cards: StudyCard[], now: Date, allowance: number) {
  return { solved: cards.filter((card) => card.introducedOn === studyDayKey(now)).length, allowance };
}

export function scheduleCard(card: StudyCard, grade: Grade, now = new Date()): StudyCard {
  // These are Anki's stock FSRS settings: 90% desired retention, 1m/10m
  // learning, and 10m relearning. ts-fsrs implements FSRS-6 locally.
  const scheduler = fsrs({ request_retention: 0.9, maximum_interval: 36500, enable_fuzz: true, enable_short_term: true, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] });
  // Fuzz is part of Anki scheduling. Seed it from the card and repetition so a
  // reload cannot silently change a previously previewed interval.
  scheduler.useStrategy(StrategyMode.SEED, GenSeedStrategyWithCardId('id'));
  const fsrsCard = {
    id: card.id,
    due: card.dueAt ?? now,
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: card.intervalDays,
    learning_steps: card.learningSteps ?? 0,
    reps: card.reps ?? 0,
    lapses: card.lapses ?? 0,
    state: card.state === 'new' ? State.New : card.state === 'learning' ? State.Learning : card.state === 'relearning' ? State.Relearning : State.Review,
    last_review: card.lastReviewedAt ?? undefined,
  };
  const rating = ({ again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const)[grade];
  const result = scheduler.next(fsrsCard, now, rating).card;
  const intervalDays = Math.max(0, result.scheduled_days);
  const state: CardState = result.state === State.New ? 'new' : result.state === State.Learning ? 'learning' : result.state === State.Relearning ? 'relearning' : 'review';
  return { ...card, state, introducedOn: card.introducedOn ?? studyDayKey(now), dueAt: result.due.toISOString(), intervalDays, reps: result.reps, lapses: result.lapses, learningSteps: result.learning_steps, lastReviewedAt: result.last_review?.toISOString() ?? now.toISOString(), stability: result.stability, difficulty: result.difficulty };
}

export const characterLevel = (cards: StudyCard[]) => Math.min(100, 1 + Math.floor(cards.filter((card) => card.state === 'review' && card.intervalDays >= 21).length / 20));
