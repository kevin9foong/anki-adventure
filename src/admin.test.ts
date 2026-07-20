import { Window } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminApi, AdminApiError, createAdminApp } from './admin';

describe('admin browser API', () => {
  it('sends the in-memory key only as an admin request header', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ saves: [] })));
    await new AdminApi('ephemeral-key', fetcher).listSaves();
    expect(fetcher).toHaveBeenCalledWith('/api/admin/saves', { headers: { 'X-Admin-Key': 'ephemeral-key' } });
  });

  it('does not turn a rejected admin request into a successful UI result', async () => {
    const api = new AdminApi('key', async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));
    await expect(api.listSaves()).rejects.toEqual(new AdminApiError(401, 'unauthorized'));
  });
});

describe('admin browser UI', () => {
  it('renders private save labels but never a bearer link from list data', async () => {
    const window = new Window();
    const api = {
      listSaves: vi.fn(async () => [{ id: 'save-1', label: 'Mina phone', revision: 0, createdAt: '', updatedAt: '' }]),
      listDecks: vi.fn(async () => []),
    } as unknown as AdminApi;
    const app = createAdminApp(window.document as unknown as Document, api);
    await app.refresh();
    expect((window.document.querySelector('input[aria-label="Label for Mina phone"]') as unknown as HTMLInputElement).value).toBe('Mina phone');
    expect(window.document.body.innerHTML).not.toContain('?save=');
    expect(window.document.querySelector('[data-create-save]')).not.toBeNull();
  });
});
