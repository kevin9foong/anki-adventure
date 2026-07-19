import Dexie, { type Table } from 'dexie';
import type { Monster, StudyCard } from '../domain/game';

export interface SaveState {
  id: 'player';
  party: Monster[];
  storage: Monster[];
  activeIndex: number;
  /** Permanent deck-option value, equivalent to Anki's New cards/day. */
  dailyNewLimit: number;
  /** Study day on which the temporary Custom Study increase was made. */
  limitDate: string;
  /** Anki's "Increase today's new card limit" is temporary. */
  extraNewCardsToday?: number;
}
export interface MediaRecord { id: string; blob: Blob; }

class AdventureDb extends Dexie {
  cards!: Table<StudyCard, string>;
  saves!: Table<SaveState, string>;
  media!: Table<MediaRecord, string>;
  constructor() { super('anki-adventure'); this.version(1).stores({ cards: 'id, state, dueAt, introducedOn', saves: 'id', media: 'id' }); }
}
export const db = new AdventureDb();

export async function getSave(): Promise<SaveState | undefined> { return db.saves.get('player'); }
export async function saveGame(save: SaveState) { await db.saves.put(save); }
export async function exportBackup() { return { version: 1, exportedAt: new Date().toISOString(), save: await getSave(), cards: await db.cards.toArray() }; }
export async function restoreBackup(value: { save?: SaveState; cards?: StudyCard[] }) { await db.transaction('rw', db.cards, db.saves, async () => { await db.cards.clear(); if (value.cards) await db.cards.bulkPut(value.cards); if (value.save) await db.saves.put(value.save); }); }
