import { describe, expect, it } from 'vitest';
import { isBlockedOverworldTile } from './overworldMap';

describe('Tokushima overworld movement', () => {
  it('allows movement onto every map edge', () => {
    for (const [x, y] of [[0, 1], [14, 1], [0, 13], [14, 13]]) {
      expect(isBlockedOverworldTile(x, y)).toBe(false);
    }
  });

  it('prevents movement beyond every map boundary', () => {
    for (const [x, y] of [[-1, 8], [15, 8], [7, 0], [7, 14]]) {
      expect(isBlockedOverworldTile(x, y)).toBe(true);
    }
  });

  it('keeps every segment of the two interior walls impassable', () => {
    for (const [x, y] of [[8, 8], [8, 13], [11, 5], [14, 5]]) {
      expect(isBlockedOverworldTile(x, y)).toBe(true);
    }
  });
});
