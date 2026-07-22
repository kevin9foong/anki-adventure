import type { CardSection, CardSectionEmphasis, StudyCardContent } from './domain/game';

export interface ImportedNote {
  id: string;
  fields: Record<string, string>;
}

/** Import-only adapter: maps source field names into the app's generic card sections. */
export interface DeckProfile {
  prompt: DeckFieldMapping[];
  answer: DeckFieldMapping[];
}

export interface DeckFieldMapping {
  field: string;
  emphasis: CardSectionEmphasis;
}

export interface MappedCard {
  id: string;
  content: StudyCardContent;
}
export type DeckProfileId = 'jlab' | 'kaishi' | 'simple';

export const JLAB_DECK_PROFILE: DeckProfile = {
  prompt: [
    { field: 'Jlab-Kanji', emphasis: 'primary' },
    { field: 'RemarksFront', emphasis: 'detail' },
  ],
  answer: [
    { field: 'Other-Front', emphasis: 'primary' },
    { field: 'RemarksBack', emphasis: 'detail' },
  ],
};

export const KAISHI_DECK_PROFILE: DeckProfile = {
  prompt: [{ field: 'Word', emphasis: 'primary' }],
  answer: [
    { field: 'Word Furigana', emphasis: 'primary' },
    { field: 'Word Meaning', emphasis: 'supporting' },
    { field: 'Sentence Furigana', emphasis: 'supporting' },
    { field: 'Sentence Meaning', emphasis: 'supporting' },
  ],
};

export function materializeCard(id: string, profile: DeckProfileId, fields: Record<string, string>): MappedCard {
  if (profile === 'jlab') return mapNoteToCard({ id, fields }, JLAB_DECK_PROFILE);
  if (profile === 'kaishi') return mapNoteToCard({ id, fields }, KAISHI_DECK_PROFILE);
  return { id, content: { prompt: [{ text: clean(fields.front ?? ''), emphasis: 'primary' as const }].filter((section) => section.text), answer: [{ text: clean(fields.back ?? ''), emphasis: 'supporting' as const }, { text: clean(fields.reading ?? ''), emphasis: 'supporting' as const }].filter((section) => section.text) } };
}

/** The one domain boundary between stored source fields and study UI content. */
export function cardContent(profile: DeckProfileId, fields: Record<string, string>): StudyCardContent {
  return materializeCard('', profile, fields).content;
}

export function mapNoteToCard(note: ImportedNote, profile: DeckProfile): MappedCard {
  return {
    id: note.id,
    content: {
      prompt: mapSections(note.fields, profile.prompt),
      answer: mapSections(note.fields, profile.answer),
    },
  };
}

function mapSections(fields: Record<string, string>, mappings: DeckFieldMapping[]): CardSection[] {
  return mappings.map(({ field, emphasis }) => ({ text: clean(fields[field] ?? ''), emphasis })).filter((section) => Boolean(section.text));
}

function clean(value: string) {
  return value.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
