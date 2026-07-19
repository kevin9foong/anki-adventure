import { fsrs, Rating, State } from 'ts-fsrs';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export type CardState = 'new' | 'learning' | 'review';

export interface StudyCard {
  id: string;
  front: string;
  back: string;
  reading?: string;
  media?: string[];
  state: CardState;
  dueAt: string | null;
  introducedOn: string | null;
  intervalDays: number;
  stability?: number;
  difficulty?: number;
  reps?: number;
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
export const resolveEnemyDamage = (power: number) => Math.max(1, Math.round(power * 0.75));

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

export function nextCard(cards: StudyCard[], now: Date, dailyNewLimit: number): StudyCard | undefined {
  const due = cards.filter((card) => card.state !== 'new' && card.dueAt && new Date(card.dueAt).getTime() <= now.getTime());
  if (due.length) return due.sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())[0];
  const today = now.toISOString().slice(0, 10);
  const introducedToday = cards.filter((card) => card.introducedOn === today).length;
  return introducedToday < dailyNewLimit ? cards.find((card) => card.state === 'new') : undefined;
}

export function scheduleCard(card: StudyCard, grade: Grade, now = new Date()): StudyCard {
  const scheduler = fsrs({ enable_fuzz: false });
  const fsrsCard = {
    due: card.dueAt ?? now,
    stability: card.stability ?? 0,
    difficulty: card.difficulty ?? 0,
    elapsed_days: 0,
    scheduled_days: card.intervalDays,
    learning_steps: 0,
    reps: card.reps ?? 0,
    lapses: 0,
    state: card.state === 'new' ? State.New : card.state === 'learning' ? State.Learning : State.Review,
    last_review: card.dueAt ?? undefined,
  };
  const rating = ({ again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const)[grade];
  const result = scheduler.next(fsrsCard, now, rating).card;
  const intervalDays = Math.max(0, result.scheduled_days);
  return { ...card, state: result.state === State.Review ? 'review' : 'learning', introducedOn: card.introducedOn ?? now.toISOString().slice(0, 10), dueAt: result.due.toISOString(), intervalDays, reps: result.reps, stability: result.stability, difficulty: result.difficulty };
}

export const characterLevel = (cards: StudyCard[]) => Math.min(100, 1 + Math.floor(cards.filter((card) => card.state === 'review' && card.intervalDays >= 21).length / 20));
