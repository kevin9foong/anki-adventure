import { bearerToken, json, tokenHash, type CloudEnv, type CloudSaveRow, type FunctionContext, unauthorized } from './cloud';

export async function authenticatedSave(context: FunctionContext<CloudEnv>): Promise<CloudSaveRow | Response> {
  const token = bearerToken(context.request);
  if (!token) return unauthorized();
  const row = await context.env.DB.prepare(`SELECT id, token_hash, label, party_json, storage_json, active_monster_id,
    daily_new_card_limit, limit_date, extra_new_cards_today, revision, created_at, updated_at
    FROM cloud_saves WHERE token_hash = ?`).bind(await tokenHash(token)).first<CloudSaveRow>();
  return row ?? json({ error: 'save_not_found' }, { status: 404 });
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

export async function requestJson(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : json({ error: 'invalid_json' }, { status: 400 });
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
}

export function expectedRevision(body: Record<string, unknown>): number | Response {
  return Number.isSafeInteger(body.expectedRevision) && (body.expectedRevision as number) >= 0
    ? body.expectedRevision as number
    : json({ error: 'invalid_expected_revision' }, { status: 400 });
}

export function conflict(): Response {
  return json({ error: 'revision_conflict', reloadRequired: true }, { status: 409 });
}
