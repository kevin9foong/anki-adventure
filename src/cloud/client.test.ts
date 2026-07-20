import { describe, expect, it, vi } from 'vitest';
import { CloudApi, CloudApiError } from './client';

describe('CloudApi', () => {
  it('sends a cloud link token only as a bearer authorization header', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ save: { id: 'save-1', party: [], storage: [], revision: 0 } }), { status: 200 }));
    const api = new CloudApi('token-value', fetcher);

    await expect(api.session()).resolves.toMatchObject({ id: 'save-1', revision: 0 });
    expect(fetcher).toHaveBeenCalledWith('/api/session', {
      headers: { Authorization: 'Bearer token-value' },
    });
  });

  it('turns a rejected cloud request into a safe status error', async () => {
    const api = new CloudApi('token-value', async () => new Response(JSON.stringify({ error: 'save_not_found' }), { status: 404 }));
    await expect(api.session()).rejects.toEqual(new CloudApiError(404, 'save_not_found'));
  });
});
