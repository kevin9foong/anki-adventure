import Phaser from 'phaser';
import { OverworldScene } from './OverworldScene';

export function createGame(parent: string, onEncounter: () => void, onHeal: () => void, onTrainer: () => void, onGym: () => void) {
  const game = new Phaser.Game({ type: Phaser.CANVAS, parent, width: 480, height: 448, pixelArt: true, backgroundColor: '#13233d', scene: [OverworldScene], scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: false, roundPixels: true } });
  game.scene.start('overworld', { onEncounter, onHeal, onTrainer, onGym });
  return { game, move: (x: number, y: number) => (game.scene.getScene('overworld') as OverworldScene).move(x, y), interact: () => (game.scene.getScene('overworld') as OverworldScene).interact() };
}
