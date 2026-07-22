import { adminId, deckCards, isHttpResponse, validLabel } from '../../../_lib/admin';
import { batchD1Statements, isAdmin, json, type CloudEnv, type FunctionContext, unauthorized } from '../../../_lib/cloud';
import { requestJson } from '../../../_lib/session';
import { cardContent, type DeckProfileId } from '../../../../src/deckMapper';

interface DeckCardFieldRow { source_card_id: string; new_position: number; profile: DeckProfileId; field_name: string | null; field_value: string | null; }
interface DeckCardRow { source_card_id: string; new_position: number; profile: DeckProfileId; fields: Record<string, string>; }
const impact = (added: number, changed: number, retained: number, removed: string[], affectedSaves: number, affectedProgress: number) => ({ added, changed, retained, removed: removed.length, removedSourceCardIds: removed, affectedSaves, affectedProgress });

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (!isAdmin(context.request, context.env)) return unauthorized();
  const deckId = adminId(context.request, 'decks'); if (!deckId) return json({ error: 'deck_not_found' }, { status: 404 });
  if (context.request.method === 'GET') return get(context, deckId);
  if (context.request.method === 'PATCH') return update(context, deckId);
  if (context.request.method === 'DELETE') return remove(context, deckId);
  return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET, PATCH, DELETE' } });
}

