export type AnkiFieldConcept = 'front' | 'back' | 'reading' | 'furigana' | 'exampleSentence' | 'exampleSentenceTranslation' | 'exampleSentenceFurigana';

const aliases: Record<AnkiFieldConcept, string[]> = {
  front: ['word', 'front', 'expression', 'vocabulary', 'vocab', 'japanese', 'term', '文型', '単語', '語句'],
  back: ['wordmeaning', 'meaning', 'back', 'definition', 'translation', 'english', 'englishmeaning', '意味', '訳', '英訳'],
  reading: ['wordreading', 'reading', 'pronunciation', 'kana', '読み', 'よみ', '読み方'],
  furigana: ['wordfurigana', 'furigana', 'ふりがな', '振り仮名'],
  exampleSentence: ['sentence', 'examplesentence', 'sentencejapanese', 'japanesesentence', '例文'],
  exampleSentenceTranslation: ['sentencemeaning', 'sentencetranslation', 'examplesentencemeaning', 'examplesentencetranslation', 'sentenceenglish', 'englishsentence', '例文の意味', '例文訳'],
  exampleSentenceFurigana: ['sentencefurigana', 'examplesentencefurigana', '例文ふりがな'],
};

const normalizedAliases = new Map(Object.entries(aliases).map(([concept, names]) => [concept as AnkiFieldConcept, new Set(names.map(normalizeFieldName))]));

/** Finds a semantic Anki field regardless of the note type's display language. */
export function ankiField(fields: string[], names: string[] | undefined, concept: AnkiFieldConcept, fallback?: number): string {
  if (!names) return fallback === undefined ? '' : fields[fallback] ?? '';
  const index = names.findIndex((name) => matches(normalizeFieldName(name), concept));
  return index === -1 ? '' : fields[index] ?? '';
}

function matches(name: string, concept: AnkiFieldConcept): boolean {
  return normalizedAliases.get(concept)?.has(name) === true
    || (concept === 'exampleSentence' && (/^examplesentence\d+$/.test(name) || /^例文\d+$/.test(name)));
}

export function normalizeFieldName(name: string): string {
  return name.normalize('NFKC').toLocaleLowerCase().replace(/[\s_-]/g, '');
}
