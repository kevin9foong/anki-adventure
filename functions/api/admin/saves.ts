import { isAdmin, json, newSaveToken, publicSave, tokenHash, type CloudEnv, type CloudSaveRow, type FunctionContext, unauthorized } from '../../_lib/cloud';
import { initialMonster } from '../../../src/domain/game';

const saveColumns = `id, token_hash, label, party_json, storage_json, active_monster_id,
  daily_new_card_limit, limit_date, extra_new_cards_today, revision, created_at, updated_at`;

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (!isAdmin(context.request, context.env)) return unauthorized();
  if (context.request.method === 'GET') return listSaves(context);
  if (context.request.method === 'POST') return createSave(context);
  return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET, POST' } });
}

async function listSaves(context: FunctionContext<CloudEnv>): Promise<Response> {
  const { results } = await context.env.DB
    .prepare(`SELECT ${saveColumns} FROM cloud_saves ORDER BY created_at DESC`)
    .all<CloudSaveRow>();
  return json({ saves: results.map(publicSave) });
}

async function createSave(context: FunctionContext<CloudEnv>): Promise<Response> {
  let body: { label?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (label.length < 1 || label.length > 120) return json({ error: 'invalid_label' }, { status: 400 });

  const now = new Date().toISOString();
  const token = newSaveToken();
  const starter = initialMonster('tanuki');
  const row: CloudSaveRow = {
    id: crypto.randomUUID(),
    token_hash: await tokenHash(token),
    label,
    party_json: JSON.stringify([starter]),
    storage_json: '[]',
    active_monster_id: starter.id,
    daily_new_card_limit: 10,
    limit_date: null,
    extra_new_cards_today: 0,
    revision: 0,
    created_at: now,
    updated_at: now,
  };
  await context.env.DB
    .prepare(`INSERT INTO cloud_saves (${saveColumns}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      row.id, row.token_hash, row.label, row.party_json, row.storage_json, row.active_monster_id,
      row.daily_new_card_limit, row.limit_date, row.extra_new_cards_today, row.revision, row.created_at, row.updated_at,
    )
    .run();

  const url = new URL(context.request.url);
  url.pathname = '/';
  url.search = new URLSearchParams({ save: token }).toString();
  url.hash = '';
  return json({ save: publicSave(row), url: url.toString() }, { status: 201 });
}
