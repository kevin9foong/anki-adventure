import Phaser from 'phaser';
import { handleOverworldKey } from './overworldControls';
import { isBlockedOverworldTile, isWallTile } from './overworldMap';

export class OverworldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private steps = 0;
  private encounter!: () => void;
  private heal!: () => void;
  private trainer!: () => void;
  private gym!: () => void;
  private position = { x: 7, y: 8 };
  private readonly tile = 32;
  constructor() { super('overworld'); }
  create(data: Partial<{ onEncounter: () => void; onHeal: () => void; onTrainer: () => void; onGym: () => void }> = {}) {
    // Phaser auto-starts the first configured scene before createGame can
    // attach its callbacks. The ready-event restart supplies the real ones.
    this.encounter = data.onEncounter ?? (() => undefined);
    this.heal = data.onHeal ?? (() => undefined);
    this.trainer = data.onTrainer ?? (() => undefined);
    this.gym = data.onGym ?? (() => undefined);
    this.cameras.main.setBackgroundColor('#13233d');
    this.drawMap();
    this.player = this.createPlayerSprite(this.position.x * this.tile + 16, this.position.y * this.tile + 16);
    this.add.text(12, 10, 'TOKUSHIMA  •  AWA GATE', { fontFamily: 'monospace', fontSize: '11px', color: '#fff3cc', stroke: '#182237', strokeThickness: 3 }).setScrollFactor(0).setDepth(8);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      handleOverworldKey(event, { move: this.move.bind(this), interact: this.interact.bind(this) });
    });
  }
  move(dx: number, dy: number) {
    const target = { x: this.position.x + dx, y: this.position.y + dy };
    if (isBlockedOverworldTile(target.x, target.y)) return;
    this.position = target;
    this.tweens.add({ targets: this.player, x: target.x * this.tile + 16, y: target.y * this.tile + 16, duration: 100 });
    this.steps++;
    if (this.steps >= 5 && target.y < 7 && Math.random() < .42) { this.steps = 0; this.encounter(); }
  }
  returnToHealthHouse() {
    this.position = { x: 3, y: 9 };
    this.player.setPosition(this.position.x * this.tile + 16, this.position.y * this.tile + 16);
  }
  interact() {
    if (Math.abs(this.position.x - 6) + Math.abs(this.position.y - 4) <= 1 || Math.abs(this.position.x - 3) + Math.abs(this.position.y - 3) <= 1) this.trainer();
    else if (Math.abs(this.position.x - 12) + Math.abs(this.position.y - 9) <= 1) this.gym();
    else if (this.position.x >= 1 && this.position.x <= 5 && this.position.y >= 7 && this.position.y <= 11) this.heal();
    else this.encounter();
  }
  private drawMap() {
    const g = this.add.graphics();
    for (let y = 1; y < 14; y++) for (let x = 0; x < 15; x++) { const water = y < 4 && x > 10; const grass = y < 7 && x < 10; g.fillStyle(water ? 0x4c9dc4 : grass ? 0x76ad59 : 0xd9bd7e); g.fillRect(x * 32, y * 32, 31, 31); if (water && (x * 3 + y) % 3 === 0) { g.fillStyle(0x9edcec); g.fillRect(x * 32 + 5, y * 32 + 8, 9, 2); g.fillRect(x * 32 + 18, y * 32 + 21, 7, 2); } if (grass && (x + y) % 3 === 0) { g.fillStyle(0x407e48); g.fillRect(x * 32 + 8, y * 32 + 19, 3, 7); g.fillRect(x * 32 + 18, y * 32 + 16, 3, 8); } }
    for (let y = 1; y < 14; y++) for (let x = 0; x < 15; x++) if (isWallTile(x, y)) this.drawWallTile(g, x, y);
    this.drawHealthHouse(g);
    this.add.text(61, 296, 'HEALTH HOUSE', { fontFamily: 'monospace', fontSize: '8px', color: '#503a38' });
    this.drawMountain(g);
    this.add.text(344, 155, 'MT. BIZAN', { fontFamily: 'monospace', fontSize: '9px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
    this.drawNarutoWhirlpools(g);
    this.add.text(354, 49, 'NARUTO SEA', { fontFamily: 'monospace', fontSize: '9px', color: '#effaff', stroke: '#182237', strokeThickness: 2 });
    this.drawTrainer(g, 208, 144, 0x9a5a72); this.add.text(183, 159, 'RIN', { fontFamily: 'monospace', fontSize: '8px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
    this.drawTrainer(g, 112, 112, 0x4b6a97); this.add.text(86, 127, 'KAI', { fontFamily: 'monospace', fontSize: '8px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
    this.drawGym(g); this.add.text(375, 351, 'BIZAN GYM', { fontFamily: 'monospace', fontSize: '8px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
  }
  private createPlayerSprite(x: number, y: number) {
    const sprite = this.add.container(x, y).setDepth(5);
    const g = this.add.graphics();
    // A tiny overworld trainer: crisp white tee, dark selvedge-style denim, and silver frames.
    g.fillStyle(0x405061, 0.45); g.fillEllipse(-1, 12, 22, 7);
    g.fillStyle(0x182237); g.fillRect(-9, 4, 18, 14);
    g.fillStyle(0xf4f0df); g.fillRect(-7, 5, 14, 11); g.fillStyle(0xffffff); g.fillRect(-4, 6, 8, 8); g.fillStyle(0xd7d1be); g.fillRect(-8, 12, 16, 3);
    g.fillStyle(0x1f3454); g.fillRect(-7, 16, 5, 5); g.fillRect(2, 16, 5, 5); g.fillStyle(0x41628b); g.fillRect(-6, 17, 2, 3); g.fillRect(3, 17, 2, 3); g.fillStyle(0xe07e47); g.fillRect(-2, 16, 4, 2); g.fillStyle(0x141b2b); g.fillRect(-9, 20, 8, 3); g.fillRect(1, 20, 8, 3);
    g.fillStyle(0x51382f); g.fillRect(-7, -12, 14, 13); g.fillStyle(0xe7c093); g.fillRect(-5, -8, 10, 8); g.fillRect(-4, 0, 8, 2);
    g.fillStyle(0x1c2028); g.fillRect(-6, -12, 12, 6); g.fillRect(-5, -14, 10, 3); g.fillStyle(0x553d34); g.fillRect(-7, -8, 2, 5); g.fillRect(5, -8, 2, 5); g.fillStyle(0x9b7056); g.fillRect(-6, -5, 1, 3); g.fillRect(5, -5, 1, 3);
    g.fillStyle(0xc5d2dc); g.fillRect(-5, -4, 4, 3); g.fillRect(1, -4, 4, 3); g.fillRect(-1, -3, 2, 1); g.fillStyle(0x53626f); g.fillRect(-4, -3, 2, 1); g.fillRect(2, -3, 2, 1);
    g.fillStyle(0xb77b5d); g.fillRect(-4, 1, 2, 1); g.fillRect(2, 1, 2, 1); g.fillStyle(0x6d4638); g.fillRect(-2, 2, 4, 1);
    g.fillStyle(0xf0d293); g.fillRect(-12, 6, 4, 8); g.fillRect(8, 6, 4, 8);
    sprite.add(g);
    return sprite;
  }
  private drawHealthHouse(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x60445a); g.fillRect(61, 251, 91, 70);
    g.fillStyle(0xf5e7ce); g.fillRect(65, 255, 83, 62);
    g.fillStyle(0xb74b4d); g.fillTriangle(56, 255, 106, 222, 157, 255); g.fillStyle(0xf27c67); g.fillTriangle(68, 252, 106, 230, 145, 252);
    g.fillStyle(0x69374a); g.fillRect(90, 279, 31, 38); g.fillStyle(0xffdd92); g.fillRect(95, 284, 7, 11); g.fillRect(109, 284, 7, 11);
    g.fillStyle(0xe55e58); g.fillRect(102, 264, 9, 23); g.fillRect(95, 271, 23, 9);
    g.fillStyle(0x507e9b); g.fillRect(70, 269, 14, 16); g.fillRect(128, 269, 14, 16); g.fillStyle(0xd4f4f2); g.fillRect(73, 272, 8, 9); g.fillRect(131, 272, 8, 9);
  }
  private drawMountain(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x395448); g.fillTriangle(337, 155, 374, 83, 413, 155); g.fillTriangle(370, 155, 408, 91, 446, 155);
    g.fillStyle(0x64815c); g.fillTriangle(345, 153, 374, 99, 405, 153); g.fillStyle(0x78946c); g.fillTriangle(378, 153, 408, 105, 436, 153);
    g.fillStyle(0xc8d5bc); g.fillTriangle(367, 98, 374, 83, 382, 99); g.fillStyle(0x4a674e); g.fillRect(356, 137, 8, 4); g.fillRect(393, 126, 9, 4); g.fillRect(417, 142, 8, 4);
  }
  private drawNarutoWhirlpools(g: Phaser.GameObjects.Graphics) {
    for (const [x, y, radius] of [[367, 76, 11], [420, 99, 9], [391, 122, 8]] as const) {
      g.lineStyle(3, 0xd7fbff); g.beginPath(); g.arc(x, y, radius, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(300), false); g.strokePath();
      g.lineStyle(2, 0x247da4); g.beginPath(); g.arc(x, y, radius - 5, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(530), false); g.strokePath();
      g.fillStyle(0xe6ffff); g.fillCircle(x - 1, y + 1, 2);
    }
  }
  private drawTrainer(g: Phaser.GameObjects.Graphics, x: number, y: number, outfit: number) {
    g.fillStyle(0x26344e); g.fillRect(x - 9, y - 8, 18, 25); g.fillStyle(outfit); g.fillRect(x - 7, y + 1, 14, 14); g.fillStyle(0xffd6a3); g.fillRect(x - 5, y - 7, 10, 10);
    g.fillStyle(0x3d3040); g.fillRect(x - 6, y - 10, 12, 5); g.fillRect(x - 7, y - 6, 3, 5); g.fillStyle(0xffe8b7); g.fillRect(x - 4, y - 4, 2, 2); g.fillRect(x + 2, y - 4, 2, 2);
    g.fillStyle(0x26344e); g.fillRect(x - 6, y + 15, 4, 5); g.fillRect(x + 2, y + 15, 4, 5);
  }
  private drawGym(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x2d354f); g.fillRect(397, 299, 54, 49); g.fillStyle(0x77558f); g.fillRect(400, 303, 48, 42); g.fillStyle(0xb890c5); g.fillTriangle(396, 303, 424, 280, 452, 303);
    g.fillStyle(0xf3d293); g.fillRect(418, 322, 13, 23); g.fillStyle(0x352e55); g.fillRect(421, 325, 7, 20); g.fillStyle(0xeff6d2); g.fillCircle(424, 310, 7); g.fillStyle(0xd46462); g.fillRect(421, 307, 7, 7);
    g.fillStyle(0x514566); g.fillRect(403, 313, 10, 10); g.fillRect(436, 313, 10, 10); g.fillStyle(0xb7dcdf); g.fillRect(405, 315, 6, 6); g.fillRect(438, 315, 6, 6);
  }
  private drawWallTile(g: Phaser.GameObjects.Graphics, x: number, y: number) {
    const left = x * this.tile;
    const top = y * this.tile;
    g.fillStyle(0x30384b); g.fillRect(left, top, 31, 31);
    g.fillStyle(0x65718a); g.fillRect(left + 2, top + 3, 27, 26);
    g.fillStyle(0x9da9b7); g.fillRect(left + 3, top + 4, 25, 4);
    g.fillStyle(0x424d63); g.fillRect(left + 2, top + 14, 27, 2); g.fillRect(left + 2, top + 25, 27, 2);
    g.fillStyle(0x4d5870); g.fillRect(left + 9, top + 8, 2, 6); g.fillRect(left + 20, top + 16, 2, 9);
    g.fillStyle(0xc2cad1); g.fillRect(left + 4, top + 9, 5, 2); g.fillRect(left + 12, top + 17, 7, 2);
  }
}
