import { adminId, isHttpResponse, validLabel } from '../../../_lib/admin';
import { isAdmin, json, type CloudEnv, type FunctionContext, unauthorized } from '../../../_lib/cloud';
import { requestJson } from '../../../_lib/session';

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (!isAdmin(context.request, context.env)) return unauthorized(); const saveId = adminId(context.request, 'saves'); if (!saveId) return json({ error: 'save_not_found' }, { status: 404 });
  if (context.request.method === 'PATCH') return relabel(context, saveId);
  if (context.request.method === 'DELETE') return remove(context, saveId);
  return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'PATCH, DELETE' } });
}
async function relabel(context: FunctionContext<CloudEnv>, saveId: string) { const body = await requestJson(context.request); if (isHttpResponse(body)) return body; const label = validLabel(body.label); if (!label) return json({ error: 'invalid_label' }, { status: 400 }); const result = await context.env.DB.prepare('UPDATE cloud_saves SET label = ?, updated_at = ? WHERE id = ?').bind(label, new Date().toISOString(), saveId).run() as { meta?: { changes?: number } }; return result.meta?.changes ? json({ id: saveId, label }) : json({ error: 'save_not_found' }, { status: 404 }); }
async function remove(context: FunctionContext<CloudEnv>, saveId: string) { const body = await requestJson(context.request); if (isHttpResponse(body)) return body; if (body.confirmDestructive !== true) return json({ error: 'destructive_confirmation_required' }, { status: 409 }); await context.env.DB.batch([context.env.DB.prepare('DELETE FROM cloud_card_progress WHERE save_id = ?').bind(saveId), context.env.DB.prepare('DELETE FROM save_selected_decks WHERE save_id = ?').bind(saveId), context.env.DB.prepare('DELETE FROM cloud_saves WHERE id = ?').bind(saveId)]); return json({ deleted: true, saveId }); }
