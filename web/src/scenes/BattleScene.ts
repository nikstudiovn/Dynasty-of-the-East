import Phaser from "phaser";
import vi from "../i18n/vi.json";
import { DeterministicEngine } from "../sim/engine";
import { nativeBridge } from "../bridge/nativeBridge";

const TILE_W = 48;
const TILE_H = 24;
const MAP_SIZE = 24;

export class BattleScene extends Phaser.Scene {
  private engine = new DeterministicEngine();
  private accumulatorMs = 0;
  private hudText?: Phaser.GameObjects.Text;
  private isDragging = false;
  private dragOrigin = new Phaser.Math.Vector2();

  constructor() {
    super("BattleScene");
  }

  create(): void {
    this.engine.addPlayer("p1", "dai_viet");
    this.drawIsometricDiamondMap();
    this.setupTouchCamera();
    this.createHud();
  }

  private tileToIso(tx: number, ty: number): { x: number; y: number } {
    return {
      x: (tx - ty) * (TILE_W / 2),
      y: (tx + ty) * (TILE_H / 2)
    };
  }

  private drawIsometricDiamondMap(): void {
    const g = this.add.graphics();
    for (let ty = 0; ty < MAP_SIZE; ty++) {
      for (let tx = 0; tx < MAP_SIZE; tx++) {
        const { x, y } = this.tileToIso(tx, ty);
        const isRice = tx >= 3 && tx <= 6 && ty >= 3 && ty <= 5;
        const isBamboo = (tx + ty) % 7 === 0 && tx > 8;
        const fill = isRice ? 0x65a30d : isBamboo ? 0x166534 : 0x4d7c0f;
        g.fillStyle(fill, 1);
        g.lineStyle(1, 0x365314, 0.35);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + TILE_W / 2, y + TILE_H / 2);
        g.lineTo(x, y + TILE_H);
        g.lineTo(x - TILE_W / 2, y + TILE_H / 2);
        g.closePath();
        g.fillPath();
        g.strokePath();
      }
    }

    // Center Village Hall marker (crimson lacquer roof)
    const center = this.tileToIso(5, 5);
    g.fillStyle(0xb91c1c, 1);
    g.fillRect(center.x - 16, center.y - 14, 32, 20);
    g.fillStyle(0xf59e0b, 1);
    g.fillRect(center.x - 18, center.y - 18, 36, 5);

    this.cameras.main.centerOn(center.x, center.y);
  }

  private setupTouchCamera(): void {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.isDragging = true;
      this.dragOrigin.set(p.x, p.y);
      nativeBridge.triggerHaptic("light");
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.isDragging || !p.isDown) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - this.dragOrigin.x) / cam.zoom;
      cam.scrollY -= (p.y - this.dragOrigin.y) / cam.zoom;
      this.dragOrigin.set(p.x, p.y);
    });

    this.input.on("pointerup", () => {
      this.isDragging = false;
    });
  }

  private createHud(): void {
    this.hudText = this.add
      .text(16, 14, "", {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#FAF7F2",
        backgroundColor: "#1C1614CC",
        padding: { x: 10, y: 6 }
      })
      .setScrollFactor(0)
      .setDepth(1000);
    this.refreshHud();
  }

  private refreshHud(): void {
    const p1 = this.engine.players.get("p1");
    if (!p1 || !this.hudText) return;
    const r = p1.resources;
    this.hudText.setText(
      `${vi["game.title"]} | ${vi["faction.dai_viet"]} | Đời ${p1.age} | Thực:${r.food} Gỗ:${r.wood} Vàng:${r.gold} Đá:${r.stone} | Dân:${p1.population}/${p1.populationCap}`
    );
  }

  update(_time: number, deltaMs: number): void {
    const stepMs = 1000 / this.engine.tickRateHz;
    this.accumulatorMs += deltaMs;
    while (this.accumulatorMs >= stepMs) {
      this.engine.stepTick();
      this.accumulatorMs -= stepMs;
    }
    this.refreshHud();
  }
}
