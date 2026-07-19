import Phaser from 'phaser';
import { isBlockedOverworldTile, isWallTile } from './overworldMap';

export class OverworldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle;
  private steps = 0;
  private encounter!: () => void;
  private heal!: () => void;
  private trainer!: () => void;
  private gym!: () => void;
  private position = { x: 7, y: 8 };
  private readonly tile = 32;
  constructor() { super('overworld'); }
  create(data: { onEncounter: () => void; onHeal: () => void; onTrainer: () => void; onGym: () => void }) {
    this.encounter = data.onEncounter;
    this.heal = data.onHeal;
    this.trainer = data.onTrainer;
    this.gym = data.onGym;
    this.cameras.main.setBackgroundColor('#13233d');
    this.drawMap();
    this.player = this.add.rectangle(this.position.x * this.tile + 16, this.position.y * this.tile + 16, 18, 23, 0xffe4b7).setStrokeStyle(3, 0x432d2b).setDepth(4);
    this.add.circle(this.player.x, this.player.y - 7, 7, 0x9c3d48).setDepth(5).setName('hat');
    this.add.text(12, 10, 'TOKUSHIMA  •  AWA GATE', { fontFamily: 'monospace', fontSize: '11px', color: '#fff3cc', stroke: '#182237', strokeThickness: 3 }).setScrollFactor(0).setDepth(8);
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); if (key === 'arrowup' || key === 'w') this.move(0, -1); if (key === 'arrowdown' || key === 's') this.move(0, 1); if (key === 'arrowleft' || key === 'a') this.move(-1, 0); if (key === 'arrowright' || key === 'd') this.move(1, 0);
    });
  }
  move(dx: number, dy: number) {
    const target = { x: this.position.x + dx, y: this.position.y + dy };
    if (isBlockedOverworldTile(target.x, target.y)) return;
    this.position = target;
    this.tweens.add({ targets: this.player, x: target.x * this.tile + 16, y: target.y * this.tile + 16, duration: 100 });
    const hat = this.children.getByName('hat') as Phaser.GameObjects.Arc; this.tweens.add({ targets: hat, x: target.x * this.tile + 16, y: target.y * this.tile + 9, duration: 100 });
    this.steps++;
    if (this.steps >= 5 && target.y < 7 && Math.random() < .42) { this.steps = 0; this.encounter(); }
  }
  interact() {
    if (Math.abs(this.position.x - 6) + Math.abs(this.position.y - 4) <= 1 || Math.abs(this.position.x - 3) + Math.abs(this.position.y - 3) <= 1) this.trainer();
    else if (Math.abs(this.position.x - 12) + Math.abs(this.position.y - 9) <= 1) this.gym();
    else if (this.position.x >= 1 && this.position.x <= 5 && this.position.y >= 7 && this.position.y <= 11) this.heal();
    else this.encounter();
  }
  private drawMap() {
    const g = this.add.graphics();
    for (let y = 1; y < 14; y++) for (let x = 0; x < 15; x++) { const water = y < 4 && x > 10; const grass = y < 7 && x < 10; g.fillStyle(water ? 0x4c9dc4 : grass ? 0x76ad59 : 0xd9bd7e); g.fillRect(x * 32, y * 32, 31, 31); if (grass && (x + y) % 3 === 0) { g.fillStyle(0x407e48); g.fillRect(x * 32 + 8, y * 32 + 19, 3, 7); g.fillRect(x * 32 + 18, y * 32 + 16, 3, 8); } }
    for (let y = 1; y < 14; y++) for (let x = 0; x < 15; x++) if (isWallTile(x, y)) this.drawWallTile(g, x, y);
    g.fillStyle(0xe7dfcb); g.fillRect(2 * 32, 8 * 32, 96, 68); g.fillStyle(0xc55650); g.fillTriangle(58, 256, 106, 230, 154, 256); g.fillStyle(0x51435b); g.fillRect(86, 275, 18, 49);
    this.add.text(61, 296, 'HEALTH HOUSE', { fontFamily: 'monospace', fontSize: '8px', color: '#503a38' });
    g.fillStyle(0x597057); g.fillTriangle(342, 154, 374, 90, 406, 154); g.fillTriangle(374, 154, 406, 86, 438, 154);
    this.add.text(344, 155, 'MT. BIZAN', { fontFamily: 'monospace', fontSize: '9px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
    this.add.text(354, 49, 'NARUTO SEA', { fontFamily: 'monospace', fontSize: '9px', color: '#effaff', stroke: '#182237', strokeThickness: 2 });
    this.add.rectangle(208, 144, 16, 22, 0x75525c).setStrokeStyle(2, 0x2b314a); this.add.text(183, 159, 'RIN', { fontFamily: 'monospace', fontSize: '8px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
    this.add.rectangle(112, 112, 16, 22, 0x4b6a97).setStrokeStyle(2, 0x2b314a); this.add.text(86, 127, 'KAI', { fontFamily: 'monospace', fontSize: '8px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
    this.add.rectangle(400, 304, 45, 42, 0x74508e).setStrokeStyle(3, 0xf0d293); this.add.text(375, 351, 'BIZAN GYM', { fontFamily: 'monospace', fontSize: '8px', color: '#fff3cc', stroke: '#182237', strokeThickness: 2 });
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
