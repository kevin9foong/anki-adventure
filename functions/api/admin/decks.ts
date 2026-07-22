import { adminId, deckCards, isHttpResponse, validLabel } from '../../_lib/admin';
import { batchD1Statements, isAdmin, json, type CloudEnv, type FunctionContext, unauthorized } from '../../_lib/cloud';
import { requestJson } from '../../_lib/session';

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (!isAdmin(context.request, context.env)) return unauthorized();
  if (context.request.method === 'GET') return list(context);
  if (context.request.method === 'POST') return create(context);
  return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET, POST' } });
}

async function list(context: FunctionContext<CloudEnv>) {
  const { results } = await context.env.DB.prepare(`SELECT d.id, d.display_name, d.published_at, COUNT(c.source_card_id) AS card_count
    FROM curated_decks d LEFT JOIN deck_cards c ON c.deck_id = d.id GROUP BY d.id ORDER BY d.display_name`).all<{ id: string; display_name: string; published_at: string; card_count: number }>();
  return json({ decks: results.map((deck) => ({ id: deck.id, displayName: deck.display_name, publishedAt: deck.published_at, cardCount: deck.card_count })) });
}

async function create(context: FunctionContext<CloudEnv>) {
  const body = await requestJson(context.request); if (isHttpResponse(body)) return body;
  const displayName = validLabel(body.displayName); if (!displayName) return json({ error: 'invalid_display_name' }, { status: 400 });
  const cards = deckCards(body.cards); if (isHttpResponse(cards)) return cards;
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const statements = [context.env.DB.prepare('INSERT INTO curated_decks (id, display_name, published_at) VALUES (?, ?, ?)').bind(id, displayName, now),
    ...cards.flatMap((card, index) => [
      context.env.DB.prepare(`INSERT INTO deck_cards (deck_id, source_card_id, new_position, profile)
        VALUES (?, ?, ?, ?)`).bind(id, card.sourceCardId, card.newPosition ?? index, card.profile),
      ...Object.entries(card.fields ?? {}).map(([name, value]) => context.env.DB.prepare(`INSERT INTO deck_card_fields
        (deck_id, source_card_id, field_name, field_value) VALUES (?, ?, ?, ?)`).bind(id, card.sourceCardId, name, value)),
    ])];
  await batchD1Statements(context.env.DB, statements);
  return json({ deck: { id, displayName, publishedAt: now, cardCount: cards.length } }, { status: 201 });
}

export { adminId };
