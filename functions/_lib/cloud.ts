export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}

export interface CloudEnv {
  ADMIN_KEY: string;
  DB: D1Database;
}

export interface FunctionContext<Env extends CloudEnv = CloudEnv> {
  request: Request;
  env: Env;
}

export interface CloudSaveRow {
  id: string;
  token_hash: string;
  label: string;
  party_json: string;
  storage_json: string;
  active_monster_id: string | null;
  daily_new_card_limit: number;
  limit_date: string | null;
  extra_new_cards_today: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

const securityHeaders = { 'Referrer-Policy': 'no-referrer' };

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function empty(status: number): Response {
  return new Response(null, { status, headers: securityHeaders });
}

export function unauthorized(): Response {
  return json({ error: 'unauthorized' }, { status: 401 });
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get('Authorization');
  const match = value?.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}

export function isAdmin(request: Request, env: CloudEnv): boolean {
  const supplied = request.headers.get('X-Admin-Key');
  return typeof supplied === 'string' && supplied.length > 0 && supplied === env.ADMIN_KEY;
}

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newSaveToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function publicSave(row: CloudSaveRow) {
  return {
    id: row.id,
    label: row.label,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function sessionSave(row: CloudSaveRow) {
  return {
    id: row.id,
    party: JSON.parse(row.party_json),
    storage: JSON.parse(row.storage_json),
    activeMonsterId: row.active_monster_id,
    dailyNewCardLimit: row.daily_new_card_limit,
    limitDate: row.limit_date,
    extraNewCardsToday: row.extra_new_cards_today,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
