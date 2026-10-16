import * as Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import type { StarVanguardController } from "../controller";
import type { Bullet, Enemy, EnemyKind, GameEvent, GameState, PowerUpKind } from "../types";
import {
  assertPixelArt,
  BOSS_BULLET,
  BOSS_CORE,
  BOSS_HULL,
  BOSS_RING,
  ENEMY_BULLET,
  ENEMY_SPRITES,
  FLAME,
  PLAYER,
  PLAYER_BULLET,
  POWER_UP_COLORS,
  powerUpSprite,
  SPARK,
  type SpriteDef,
} from "./sprites";

const { width: W, height: H } = GAME_CONFIG;
const POWER_UP_KINDS: PowerUpKind[] = ["rapid", "double", "shield", "life"];
const POWER_UP_LABELS: Record<PowerUpKind, string> = {
  rapid: "RAPID FIRE",
  double: "DOUBLE SHOT",
  shield: "SHIELD",
  life: "1UP",
};
const EXPLOSION_TINTS: Record<EnemyKind | "player", number[]> = {
  scout: [0x38bdf8, 0xe0f2fe, 0x22d3ee],
  interceptor: [0xd946ef, 0xf5d0fe, 0xa78bfa],
  sentinel: [0xfb923c, 0xfde047, 0xef4444],
  core: [0xe879f9, 0xfb923c, 0xffffff, 0xfde047],
  player: [0x67e8f9, 0xffffff, 0xfb923c, 0x3b82f6],
};

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
  color: number;
  twinkle: number;
}

interface BossParts {
  hull: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
}

/**
 * Star Vanguard 렌더러.
 * 게임 규칙은 알지 못하며, 매 프레임 controller.update()로 시뮬레이션을 진행한 뒤 GameState를 화면에 옮긴다.
 * 이벤트(격추·피격 등)는 폭발·점수 표시 같은 연출에만 쓴다. 별 배경은 순수 연출이라 여기서만 관리한다.
 */
export class StarVanguardScene extends Phaser.Scene {
  private readonly controller: StarVanguardController;
  private stars: Star[] = [];
  private starGraphics!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Image;
  private flames: Phaser.GameObjects.Image[] = [];
  private enemySprites = new Map<number, Phaser.GameObjects.Image>();
  private bossSprites = new Map<number, BossParts>();
  private headings = new Map<number, { x: number; y: number; angle: number }>();
  private bulletSprites = new Map<number, Phaser.GameObjects.Image>();
  private powerUpSprites = new Map<number, Phaser.GameObjects.Image>();
  private emitters = {} as Record<EnemyKind | "player", Phaser.GameObjects.Particles.ParticleEmitter>;
  private elapsed = 0;

  constructor(controller: StarVanguardController) {
    super("star-vanguard");
    this.controller = controller;
  }

  private get state(): GameState {
    return this.controller.state;
  }

