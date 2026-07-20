import './admin.css';
import { parseCuratedCsv, type CuratedCardInput } from './cloud/decks';
import { parseCuratedApkg } from './adminDeckParser';

export interface AdminSave { id: string; label: string; revision: number; createdAt: string; updatedAt: string; }
export interface AdminDeck { id: string; displayName: string; cardCount: number; createdAt?: string; updatedAt?: string; }
export interface DeckImpact { added?: number; changed?: number; retained?: number; removed?: number; affectedSaves: number; affectedProgress: number; }

export class AdminApiError extends Error {
  preview?: DeckImpact;
  constructor(readonly status: number, readonly code: string) { super(code); }
}

/** The key stays in this object only; no storage or URL APIs are used. */
export class AdminApi {
  constructor(private readonly key: string, private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {}

  verify() { return this.request('/api/admin/verify', { method: 'POST' }).then(() => undefined); }
  listSaves() { return this.read<{ saves: AdminSave[] }>('/api/admin/saves').then((body) => body.saves); }
  createSave(label: string) { return this.read<{ save: AdminSave; url: string }>('/api/admin/saves', { method: 'POST', body: JSON.stringify({ label }) }); }
  relabelSave(id: string, label: string) { return this.read<{ id: string; label: string }>(`/api/admin/saves/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ label }) }); }
  rotateSave(id: string) { return this.read<{ url: string }>(`/api/admin/saves/${encodeURIComponent(id)}/rotate`, { method: 'POST' }); }
  deleteSave(id: string) { return this.request(`/api/admin/saves/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirmDestructive: true }) }).then(() => undefined); }

  listDecks() { return this.read<{ decks: AdminDeck[] }>('/api/admin/decks').then((body) => body.decks); }
  publishDeck(displayName: string, cards: CuratedCardInput[]) { return this.read<{ deck: AdminDeck }>('/api/admin/decks', { method: 'POST', body: JSON.stringify({ displayName, cards }) }); }
  previewDeck(id: string, displayName: string, cards?: CuratedCardInput[]) { return this.read<{ preview: DeckImpact }>(`/api/admin/decks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ displayName, cards, previewOnly: true }) }); }
  updateDeck(id: string, displayName: string, cards: CuratedCardInput[] | undefined, confirmDestructive: boolean) { return this.read<{ deck: AdminDeck; preview: DeckImpact }>(`/api/admin/decks/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ displayName, cards, confirmDestructive }) }); }
  async previewDeleteDeck(id: string) {
    try { await this.deleteDeck(id, false); throw new Error('Deck deletion preview unexpectedly deleted the deck.'); }
    catch (error) { if (error instanceof AdminApiError && error.code === 'destructive_confirmation_required') return error.preview as DeckImpact; throw error; }
  }
  deleteDeck(id: string, confirmDestructive: boolean) { return this.request(`/api/admin/decks/${encodeURIComponent(id)}`, { method: 'DELETE', body: JSON.stringify({ confirmDestructive }) }).then(() => undefined); }

  private async read<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.request(path, init);
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new AdminApiError(response.status, body.error ?? 'admin_request_failed');
    return body;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.fetcher(path, { ...init, headers: { 'X-Admin-Key': this.key, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
    if (!response.ok) {
      const body = await response.clone().json().catch(() => ({})) as { error?: string; preview?: DeckImpact };
      const error = new AdminApiError(response.status, body.error ?? 'admin_request_failed');
      error.preview = body.preview; throw error;
    }
    return response;
  }
}

/** The current admin API receives normalized text cards, so CSV parsing is local and deterministic. */
export async function cardsFromFile(file: File): Promise<CuratedCardInput[]> {
  return file.name.toLowerCase().endsWith('.apkg')
    ? parseCuratedApkg(await file.arrayBuffer())
    : parseCuratedCsv(await file.text());
}

export function createAdminApp(document: Document, api: AdminApi) {
  const app = document.createElement('main');
  app.className = 'admin-app';
  app.innerHTML = `<header><a href="/" aria-label="Return to game">← Game</a><strong>ADMIN CONSOLE</strong></header>
    <p class="admin-notice">This session is in memory only. Refreshing requires the admin key again.</p>
    <p class="admin-status" data-status role="status"></p>
    <section><h1>Cloud saves</h1><form data-create-save><label>Private label <input name="label" maxlength="120" required autocomplete="off" /></label><button>Create save link</button></form><div data-saves></div></section>
    <section><h1>Curated decks</h1><form data-publish-deck><label>Display name <input name="displayName" maxlength="120" required /></label><label>Text deck (.csv or .apkg) <input name="deckFile" type="file" accept=".csv,.apkg,text/csv" required /></label><button>Publish deck</button></form><div data-decks></div></section>`;
  document.body.replaceChildren(app);
  const status = required<HTMLElement>(app, '[data-status]');
  const saves = required<HTMLElement>(app, '[data-saves]');
  const decks = required<HTMLElement>(app, '[data-decks]');
  const setStatus = (message: string, error = false) => { status.textContent = message; status.dataset.error = String(error); };
  const refresh = async () => {
    const [saveItems, deckItems] = await Promise.all([api.listSaves(), api.listDecks()]);
    renderSaves(document, saves, saveItems, api, refresh, setStatus);
    renderDecks(document, decks, deckItems, api, refresh, setStatus);
  };
  required<HTMLFormElement>(app, '[data-create-save]').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const label = String(new FormData(form).get('label') ?? '').trim();
    try { const created = await api.createSave(label); showLink(document, 'New cloud save link', created.url); form.reset(); await refresh(); }
    catch (error) { setStatus(message(error), true); }
  });
  required<HTMLFormElement>(app, '[data-publish-deck]').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const file = (new FormData(form).get('deckFile') as File | null);
    try { if (!file || !file.name) throw new Error('Choose a CSV or APKG file.'); await api.publishDeck(String(new FormData(form).get('displayName') ?? '').trim(), await cardsFromFile(file)); form.reset(); await refresh(); setStatus('Deck published.'); }
    catch (error) { setStatus(message(error), true); }
  });
  refresh().catch((error) => setStatus(message(error), true));
  return { refresh, element: app };
}

