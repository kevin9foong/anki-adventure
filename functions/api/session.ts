import { json, sessionSave, type CloudEnv, type FunctionContext } from '../_lib/cloud';
import { authenticatedSave, isResponse } from '../_lib/session';

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (context.request.method !== 'GET') return json({ error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });

  const save = await authenticatedSave(context);
  if (isResponse(save)) return save;
  return json({ save: sessionSave(save) });
}