  create() {
    this.createTextures();
    this.createStars();
    this.starGraphics = this.add.graphics().setDepth(0);
    this.fx = this.add.graphics().setDepth(30);
    this.flames = [-4, 4].map(() => this.add.image(0, 0, "flame").setDepth(19));
    this.player = this.add.image(W / 2, GAME_CONFIG.player.y, "player").setDepth(20);
    for (const key of Object.keys(EXPLOSION_TINTS) as (EnemyKind | "player")[]) {
      const big = key === "core" || key === "player";
      this.emitters[key] = this.add
        .particles(0, 0, "spark", {
          speed: { min: 20, max: big ? 150 : 100 },
          lifespan: { min: 250, max: big ? 900 : 550 },
          scale: { start: 1, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: EXPLOSION_TINTS[key],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        })
        .setDepth(40);
    }
  }

  update(_time: number, delta: number) {
    const events = this.controller.update(delta / 1000);
    for (const event of events) this.handleEvent(event);

    const running = this.state.phase !== "paused";
    if (running) this.elapsed += delta / 1000;
    this.drawStars(running ? delta / 1000 : 0);
    this.fx.clear();
    this.syncPlayer();
    this.syncEnemies();
    this.syncBullets();
    this.syncPowerUps();
  }

  // ── 텍스처 ──

  private paint(key: string, sprite: SpriteDef) {
    assertPixelArt(key, sprite.art);
    if (this.textures.exists(key)) return;
    const width = sprite.art[0].length;
    const height = sprite.art.length;
    const texture = this.textures.createCanvas(key, width, height);
    if (!texture) return;
    const ctx = texture.getContext();
    sprite.art.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const color = sprite.palette[char];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    texture.refresh();
  }

  private createTextures() {
    this.paint("player", PLAYER);
    for (const [kind, sprite] of Object.entries(ENEMY_SPRITES)) this.paint(`enemy-${kind}`, sprite);
    this.paint("boss-hull", BOSS_HULL);
    this.paint("boss-ring", BOSS_RING);
    this.paint("boss-core", BOSS_CORE);
    this.paint("bullet-player", PLAYER_BULLET);
    this.paint("bullet-enemy", ENEMY_BULLET);
    this.paint("bullet-boss", BOSS_BULLET);
    this.paint("spark", SPARK);
    this.paint("flame", FLAME);
    for (const kind of POWER_UP_KINDS) this.paint(`power-${kind}`, powerUpSprite(kind));
  }

  // ── 별 배경 (3겹 시차 스크롤) ──

  private createStars() {
    const layers = [
      { count: 45, speed: 6, size: 1, color: 0x334155 },
      { count: 25, speed: 16, size: 1, color: 0x94a3b8 },
      { count: 10, speed: 38, size: 2, color: 0xe2e8f0 },
    ];
    this.stars = layers.flatMap((layer) =>
      Array.from({ length: layer.count }, () => ({
        x: Math.floor(Math.random() * W),
        y: Math.random() * H,
        speed: layer.speed * (0.8 + Math.random() * 0.4),
        size: layer.size,
        color: layer.color,
        twinkle: Math.random() * Math.PI * 2,
      })),
    );
  }

  private drawStars(dt: number) {
    const g = this.starGraphics;
    g.clear();
    for (const star of this.stars) {
      star.y += star.speed * dt;
      if (star.y > H) {
        star.y -= H;
        star.x = Math.floor(Math.random() * W);
      }
      const alpha = 0.6 + 0.4 * Math.sin(this.elapsed * 2 + star.twinkle);
      g.fillStyle(star.color, alpha);
      g.fillRect(star.x, Math.floor(star.y), 1, star.size);
    }
  }

  // ── 이벤트 연출 ──

  private handleEvent(event: GameEvent) {
    switch (event.type) {
      case "enemyKilled":
        this.explode(event.kind, event.x, event.y);
        if (event.points > 0) this.floatText(event.x, event.y - 6, `${event.points}`, event.kind === "core" ? "#fde047" : "#ffffff", event.kind === "core" ? 12 : 8);
        if (event.kind === "core") {
          this.cameras.main.shake(500, 0.012);
          this.cameras.main.flash(300, 232, 121, 249);
        }
        break;
      case "playerHit":
        this.explode("player", event.x, event.y);
        this.cameras.main.shake(350, 0.01);
        break;
      case "shieldBlocked":
        this.ring(event.x, event.y, 0x4ade80, 2.4);
        this.floatText(event.x, event.y - 12, "BLOCK", "#4ade80", 8);
        break;
      case "powerUpCollected":
        this.ring(event.x, event.y, Phaser.Display.Color.HexStringToColor(POWER_UP_COLORS[event.kind]).color, 1.6);
        this.floatText(event.x, event.y - 10, POWER_UP_LABELS[event.kind], POWER_UP_COLORS[event.kind], 8);
        break;
      case "waveStarted":
        if (event.boss) this.cameras.main.flash(400, 120, 20, 60);
        break;
      default:
        break;
    }
  }

  private explode(kind: EnemyKind | "player", x: number, y: number) {
    const count = kind === "core" ? 70 : kind === "player" ? 40 : kind === "sentinel" ? 22 : 14;
    this.emitters[kind].explode(count, x, y);
    this.ring(x, y, EXPLOSION_TINTS[kind][0], kind === "core" ? 4 : 1.4);
  }

  /** 퍼져 나가며 사라지는 충격파 고리 */
  private ring(x: number, y: number, color: number, size: number) {
    const circle = this.add.circle(x, y, 8).setStrokeStyle(1, color).setDepth(39);
    circle.setFillStyle();
    circle.setScale(0.3);
    this.tweens.add({ targets: circle, scale: size, alpha: 0, duration: 350, onComplete: () => circle.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number) {
    const label = this.add
      .text(Phaser.Math.Clamp(x, 20, W - 20), y, text, {
        fontFamily: "monospace",
        fontSize: `${size}px`,
        fontStyle: "bold",
        color,
        stroke: "#000",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(50)
      .setResolution(4);
    this.tweens.add({ targets: label, y: label.y - 16, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => label.destroy() });
  }

  // ── 매 프레임 동기화 ──

  private syncPlayer() {
    const { player, time, phase } = this.state;
    const visible = player.alive && phase !== "ready" && phase !== "gameOver";
    this.player.setVisible(visible).setPosition(Math.round(player.x), player.y);
    const invincible = time < player.invincibleUntil;
    this.player.setAlpha(invincible && Math.floor(time * 12) % 2 ? 0.3 : 1);

    // 엔진 불꽃 (길이가 깜빡이며 변한다)
    this.flames.forEach((flame, i) => {
      const flicker = 0.7 + 0.5 * Math.abs(Math.sin(this.elapsed * 30 + i * 1.7));
      flame
        .setVisible(visible)
        .setPosition(Math.round(player.x) + (i === 0 ? -4 : 4), player.y + 8)
        .setScale(1, flicker)
        .setAlpha(this.player.alpha);
    });

    if (visible && player.shield) {
      const pulse = 0.5 + 0.3 * Math.sin(this.elapsed * 6);
      this.fx.lineStyle(1, 0x4ade80, pulse).strokeCircle(player.x, player.y, 11);
      this.fx.lineStyle(1, 0x86efac, pulse * 0.5).strokeCircle(player.x, player.y, 13);
    }
  }

  private syncEnemies() {
    const { enemies, time } = this.state;
    const seen = new Set<number>();

    for (const enemy of enemies) {
      seen.add(enemy.id);
      if (enemy.kind === "core") {
        this.syncBoss(enemy, time);
        continue;
      }
      let sprite = this.enemySprites.get(enemy.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, `enemy-${enemy.kind}`).setDepth(10);
        this.enemySprites.set(enemy.id, sprite);
      }
      sprite.setVisible(enemy.mode !== "waiting").setPosition(Math.round(enemy.x), Math.round(enemy.y));
      sprite.setRotation(this.headingFor(enemy));

      if (time - enemy.hitAt < 0.08) sprite.setTintFill(0xffffff);
      else if (enemy.hp < enemy.maxHp) sprite.setTint(enemy.hp === 1 ? 0xff8a8a : 0xffc4a0);
      else sprite.clearTint();
    }

    for (const [id, sprite] of this.enemySprites) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.enemySprites.delete(id);
      this.headings.delete(id);
    }
    for (const [id, parts] of this.bossSprites) {
      if (seen.has(id)) continue;
      parts.hull.destroy();
      parts.ring.destroy();
      parts.core.destroy();
      this.bossSprites.delete(id);
    }
  }

  /** 진행 방향으로 기체를 기울인다. 편대에 있을 때는 정면(아래)을 본다. */
  private headingFor(enemy: Enemy): number {
    const prev = this.headings.get(enemy.id);
    let target = 0;
    if (prev && (enemy.mode === "entering" || enemy.mode === "diving" || enemy.mode === "returning")) {
      const dx = enemy.x - prev.x;
      const dy = enemy.y - prev.y;
      const distance = dx * dx + dy * dy;
      // 화면 아래에서 위로 다시 나타날 때는 순간 이동이므로 방향 계산에서 뺀다.
      if (distance > 0.01 && distance < 40 * 40) target = Math.atan2(dy, dx) - Math.PI / 2;
      else target = prev.angle;
    }
    const current = prev?.angle ?? 0;
    const angle = current + Phaser.Math.Angle.Wrap(target - current) * 0.25;
    this.headings.set(enemy.id, { x: enemy.x, y: enemy.y, angle });
    return angle;
  }

  private syncBoss(boss: Enemy, time: number) {
    let parts = this.bossSprites.get(boss.id);
    if (!parts) {
      parts = {
        hull: this.add.image(0, 0, "boss-hull").setDepth(9),
        ring: this.add.image(0, 0, "boss-ring").setDepth(10),
        core: this.add.image(0, 0, "boss-core").setDepth(11),
      };
      this.bossSprites.set(boss.id, parts);
    }
    const visible = boss.mode !== "waiting";
    const x = Math.round(boss.x);
    const y = Math.round(boss.y);
    const flash = time - boss.hitAt < 0.08;
    parts.hull.setVisible(visible).setPosition(x, y);
    parts.ring.setVisible(visible).setPosition(x, y).setRotation(this.elapsed * 0.9);
    const hpRatio = boss.hp / boss.maxHp;
    // 체력이 줄수록 코어가 빠르게 맥동한다.
    const pulse = 1 + 0.15 * Math.sin(this.elapsed * (4 + (1 - hpRatio) * 10));
    parts.core.setVisible(visible).setPosition(x, y).setScale(pulse).setRotation(-this.elapsed * 1.5);
    for (const part of [parts.hull, parts.ring, parts.core]) {
      if (flash) part.setTintFill(0xffffff);
      else part.clearTint();
    }

    // 상단 체력 막대
    if (visible) {
      const barWidth = 120;
      const left = (W - barWidth) / 2;
      this.fx.fillStyle(0x000000, 0.6).fillRect(left - 1, 3, barWidth + 2, 5);
      this.fx.fillStyle(0x3b0764, 1).fillRect(left, 4, barWidth, 3);
      this.fx.fillStyle(hpRatio > 0.3 ? 0xe879f9 : 0xfb923c, 1).fillRect(left, 4, Math.ceil(barWidth * hpRatio), 3);
    }
  }

  private syncBullets() {
    const { playerBullets, enemyBullets } = this.state;
    const seen = new Set<number>();
    const sync = (bullet: Bullet, key: string) => {
      seen.add(bullet.id);
      let sprite = this.bulletSprites.get(bullet.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, key).setDepth(15);
        this.bulletSprites.set(bullet.id, sprite);
      }
      sprite.setPosition(Math.round(bullet.x), Math.round(bullet.y));
    };
    for (const bullet of playerBullets) sync(bullet, "bullet-player");
    for (const bullet of enemyBullets) sync(bullet, bullet.fromBoss ? "bullet-boss" : "bullet-enemy");
    for (const [id, sprite] of this.bulletSprites) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.bulletSprites.delete(id);
    }
  }

  private syncPowerUps() {
    const seen = new Set<number>();
    for (const item of this.state.powerUps) {
      seen.add(item.id);
      let sprite = this.powerUpSprites.get(item.id);
      if (!sprite) {
        sprite = this.add.image(0, 0, `power-${item.kind}`).setDepth(16);
        this.powerUpSprites.set(item.id, sprite);
      }
      // 떨어지며 살짝 흔들리고 빛난다.
      sprite.setPosition(Math.round(item.x + Math.sin(this.elapsed * 5 + item.id) * 2), Math.round(item.y));
      sprite.setAlpha(0.75 + 0.25 * Math.sin(this.elapsed * 10));
    }
    for (const [id, sprite] of this.powerUpSprites) {
      if (seen.has(id)) continue;
      sprite.destroy();
      this.powerUpSprites.delete(id);
    }
  }
}
