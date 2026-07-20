import { describe, expect, it } from 'vitest';
import { cloudSaveTokenFromUrl, persistenceMode } from './mode';

describe('cloud URL mode', () => {
  it('uses cloud persistence only when a non-empty save token is present', () => {
    expect(persistenceMode('https://adventure.example/')).toBe('local');
    expect(persistenceMode('https://adventure.example/?save=share-token')).toBe('cloud');
    expect(cloudSaveTokenFromUrl('https://adventure.example/?save=')).toBeUndefined();
  });
});
