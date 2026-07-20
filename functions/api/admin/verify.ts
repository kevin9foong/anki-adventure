import { empty, isAdmin, type CloudEnv, type FunctionContext, unauthorized } from '../../_lib/cloud';

export async function onRequest(context: FunctionContext<CloudEnv>): Promise<Response> {
  if (context.request.method !== 'POST') return empty(405);
  return isAdmin(context.request, context.env) ? empty(204) : unauthorized();
}
