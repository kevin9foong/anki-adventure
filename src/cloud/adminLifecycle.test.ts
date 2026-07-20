import { describe, expect, it } from 'vitest'
import { AdminLifecycleService, previewDeckUpdate, type DeckCard } from './adminLifecycle'

describe('previewDeckUpdate', () => {
  it('classifies cards by stable source ID and treats text edits as retained progress', () => {
    const existing: DeckCard[] = [
      { sourceCardId: 'one', text: { vocabulary: '猫', meaning: 'cat' } },
      { sourceCardId: 'two', text: { vocabulary: '犬', meaning: 'dog' } },
    ]
    const replacement: DeckCard[] = [
      { sourceCardId: 'one', text: { vocabulary: '猫', meaning: 'feline' } },
      { sourceCardId: 'three', text: { vocabulary: '鳥', meaning: 'bird' } },
    ]

    expect(previewDeckUpdate(existing, replacement)).toMatchObject({
      added: 1,
      changed: 1,
      retained: 0,
      removed: 1,
      removedSourceCardIds: ['two'],
    })
  })

  it('rejects duplicate source-card IDs because update identity would be ambiguous', () => {
    expect(() => previewDeckUpdate([], [
      { sourceCardId: 'same', text: { vocabulary: '猫', meaning: 'cat' } },
      { sourceCardId: 'same', text: { vocabulary: '犬', meaning: 'dog' } },
    ])).toThrow('unique')
  })
})

describe('AdminLifecycleService', () => {
  it('reports destructive deck-update fan-out before publication', async () => {
    const service = new AdminLifecycleService({
      async transaction(work) { return work(this) },
      async getDeckCards() {
        return [
          { sourceCardId: 'kept', text: { vocabulary: '猫', meaning: 'cat' } },
          { sourceCardId: 'removed', text: { vocabulary: '犬', meaning: 'dog' } },
        ]
      },
      async countSelectedSaves() { return 3 },
      async countProgressForCards() { return 2 },
    })

    await expect(service.previewDeckUpdate('deck-1', [
      { sourceCardId: 'kept', text: { vocabulary: '猫', meaning: 'cat' } },
      { sourceCardId: 'added', text: { vocabulary: '鳥', meaning: 'bird' } },
    ])).resolves.toMatchObject({
      added: 1,
      retained: 1,
      removed: 1,
      affectedSaves: 3,
      affectedProgress: 2,
    })
  })

  it('requires confirmation before publishing a removal, then applies the replacement atomically', async () => {
    const writes: string[] = []
    const repository = {
      async transaction<T>(work: (repo: never) => Promise<T>) {
        writes.push('begin')
        const result = await work(this as never)
        writes.push('commit')
        return result
      },
      async getDeckCards() {
        return [
          { sourceCardId: 'kept', text: { vocabulary: '猫', meaning: 'cat' } },
          { sourceCardId: 'removed', text: { vocabulary: '犬', meaning: 'dog' } },
        ]
      },
      async countSelectedSaves() { return 1 },
      async countProgressForCards() { return 1 },
      async replaceDeckCardsAndDeleteProgress() { writes.push('replace') },
    }
    const service = new AdminLifecycleService(repository)
    const cards = [{ sourceCardId: 'kept', text: { vocabulary: '猫', meaning: 'cat' } }]

    await expect(service.publishDeckUpdate({ deckId: 'deck-1', displayName: 'Animals', cards }))
      .rejects.toThrow('confirmation')
    expect(writes).toEqual([])

    await service.publishDeckUpdate({ deckId: 'deck-1', displayName: 'Animals', cards, confirmDestructive: true })
    expect(writes).toEqual(['begin', 'replace', 'commit'])
  })

  it('shows deck deletion impact and removes only that deck after confirmation', async () => {
    const writes: string[] = []
    const repository = {
      async transaction<T>(work: (repo: never) => Promise<T>) {
        writes.push('begin')
        const result = await work(this as never)
        writes.push('commit')
        return result
      },
      async getDeckCards() { return [{ sourceCardId: 'one', text: { vocabulary: '猫', meaning: 'cat' } }] },
      async countSelectedSaves() { return 2 },
      async countProgressForCards() { return 4 },
      async replaceDeckCardsAndDeleteProgress() {},
      async deleteDeckAndDependentState(deckId: string) { writes.push(`delete:${deckId}`) },
    }
    const service = new AdminLifecycleService(repository)

    await expect(service.previewDeckDeletion('deck-1')).resolves.toEqual({ affectedSaves: 2, affectedProgress: 4 })
    await expect(service.deleteDeck('deck-1')).rejects.toThrow('confirmation')
    expect(writes).toEqual([])

    await service.deleteDeck('deck-1', true)
    expect(writes).toEqual(['begin', 'delete:deck-1', 'commit'])
  })

  it('relabels a cloud save without returning or replacing its bearer token', async () => {
    const updates: unknown[] = []
    const service = new AdminLifecycleService({
      async transaction<T>(work: (repo: never) => Promise<T>) { return work(this as never) },
      async getDeckCards() { return [] },
      async countSelectedSaves() { return 0 },
      async countProgressForCards() { return 0 },
      async replaceDeckCardsAndDeleteProgress() {},
      async deleteDeckAndDependentState() {},
      async relabelSave(saveId: string, label: string) { updates.push({ saveId, label }) },
    })

    await service.relabelSave('save-1', 'Keiko’s iPhone')
    expect(updates).toEqual([{ saveId: 'save-1', label: 'Keiko’s iPhone' }])
  })

  it('returns a replacement URL only from the authorized rotation action', async () => {
    const service = new AdminLifecycleService({
      async transaction<T>(work: (repo: never) => Promise<T>) { return work(this as never) },
      async getDeckCards() { return [] },
      async countSelectedSaves() { return 0 },
      async countProgressForCards() { return 0 },
      async replaceDeckCardsAndDeleteProgress() {},
      async deleteDeckAndDependentState() {},
      async relabelSave() {},
      async rotateSaveToken(saveId: string) {
        expect(saveId).toBe('save-1')
        return { saveUrl: 'https://game.example/?save=replacement-secret' }
      },
    })

    await expect(service.rotateSaveToken('save-1')).resolves.toEqual({
      saveUrl: 'https://game.example/?save=replacement-secret',
    })
  })

  it('does not delete a cloud save until confirmed and leaves other save IDs untouched', async () => {
    const deleted: string[] = []
    const service = new AdminLifecycleService({
      async transaction<T>(work: (repo: never) => Promise<T>) { return work(this as never) },
      async getDeckCards() { return [] },
      async countSelectedSaves() { return 0 },
      async countProgressForCards() { return 0 },
      async deleteSaveAndDependentState(saveId: string) { deleted.push(saveId) },
    })

    await expect(service.deleteSave('save-a')).rejects.toThrow('confirmation')
    expect(deleted).toEqual([])
    await service.deleteSave('save-a', true)
    expect(deleted).toEqual(['save-a'])
  })
})
