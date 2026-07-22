import { json, type CloudEnv, type FunctionContext } from '../../_lib/cloud';
import { authenticatedSave, conflict, expectedRevision, isResponse, requestJson } from '../../_lib/session';
import { cardContent, type DeckProfileId } from '../../../src/deckMapper';

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'PUT') return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET, PUT' } });
  const save = await authenticatedSave(context);
  if (isResponse(save)) return save;
  if (context.request.method === 'GET') return selectedDecks(context, save.id, save.revision);
  const body = await requestJson(context.request);
  if (isResponse(body)) return body;
  const revision = expectedRevision(body);
  if (isResponse(revision)) return revision;
  if (!Array.isArray(body.deckIds) || body.deckIds.some((id) => typeof id !== 'string') || body.deckIds.length > 100) return json({ error: 'invalid_deck_ids' }, { status: 400 });
  const deckIds = [...new Set(body.deckIds.map((id) => id.trim()))];
  if (deckIds.some((id) => !id)) return json({ error: 'invalid_deck_ids' }, { status: 400 });

  if (deckIds.length) {
    const placeholders = deckIds.map(() => '?').join(', ');
    const { results } = await context.env.DB.prepare(`SELECT id FROM curated_decks WHERE id IN (${placeholders})`).bind(...deckIds).all<{ id: string }>();
    if (results.length !== deckIds.length) return json({ error: 'deck_not_found' }, { status: 404 });
  }
  const nextRevision = revision + 1;
  const statements = [context.env.DB.prepare(`UPDATE cloud_saves SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?`)
    .bind(nextRevision, new Date().toISOString(), save.id, revision)];
  statements.push(context.env.DB.prepare(`DELETE FROM save_selected_decks WHERE save_id = ?
    AND EXISTS (SELECT 1 FROM cloud_saves WHERE id = ? AND revision = ? )`).bind(save.id, save.id, nextRevision));
  for (const deckId of deckIds) {
    statements.push(context.env.DB.prepare(`INSERT INTO save_selected_decks (save_id, deck_id)
      SELECT ?, ? WHERE EXISTS (SELECT 1 FROM cloud_saves WHERE id = ? AND revision = ?)`)
      .bind(save.id, deckId, save.id, nextRevision));
  }
  const results = await context.env.DB.batch<{ meta?: { changes?: number } }>(statements);
  if (!results[0]?.meta?.changes) return conflict();
  return json({ selectedDeckIds: deckIds, revision: nextRevision });
}

interface SelectedDeckRow {
  deck_id: string; display_name: string; source_card_id: string | null; new_position: number | null; profile: DeckProfileId | null; field_name: string | null; field_value: string | null;
  state: string | null; due_at: string | null; introduced_on: string | null; interval_days: number | null; stability: number | null; difficulty: number | null;
  reps: number | null; lapses: number | null; learning_steps: number | null; last_reviewed_at: string | null;
}

async function selectedDecks(context: FunctionContext<CloudEnv>, saveId: string, revision: number): Promise<Response> {
  const { results } = await context.env.DB.prepare(`SELECT d.id AS deck_id, d.display_name, c.source_card_id, c.new_position, c.profile, f.field_name, f.field_value,
    p.state, p.due_at, p.introduced_on, p.interval_days, p.stability, p.difficulty, p.reps, p.lapses, p.learning_steps, p.last_reviewed_at
    FROM save_selected_decks selected JOIN curated_decks d ON d.id = selected.deck_id
    LEFT JOIN deck_cards c ON c.deck_id = d.id LEFT JOIN deck_card_fields f ON f.deck_id = c.deck_id AND f.source_card_id = c.source_card_id LEFT JOIN cloud_card_progress p
      ON p.save_id = selected.save_id AND p.deck_id = c.deck_id AND p.source_card_id = c.source_card_id
    WHERE selected.save_id = ? ORDER BY d.display_name, c.new_position, c.source_card_id`).bind(saveId).all<SelectedDeckRow>();
  const decks = new Map<string, { id: string; displayName: string; cards: Array<{ sourceCardId: string; newPosition: number; profile: DeckProfileId; fields: Record<string, string>; progress: Record<string, unknown> | null }> }>();
  for (const row of results) {
    const deck = decks.get(row.deck_id) ?? { id: row.deck_id, displayName: row.display_name, cards: [] };
    if (row.source_card_id !== null) {
      let card = deck.cards.at(-1);
      if (!card || card.sourceCardId !== row.source_card_id) {
        card = { sourceCardId: row.source_card_id, newPosition: row.new_position!, profile: row.profile!, fields: {}, progress: row.state === null ? null : { state: row.state, dueAt: row.due_at, introducedOn: row.introduced_on, intervalDays: row.interval_days,
          stability: row.stability, difficulty: row.difficulty, reps: row.reps, lapses: row.lapses, learningSteps: row.learning_steps, lastReviewedAt: row.last_reviewed_at } };
        deck.cards.push(card);
      }
      if (row.field_name !== null && row.field_value !== null) card.fields[row.field_name] = row.field_value;
    }
    decks.set(row.deck_id, deck);
  }
  const { results: catalogue } = await context.env.DB.prepare(`SELECT d.id, d.display_name, COUNT(c.source_card_id) AS card_count
    FROM curated_decks d LEFT JOIN deck_cards c ON c.deck_id = d.id GROUP BY d.id ORDER BY d.display_name`).all<{ id: string; display_name: string; card_count: number }>();
  return json({ selectedDeckIds: [...decks.keys()], decks: [...decks.values()].map((deck) => ({ ...deck, cards: deck.cards.map((card) => ({ ...card, content: cardContent(card.profile, card.fields) })) })), catalogue: catalogue.map((deck) => ({ id: deck.id, displayName: deck.display_name, cardCount: deck.card_count })), revision });
}
