const minX = 0;
const maxX = 14;
const minY = 1;
const maxY = 13;

export function isBlockedOverworldTile(x: number, y: number) {
  return x < minX || x > maxX || y < minY || y > maxY || isWallTile(x, y);
}

export function isWallTile(x: number, y: number) {
  return (x === 8 && y > 7) || (x > 10 && y === 5);
}