function renderSaves(document: Document, target: HTMLElement, saves: AdminSave[], api: AdminApi, refresh: () => Promise<void>, setStatus: (message: string, error?: boolean) => void) {
  target.replaceChildren(...saves.map((save) => {
    const row = document.createElement('article'); row.className = 'admin-row';
    const label = document.createElement('input'); label.value = save.label; label.maxLength = 120; label.setAttribute('aria-label', `Label for ${save.label}`);
    const relabel = button(document, 'Save label'); const rotate = button(document, 'Rotate link'); const remove = button(document, 'Delete save'); remove.className = 'danger';
    relabel.onclick = async () => { try { await api.relabelSave(save.id, label.value.trim()); await refresh(); setStatus('Label updated.'); } catch (error) { setStatus(message(error), true); } };
    rotate.onclick = async () => { try { const result = await api.rotateSave(save.id); showLink(document, 'Replacement cloud save link', result.url); await refresh(); } catch (error) { setStatus(message(error), true); } };
    remove.onclick = async () => { if (!window.confirm(`Permanently delete “${save.label}”? This cannot be undone.`)) return; try { await api.deleteSave(save.id); await refresh(); setStatus('Cloud save deleted.'); } catch (error) { setStatus(message(error), true); } };
    row.append(label, relabel, rotate, remove); return row;
  }));
  if (!saves.length) target.textContent = 'No cloud saves yet.';
}

