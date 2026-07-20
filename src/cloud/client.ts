export interface CloudSession {
  id: string;
  party: unknown[];
  storage: unknown[];
  activeMonsterId?: string | null;
  dailyNewCardLimit?: number;
  limitDate?: string | null;
  extraNewCardsToday?: number;
  revision: number;
}

export interface CloudDeckCard {
  sourceCardId: string;
  front: string;
  back: string;
  reading?: string;
  furigana?: string;
  exampleSentence?: string;
  exampleSentenceTranslation?: string;
  exampleSentenceFurigana?: string;
  progress: Record<string, unknown> | null;
}
export interface CloudDeck { id: string; displayName: string; cards: CloudDeckCard[]; }
export interface CloudDeckCatalogue { selectedDeckIds: string[]; decks: CloudDeck[]; catalogue: Array<{ id: string; displayName: string; cardCount: number }>; revision: number; }

export class CloudApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export class CloudApi {
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init)) {}

  async session(): Promise<CloudSession> {
    const response = await this.request('/api/session');
    const body = await response.json().catch(() => ({})) as { save?: CloudSession; error?: string };
    if (!response.ok || !body.save) throw new CloudApiError(response.status, body.error ?? 'cloud_request_failed');
    return body.save;
  }

  async playerState(expectedRevision: number, state: Record<string, unknown>): Promise<number> {
    const response = await this.request('/api/session/player-state', { method: 'PATCH', body: JSON.stringify({ expectedRevision, ...state }) });
    const body = await response.json().catch(() => ({})) as { revision?: number; error?: string };
    if (!response.ok || body.revision === undefined) throw new CloudApiError(response.status, body.error ?? 'cloud_request_failed');
    return body.revision;
  }

  async decks(): Promise<CloudDeckCatalogue> {
    const response = await this.request('/api/session/decks');
    const body = await response.json().catch(() => ({})) as Partial<CloudDeckCatalogue> & { error?: string };
    if (!response.ok || !Array.isArray(body.decks) || !Array.isArray(body.catalogue) || !Array.isArray(body.selectedDeckIds) || typeof body.revision !== 'number') throw new CloudApiError(response.status, body.error ?? 'cloud_request_failed');
    return body as CloudDeckCatalogue;
  }

  async selectDecks(expectedRevision: number, deckIds: string[]): Promise<number> {
    const response = await this.request('/api/session/decks', { method: 'PUT', body: JSON.stringify({ expectedRevision, deckIds }) });
    const body = await response.json().catch(() => ({})) as { revision?: number; error?: string };
    if (!response.ok || body.revision === undefined) throw new CloudApiError(response.status, body.error ?? 'cloud_request_failed');
    return body.revision;
  }

  async grade(expectedRevision: number, deckId: string, sourceCardId: string, grade: string, playerState: Record<string, unknown>): Promise<{ card: Record<string, unknown>; revision: number }> {
    const response = await this.request('/api/session/grade', { method: 'POST', body: JSON.stringify({ expectedRevision, deckId, sourceCardId, grade, playerState }) });
    const body = await response.json().catch(() => ({})) as { card?: Record<string, unknown>; revision?: number; error?: string };
    if (!response.ok || !body.card || body.revision === undefined) throw new CloudApiError(response.status, body.error ?? 'cloud_request_failed');
    return { card: body.card, revision: body.revision };
  }

  private request(path: string, init: RequestInit = {}) {
    return this.fetcher(path, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  }
}
