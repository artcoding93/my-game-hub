import * as Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import type { GoldEscapeController } from "../controller";
import { fromCell, toCell } from "../logic/level";
import { actorPosition } from "../logic/simulation";
import { Tile, type Actor, type GameEvent, type GameState, type Guard } from "../types";
import {
  assertPixelArt,
  BRICK,
  BRICK_PALETTE,
  CHARACTER_FRAMES,
  ESCAPE_LADDER_PALETTE,
  EXIT_ARROW,
  EXIT_PALETTE,
  GOLD,
  GOLD_PALETTE,
  GUARD_PALETTE,
  LADDER,
  LADDER_PALETTE,
  PLAYER_PALETTE,
  ROPE,
  ROPE_PALETTE,
  SOLID,
  SOLID_PALETTE,
  type CharacterFrame,
  type Palette,
  type PixelArt,
} from "./sprites";

const TS = GAME_CONFIG.tileSize;
const { lifetime: HOLE_LIFETIME, warningTime: HOLE_WARNING } = GAME_CONFIG.hole;

/**
 * Gold Escape 렌더러.
 * 게임 규칙은 전혀 알지 못하며, 매 프레임 controller.update()로 시뮬레이션을 진행한 뒤
 * GameState를 그대로 화면에 옮긴다. 이벤트(금괴 획득·사망 등)는 연출에만 쓴다.
 */
export class GoldEscapeScene extends Phaser.Scene {
  private readonly controller: GoldEscapeController;
  private tileImages = new Map<number, Phaser.GameObjects.Image>();
  private escapeImages: Phaser.GameObjects.Image[] = [];
  private goldImages = new Map<number, Phaser.GameObjects.Image>();
  private exitArrow: Phaser.GameObjects.Image | null = null;
  private playerSprite!: Phaser.GameObjects.Image;
  private guardSprites: Phaser.GameObjects.Image[] = [];

  constructor(controller: GoldEscapeController) {
    super("gold-escape");
    this.controller = controller;
  }

  create() {
    this.createTextures();
    this.buildStage();
  }

  update(_time: number, delta: number) {
    const events = this.controller.update(delta / 1000);
    for (const event of events) this.handleEvent(event);
    this.syncHoles();
    this.syncActors();
  }

  // ── 텍스처 ──