function renderDecks(document: Document, target: HTMLElement, decks: AdminDeck[], api: AdminApi, refresh: () => Promise<void>, setStatus: (message: string, error?: boolean) => void) {
  target.replaceChildren(...decks.map((deck) => {
    const row = document.createElement('article'); row.className = 'admin-row admin-deck';
    const title = document.createElement('strong'); title.textContent = `${deck.displayName} (${deck.cardCount} cards)`;
    const rename = document.createElement('input'); rename.value = deck.displayName; rename.maxLength = 120; rename.setAttribute('aria-label', `New display name for ${deck.displayName}`);
    const file = document.createElement('input'); file.type = 'file'; file.accept = '.csv,.apkg,text/csv'; file.setAttribute('aria-label', `Replacement file for ${deck.displayName}`);
    const update = button(document, 'Preview update'); const renameOnly = button(document, 'Rename deck'); const remove = button(document, 'Delete deck'); remove.className = 'danger';
    const confirmUpdate = async (cards: CuratedCardInput[] | undefined) => { const preview = await api.previewDeck(deck.id, rename.value.trim(), cards); if (!window.confirm(`${impactText(preview.preview)}\n\nPublish this update?`)) return; await api.updateDeck(deck.id, rename.value.trim(), cards, (preview.preview.removed ?? 0) > 0); await refresh(); setStatus('Deck updated.'); };
    update.onclick = async () => { try { const selected = file.files?.[0]; if (!selected) throw new Error('Choose a replacement CSV or APKG first.'); await confirmUpdate(await cardsFromFile(selected)); } catch (error) { setStatus(message(error), true); } };
    renameOnly.onclick = async () => { try { await confirmUpdate(undefined); } catch (error) { setStatus(message(error), true); } };
    remove.onclick = async () => { try { const preview = await api.previewDeleteDeck(deck.id); if (!window.confirm(`Delete “${deck.displayName}”? ${impactText(preview)}\n\nThis is permanent.`)) return; await api.deleteDeck(deck.id, true); await refresh(); setStatus('Deck deleted.'); } catch (error) { setStatus(message(error), true); } };
    row.append(title, rename, file, update, renameOnly, remove); return row;
  }));
  if (!decks.length) target.textContent = 'No curated decks published yet.';
}

function impactText(impact: DeckImpact) { return `Added: ${impact.added ?? 0}; changed: ${impact.changed ?? 0}; retained: ${impact.retained ?? 0}; removed: ${impact.removed ?? 0}. Affects ${impact.affectedSaves} save(s) and deletes ${impact.affectedProgress} progress record(s).`; }
function button(document: Document, text: string) { const element = document.createElement('button'); element.type = 'button'; element.textContent = text; return element; }
function showLink(document: Document, title: string, url: string) {
  const dialog = document.createElement('dialog'); dialog.className = 'admin-link-dialog';
  const heading = document.createElement('h2'); heading.textContent = title;
  const notice = document.createElement('p'); notice.textContent = 'Copy and distribute this link now. It is not shown in the save list.';
  const input = document.createElement('input'); input.readOnly = true; input.value = url; input.setAttribute('aria-label', title); input.onclick = () => input.select();
  const close = button(document, 'Close'); close.onclick = () => dialog.close();
  dialog.append(heading, notice, input, close); document.body.append(dialog); dialog.showModal(); input.select();
}
function required<T extends Element>(root: ParentNode, selector: string) { const value = root.querySelector<T>(selector); if (!value) throw new Error(`Missing ${selector}`); return value; }
function message(error: unknown) { return error instanceof Error ? error.message : 'Unexpected admin request failure.'; }

export async function bootAdmin(document: Document = window.document, promptForKey: (message: string) => string | null = window.prompt.bind(window)) {
  const key = promptForKey('Enter the admin key for this page session.');
  if (!key) { document.body.textContent = 'Admin access requires a key.'; return; }
  const api = new AdminApi(key);
  try { await api.verify(); createAdminApp(document, api); }
  catch (error) { document.body.textContent = `Admin access denied: ${message(error)}`; }
}
