import { adminId } from '../../../../_lib/admin';
import { isAdmin, json, newSaveToken, tokenHash, type CloudEnv, type FunctionContext, unauthorized } from '../../../../_lib/cloud';

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (context.request.method !== 'POST') return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
  if (!isAdmin(context.request, context.env)) return unauthorized(); const saveId = adminId(context.request, 'saves'); if (!saveId) return json({ error: 'save_not_found' }, { status: 404 });
  const token = newSaveToken(); const result = await context.env.DB.prepare('UPDATE cloud_saves SET token_hash = ?, updated_at = ? WHERE id = ?').bind(await tokenHash(token), new Date().toISOString(), saveId).run() as { meta?: { changes?: number } };
  if (!result.meta?.changes) return json({ error: 'save_not_found' }, { status: 404 }); const url = new URL(context.request.url); url.pathname = '/'; url.search = new URLSearchParams({ save: token }).toString(); url.hash = ''; return json({ url: url.toString() });
}
