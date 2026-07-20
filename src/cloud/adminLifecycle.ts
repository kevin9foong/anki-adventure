export interface DeckCardText {
  vocabulary: string
  meaning: string
  reading?: string
  furigana?: string
  example?: string
}

export interface DeckCard {
  sourceCardId: string
  text: DeckCardText
}

export interface DeckUpdatePreview {
  added: number
  changed: number
  retained: number
  removed: number
  removedSourceCardIds: string[]
}

export interface DeckUpdateImpact extends DeckUpdatePreview {
  affectedSaves: number
  affectedProgress: number
}

export interface AdminLifecycleRepository {
  transaction<T>(work: (repository: this) => Promise<T>): Promise<T>
  getDeckCards(deckId: string): Promise<DeckCard[]>
  countSelectedSaves(deckId: string): Promise<number>
  countProgressForCards(deckId: string, sourceCardIds: string[]): Promise<number>
  replaceDeckCardsAndDeleteProgress?(update: PublishedDeckUpdate): Promise<void>
  /** Removes the deck, every save selection of it, and its progress rows in one transaction. */
  deleteDeckAndDependentState?(deckId: string): Promise<void>
  relabelSave?(saveId: string, label: string): Promise<void>
  /** Generates and persists a replacement token; raw URL is returned exactly once to the admin action. */
  rotateSaveToken?(saveId: string): Promise<RotatedSaveLink>
  /** Removes one save and its owned state, without touching published deck content. */
  deleteSaveAndDependentState?(saveId: string): Promise<void>
}

export interface RotatedSaveLink {
  saveUrl: string
}

export interface PublishedDeckUpdate {
  deckId: string
  displayName: string
  cards: DeckCard[]
  /** Source-card IDs whose memberships and dependent progress are deleted. */
  removedSourceCardIds: string[]
}

export interface PublishDeckUpdateInput {
  deckId: string
  displayName: string
  cards: DeckCard[]
  confirmDestructive?: boolean
}

export interface DeckDeletionImpact {
  affectedSaves: number
  affectedProgress: number
}

function sameText(left: DeckCardText, right: DeckCardText): boolean {
  return left.vocabulary === right.vocabulary
    && left.meaning === right.meaning
    && left.reading === right.reading
    && left.furigana === right.furigana
    && left.example === right.example
}

function assertUniqueSourceCardIds(cards: DeckCard[]): void {
  const sourceCardIds = new Set<string>()
  for (const card of cards) {
    if (card.sourceCardId.length === 0) throw new Error('Every deck card requires a stable source-card ID')
    if (sourceCardIds.has(card.sourceCardId)) throw new Error('Deck source-card IDs must be unique')
    sourceCardIds.add(card.sourceCardId)
  }
}

export function previewDeckUpdate(existing: DeckCard[], replacement: DeckCard[]): DeckUpdatePreview {
  assertUniqueSourceCardIds(existing)
  assertUniqueSourceCardIds(replacement)
  const previousBySourceCardId = new Map(existing.map((card) => [card.sourceCardId, card]))
  const nextBySourceCardId = new Map(replacement.map((card) => [card.sourceCardId, card]))
  let added = 0
  let changed = 0
  let retained = 0

  for (const card of replacement) {
    const previous = previousBySourceCardId.get(card.sourceCardId)
    if (!previous) added += 1
    else if (sameText(previous.text, card.text)) retained += 1
    else changed += 1
  }

  const removedSourceCardIds = existing
    .filter((card) => !nextBySourceCardId.has(card.sourceCardId))
    .map((card) => card.sourceCardId)

  return { added, changed, retained, removed: removedSourceCardIds.length, removedSourceCardIds }
}

export class AdminLifecycleService {
  constructor(private readonly repository: AdminLifecycleRepository) {}

  async previewDeckUpdate(deckId: string, replacement: DeckCard[]): Promise<DeckUpdateImpact> {
    const existing = await this.repository.getDeckCards(deckId)
    const preview = previewDeckUpdate(existing, replacement)
    const [affectedSaves, affectedProgress] = await Promise.all([
      this.repository.countSelectedSaves(deckId),
      preview.removed === 0
        ? Promise.resolve(0)
        : this.repository.countProgressForCards(deckId, preview.removedSourceCardIds),
    ])
    return { ...preview, affectedSaves, affectedProgress }
  }

  async publishDeckUpdate(input: PublishDeckUpdateInput): Promise<DeckUpdateImpact> {
    const preview = await this.previewDeckUpdate(input.deckId, input.cards)
    if (preview.removed > 0 && !input.confirmDestructive) {
      throw new Error('Destructive deck updates require explicit confirmation')
    }

    await this.repository.transaction(async (repository) => {
      const current = await repository.getDeckCards(input.deckId)
      const currentPreview = previewDeckUpdate(current, input.cards)
      if (currentPreview.removed > 0 && !input.confirmDestructive) {
        throw new Error('Destructive deck updates require explicit confirmation')
      }
      const replace = repository.replaceDeckCardsAndDeleteProgress
      if (!replace) throw new Error('Repository does not support deck publication')
      await replace.call(repository, {
        deckId: input.deckId,
        displayName: input.displayName,
        cards: input.cards,
        removedSourceCardIds: currentPreview.removedSourceCardIds,
      })
    })
    return preview
  }

  async previewDeckDeletion(deckId: string): Promise<DeckDeletionImpact> {
    const cards = await this.repository.getDeckCards(deckId)
    const [affectedSaves, affectedProgress] = await Promise.all([
      this.repository.countSelectedSaves(deckId),
      this.repository.countProgressForCards(deckId, cards.map((card) => card.sourceCardId)),
    ])
    return { affectedSaves, affectedProgress }
  }

  async deleteDeck(deckId: string, confirmDestructive = false): Promise<DeckDeletionImpact> {
    const impact = await this.previewDeckDeletion(deckId)
    if (!confirmDestructive) throw new Error('Destructive deck deletion requires explicit confirmation')
    await this.repository.transaction((repository) => {
      const remove = repository.deleteDeckAndDependentState
      if (!remove) throw new Error('Repository does not support deck deletion')
      return remove.call(repository, deckId)
    })
    return impact
  }

  async relabelSave(saveId: string, label: string): Promise<void> {
    if (label.trim().length === 0) throw new Error('Cloud-save label cannot be empty')
    const relabel = this.repository.relabelSave
    if (!relabel) throw new Error('Repository does not support cloud-save relabelling')
    await relabel.call(this.repository, saveId, label)
  }

  async rotateSaveToken(saveId: string): Promise<RotatedSaveLink> {
    const rotate = this.repository.rotateSaveToken
    if (!rotate) throw new Error('Repository does not support cloud-save token rotation')
    return rotate.call(this.repository, saveId)
  }

  async deleteSave(saveId: string, confirmDestructive = false): Promise<void> {
    if (!confirmDestructive) throw new Error('Destructive cloud-save deletion requires explicit confirmation')
    await this.repository.transaction((repository) => {
      const remove = repository.deleteSaveAndDependentState
      if (!remove) throw new Error('Repository does not support cloud-save deletion')
      return remove.call(repository, saveId)
    })
  }
}
