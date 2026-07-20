import { json, type CloudEnv, type FunctionContext } from '../../_lib/cloud';
import { authenticatedSave, conflict, expectedRevision, isResponse, requestJson } from '../../_lib/session';

const species = new Set(['tanuki', 'uzu', 'mosslug', 'sparkite']);
type UnknownRecord = Record<string, unknown>;
function validMonster(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const monster = value as UnknownRecord;
  return typeof monster.id === 'string' && monster.id.length > 0 && monster.id.length <= 120
    && typeof monster.name === 'string' && monster.name.length > 0 && monster.name.length <= 120
    && typeof monster.species === 'string' && species.has(monster.species)
    && Number.isInteger(monster.level) && (monster.level as number) >= 1 && (monster.level as number) <= 100
    && Number.isFinite(monster.xp) && (monster.xp as number) >= 0
    && Number.isFinite(monster.currentHp) && (monster.currentHp as number) >= 0;
}
function validMonsters(value: unknown, maximum: number) {
  return Array.isArray(value) && value.length <= maximum && value.every(validMonster)
    && new Set(value.map((monster) => (monster as UnknownRecord).id)).size === value.length;
}

/** Shared by the narrow player-state and grade-turn mutations. */
export function validPlayerState(body: Record<string, unknown>) {
  const allowed = ['party', 'storage', 'activeMonsterId', 'dailyNewCardLimit', 'limitDate', 'extraNewCardsToday'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) return false;
  if (body.party !== undefined && !validMonsters(body.party, 6)) return false;
  if (body.storage !== undefined && !validMonsters(body.storage, 100)) return false;
  if (body.activeMonsterId !== undefined && body.activeMonsterId !== null && typeof body.activeMonsterId !== 'string') return false;
  if (typeof body.activeMonsterId === 'string' && body.party !== undefined && !(body.party as UnknownRecord[]).some((monster) => monster.id === body.activeMonsterId)) return false;
  if (body.dailyNewCardLimit !== undefined && (!Number.isInteger(body.dailyNewCardLimit) || (body.dailyNewCardLimit as number) < 0)) return false;
  if (body.limitDate !== undefined && body.limitDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.limitDate))) return false;
  return body.extraNewCardsToday === undefined || (Number.isInteger(body.extraNewCardsToday) && (body.extraNewCardsToday as number) >= 0);
}

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (context.request.method !== 'PATCH') return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'PATCH' } });
  const save = await authenticatedSave(context);
  if (isResponse(save)) return save;
  const body = await requestJson(context.request);
  if (isResponse(body)) return body;
  const revision = expectedRevision(body);
  if (isResponse(revision)) return revision;

  const state = Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'expectedRevision'));
  if (!validPlayerState(state)) return json({ error: 'invalid_player_state' }, { status: 400 });

  const result = await context.env.DB.prepare(`UPDATE cloud_saves SET party_json = COALESCE(?, party_json), storage_json = COALESCE(?, storage_json),
    active_monster_id = CASE WHEN ? THEN ? ELSE active_monster_id END, daily_new_card_limit = COALESCE(?, daily_new_card_limit),
    limit_date = CASE WHEN ? THEN ? ELSE limit_date END, extra_new_cards_today = COALESCE(?, extra_new_cards_today), revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ?`).bind(
    body.party === undefined ? null : JSON.stringify(body.party), body.storage === undefined ? null : JSON.stringify(body.storage),
    body.activeMonsterId !== undefined ? 1 : 0, body.activeMonsterId ?? null, body.dailyNewCardLimit ?? null, body.limitDate !== undefined ? 1 : 0, body.limitDate ?? null,
    body.extraNewCardsToday ?? null, new Date().toISOString(), save.id, revision,
  ).run() as { meta?: { changes?: number } };
  if (!result.meta?.changes) return conflict();
  return json({ revision: revision + 1 });
}