async function rows(context: FunctionContext<CloudEnv>, deckId: string) {
  const { results } = await context.env.DB.prepare(`SELECT c.source_card_id, c.new_position, c.profile, f.field_name, f.field_value
    FROM deck_cards c LEFT JOIN deck_card_fields f ON f.deck_id = c.deck_id AND f.source_card_id = c.source_card_id
    WHERE c.deck_id = ? ORDER BY c.new_position, c.source_card_id, f.field_name`).bind(deckId).all<DeckCardFieldRow>();
  const cards = new Map<string, DeckCardRow>();
  for (const row of results) {
    const card = cards.get(row.source_card_id) ?? { source_card_id: row.source_card_id, new_position: row.new_position, profile: row.profile, fields: {} };
    if (row.field_name !== null && row.field_value !== null) card.fields[row.field_name] = row.field_value;
    cards.set(row.source_card_id, card);
  }
  return [...cards.values()];
}
async function get(context: FunctionContext<CloudEnv>, deckId: string) {
  const deck = await context.env.DB.prepare('SELECT id, display_name, published_at FROM curated_decks WHERE id = ?').bind(deckId).first<{ id: string; display_name: string; published_at: string }>();
  if (!deck) return json({ error: 'deck_not_found' }, { status: 404 });
  return json({ deck: { id: deck.id, displayName: deck.display_name, publishedAt: deck.published_at, cards: (await rows(context, deckId)).map((card) => ({ ...card, content: cardContent(card.profile, card.fields) })) } });
}
async function update(context: FunctionContext<CloudEnv>, deckId: string) {
  const body = await requestJson(context.request); if (isHttpResponse(body)) return body;
  const displayName = validLabel(body.displayName); if (!displayName) return json({ error: 'invalid_display_name' }, { status: 400 });
  const cards = body.cards === undefined
    ? existingCards(await rows(context, deckId))
    : deckCards(body.cards);
  if (isHttpResponse(cards)) return cards;
  const existing = await rows(context, deckId); const before = new Map(existing.map((card) => [card.source_card_id, card]));
  const removed = existing.filter((card) => !cards.some((next) => next.sourceCardId === card.source_card_id)).map((card) => card.source_card_id);
  const changed = cards.filter((card, index) => { const old = before.get(card.sourceCardId); return old && (old.profile !== card.profile || old.new_position !== (card.newPosition ?? index) || JSON.stringify(old.fields) !== JSON.stringify(card.fields)); }).length;
  const added = cards.filter((card) => !before.has(card.sourceCardId)).length; const retained = cards.length - added - changed;
  const affectedSaves = Number((await context.env.DB.prepare('SELECT COUNT(*) AS count FROM save_selected_decks WHERE deck_id = ?').bind(deckId).first<{ count: number }>())?.count ?? 0);
  const affectedProgress = removed.length ? Number((await context.env.DB.prepare(`SELECT COUNT(*) AS count FROM cloud_card_progress WHERE deck_id = ? AND source_card_id IN (${removed.map(() => '?').join(',')})`).bind(deckId, ...removed).first<{ count: number }>())?.count ?? 0) : 0;
  const preview = impact(added, changed, retained, removed, affectedSaves, affectedProgress);
  if (body.previewOnly === true) return json({ preview });
  if (removed.length && body.confirmDestructive !== true) return json({ error: 'destructive_confirmation_required', preview }, { status: 409 });
  const deck = await context.env.DB.prepare('SELECT id FROM curated_decks WHERE id = ?').bind(deckId).first(); if (!deck) return json({ error: 'deck_not_found' }, { status: 404 });
  const statements = [context.env.DB.prepare('UPDATE curated_decks SET display_name = ?, published_at = ? WHERE id = ?').bind(displayName, new Date().toISOString(), deckId)];
  if (removed.length) {
    statements.push(context.env.DB.prepare(`DELETE FROM cloud_card_progress WHERE deck_id = ? AND source_card_id IN (${removed.map(() => '?').join(',')})`).bind(deckId, ...removed));
    statements.push(context.env.DB.prepare(`DELETE FROM deck_cards WHERE deck_id = ? AND source_card_id IN (${removed.map(() => '?').join(',')})`).bind(deckId, ...removed));
  }
  for (const [index, card] of cards.entries()) {
    statements.push(context.env.DB.prepare(`INSERT INTO deck_cards (deck_id, source_card_id, new_position, profile) VALUES (?, ?, ?, ?)
      ON CONFLICT(deck_id, source_card_id) DO UPDATE SET new_position=excluded.new_position, profile=excluded.profile`).bind(deckId, card.sourceCardId, card.newPosition ?? index, card.profile));
    statements.push(context.env.DB.prepare('DELETE FROM deck_card_fields WHERE deck_id = ? AND source_card_id = ?').bind(deckId, card.sourceCardId));
    for (const [name, value] of Object.entries(card.fields ?? {})) statements.push(context.env.DB.prepare(`INSERT INTO deck_card_fields
      (deck_id, source_card_id, field_name, field_value) VALUES (?, ?, ?, ?)`).bind(deckId, card.sourceCardId, name, value));
  }
  await batchD1Statements(context.env.DB, statements); return json({ deck: { id: deckId, displayName, cardCount: cards.length }, preview });
}
function existingCards(rows: DeckCardRow[]) {
  return rows.map((card) => ({ sourceCardId: card.source_card_id, newPosition: card.new_position, profile: card.profile, fields: card.fields }));
}
async function remove(context: FunctionContext<CloudEnv>, deckId: string) {
  const body = await requestJson(context.request); if (isHttpResponse(body)) return body;
  const cards = await rows(context, deckId); const affectedSaves = Number((await context.env.DB.prepare('SELECT COUNT(*) AS count FROM save_selected_decks WHERE deck_id = ?').bind(deckId).first<{ count: number }>())?.count ?? 0);
  const affectedProgress = Number((await context.env.DB.prepare('SELECT COUNT(*) AS count FROM cloud_card_progress WHERE deck_id = ?').bind(deckId).first<{ count: number }>())?.count ?? 0); const preview = { affectedSaves, affectedProgress };
  if (body.confirmDestructive !== true) return json({ error: 'destructive_confirmation_required', preview }, { status: 409 });
  await context.env.DB.batch([context.env.DB.prepare('DELETE FROM cloud_card_progress WHERE deck_id = ?').bind(deckId), context.env.DB.prepare('DELETE FROM save_selected_decks WHERE deck_id = ?').bind(deckId), context.env.DB.prepare('DELETE FROM deck_cards WHERE deck_id = ?').bind(deckId), context.env.DB.prepare('DELETE FROM curated_decks WHERE id = ?').bind(deckId)]);
  return json({ deleted: true, deckId, preview, cardCount: cards.length });
}