  private paint(key: string, art: PixelArt, palette: Palette) {
    assertPixelArt(key, art);
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, TS, TS);
    if (!texture) return;
    const ctx = texture.getContext();
    art.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const color = palette[char];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    texture.refresh();
  }

  private createTextures() {
    this.paint("brick", BRICK, BRICK_PALETTE);
    this.paint("solid", SOLID, SOLID_PALETTE);
    this.paint("ladder", LADDER, LADDER_PALETTE);
    this.paint("escape", LADDER, ESCAPE_LADDER_PALETTE);
    this.paint("rope", ROPE, ROPE_PALETTE);
    this.paint("gold", GOLD, GOLD_PALETTE);
    this.paint("exit", EXIT_ARROW, EXIT_PALETTE);
    for (const [frame, art] of Object.entries(CHARACTER_FRAMES)) {
      this.paint(`player-${frame}`, art, PLAYER_PALETTE);
      this.paint(`guard-${frame}`, art, GUARD_PALETTE);
    }
  }

  // ── 스테이지 ──

  private get state(): GameState {
    return this.controller.state;
  }

  private buildStage() {
    this.children.removeAll(true);
    this.tileImages.clear();
    this.goldImages.clear();
    this.escapeImages = [];

    const { level } = this.state;
    const textureFor: Partial<Record<Tile, string>> = {
      [Tile.Brick]: "brick",
      [Tile.Solid]: "solid",
      [Tile.Ladder]: "ladder",
      [Tile.Rope]: "rope",
      [Tile.EscapeLadder]: "escape",
    };

    level.tiles.forEach((tile, cell) => {
      const key = textureFor[tile];
      if (!key) return;
      const { x, y } = fromCell(level, cell);
      const image = this.add.image(x * TS, y * TS, key).setOrigin(0);
      if (tile === Tile.EscapeLadder) {
        image.setVisible(this.state.escapeRevealed);
        this.escapeImages.push(image);
      } else {
        this.tileImages.set(cell, image);
      }
    });

    for (const cell of this.state.gold) {
      const { x, y } = fromCell(level, cell);
      this.goldImages.set(cell, this.add.image(x * TS, y * TS, "gold").setOrigin(0));
    }

    const exitCell = level.tiles.findIndex((tile, cell) => tile === Tile.EscapeLadder && cell < level.width);
    this.exitArrow =
      exitCell >= 0
        ? this.add.image(exitCell * TS, 0, "exit").setOrigin(0).setVisible(this.state.escapeRevealed).setDepth(5)
        : null;

    this.guardSprites = this.state.guards.map(() => this.add.image(0, 0, "guard-stand").setOrigin(0).setDepth(10));
    this.playerSprite = this.add.image(0, 0, "player-stand").setOrigin(0).setDepth(11);
    this.syncActors();
  }

  private handleEvent(event: GameEvent) {
    switch (event.type) {
      case "stageStarted":
        this.buildStage();
        break;
      case "goldCollected": {
        this.goldImages.get(event.cell)?.destroy();
        this.goldImages.delete(event.cell);
        const { x, y } = fromCell(this.state.level, event.cell);
        this.floatText(x, y, `+${GAME_CONFIG.score.gold}`, "#facc15");
        break;
      }
      case "escapeRevealed":
        this.escapeImages.forEach((image) => image.setVisible(true));
        this.exitArrow?.setVisible(true);
        this.cameras.main.flash(250, 74, 222, 128);
        break;
      case "guardTrapped":
      case "guardKilled": {
        const guard = this.state.guards[event.guardId];
        const points = event.type === "guardTrapped" ? GAME_CONFIG.score.guardTrapped : GAME_CONFIG.score.guardKilled;
        if (guard) this.floatText(guard.x, guard.y, `+${points}`, "#fda4af");
        break;
      }
      case "playerDied":
        this.cameras.main.shake(300, 0.01);
        break;
      case "stageCleared":
        this.cameras.main.flash(400, 250, 204, 21);
        break;
      default:
        break;
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const label = this.add
      .text(x * TS + TS / 2, y * TS, text, { fontFamily: "monospace", fontSize: "10px", color, stroke: "#000", strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(20)
      .setResolution(4);
    this.tweens.add({ targets: label, y: label.y - 14, alpha: 0, duration: 800, onComplete: () => label.destroy() });
  }

  // ── 매 프레임 동기화 ──

  /** 구멍은 벽돌을 숨기고, 메워지기 직전에는 벽돌이 깜빡이며 차오르게 보여 준다. */
  private syncHoles() {
    for (const [cell, image] of this.tileImages) {
      const hole = this.state.holes.get(cell);
      if (!hole) {
        if (!image.visible || image.alpha !== 1) image.setVisible(true).setAlpha(1).clearTint();
        continue;
      }
      const remaining = HOLE_LIFETIME - (this.state.time - hole.dugAt);
      if (remaining > HOLE_WARNING) {
        image.setVisible(false);
      } else {
        const fill = 1 - remaining / HOLE_WARNING;
        const blink = Math.floor(remaining * 10) % 2 === 0;
        image.setVisible(true).setAlpha(0.25 + fill * 0.6).setTint(blink ? 0xffffff : 0xff6b6b);
      }
    }
  }

  private frameFor(actor: Actor): { frame: CharacterFrame; flip: boolean } {
    const { level } = this.state;
    const cellX = actor.progress >= 0.5 ? actor.tx : actor.x;
    const cellY = actor.progress >= 0.5 ? actor.ty : actor.y;
    const tile = level.tiles[toCell(level, cellX, cellY)];
    const onRope = tile === Tile.Rope;
    const onLadder = tile === Tile.Ladder || (tile === Tile.EscapeLadder && this.state.escapeRevealed);
    const step = actor.progress < 0.5;
    const flip = actor.facing < 0;

    switch (actor.move) {
      case "fall":
        return { frame: "fall", flip };
      case "up":
      case "down":
        return { frame: "climbBack", flip: step };
      case "left":
      case "right":
        if (onRope) return { frame: step ? "hang1" : "hang2", flip };
        return { frame: step ? "run1" : "run2", flip };
      default:
        if (onRope) return { frame: "hang1", flip };
        if (onLadder) return { frame: "climbBack", flip: false };
        return { frame: "stand", flip };
    }
  }

  private place(sprite: Phaser.GameObjects.Image, actor: Actor) {
    const { x, y } = actorPosition(actor);
    sprite.setPosition(Math.round(x * TS), Math.round(y * TS));
  }

  private syncActors() {
    const { player, guards, time, phase } = this.state;

    const playerFrame = this.frameFor(player);
    this.playerSprite.setTexture(`player-${playerFrame.frame}`).setFlipX(playerFrame.flip);
    this.place(this.playerSprite, player);
    if (player.status === "dead") {
      // 사망 연출: 빨갛게 깜빡이며 사라진다.
      const t = phase === "dying" ? 1 - (this.state.phaseUntil - time) / GAME_CONFIG.timing.dying : 1;
      this.playerSprite.setTint(Math.floor(t * 12) % 2 ? 0xff4d4d : 0xffffff).setAlpha(Math.max(0, 1 - t));
    } else {
      const invincible = time < player.invincibleUntil && phase === "playing";
      this.playerSprite.clearTint().setAlpha(invincible && Math.floor(time * 10) % 2 ? 0.35 : 1);
    }

    guards.forEach((guard, i) => {
      const sprite = this.guardSprites[i];
      if (!sprite) return;
      this.syncGuard(sprite, guard, time);
    });
  }

  private syncGuard(sprite: Phaser.GameObjects.Image, guard: Guard, time: number) {
    if (guard.status === "dead") {
      sprite.setVisible(false);
      return;
    }
    const { frame, flip } = this.frameFor(guard);
    sprite.setVisible(true).setTexture(`guard-${guard.status === "climbing" ? "climbBack" : frame}`).setFlipX(flip);
    this.place(sprite, guard);

    if (guard.status === "trapped") {
      // 갇힌 경비원은 버둥거리고, 탈출 직전에는 더 크게 흔들린다.
      const elapsed = time - guard.statusSince;
      const urgent = elapsed > GAME_CONFIG.guard.trapDuration - 0.8;
      sprite.x += Math.round(Math.sin(time * (urgent ? 40 : 18)) * (urgent ? 2 : 1));
      sprite.setTint(0xc4b5fd);
    } else {
      sprite.clearTint();
    }
    // 다시 나타난 직후 잠깐 깜빡인다.
    sprite.setAlpha(guard.status === "chasing" && time - guard.statusSince < 0.6 && Math.floor(time * 12) % 2 ? 0.4 : 1);
  }
}
