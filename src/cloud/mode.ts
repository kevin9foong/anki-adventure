export type PersistenceMode = 'local' | 'cloud';

/** URL mode is authoritative: cloud links never touch the local journal. */
export function cloudSaveTokenFromUrl(url: string): string | undefined {
  const token = new URL(url).searchParams.get('save')?.trim();
  return token || undefined;
}

export function persistenceMode(url: string): PersistenceMode {
  return cloudSaveTokenFromUrl(url) ? 'cloud' : 'local';
}
