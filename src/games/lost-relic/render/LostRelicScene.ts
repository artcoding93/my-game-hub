import * as Phaser from "phaser";
import { GAME_CONFIG, TILE } from "../config";
import type { LostRelicController } from "../controller";
import { ITEMS } from "../items";
import { FLAG } from "../rooms";
import { spikePhase } from "../logic/simulation";
import { chestFlag, getRoom, openFlag, searchedFlag } from "../logic/world";
import { ITEM_IDS, type GameEvent, type GameState, type ParsedRoom, type PlacedEntity, type RoomId } from "../types";
import * as S from "./sprites";

const { width: W, height: H, cols: COLS, rows: ROWS } = GAME_CONFIG;
/** 픽셀아트 1픽셀 = 화면 2픽셀 */
const SCALE = 2;
const ART = TILE / SCALE;
const DOOR_OPEN_TIME = 0.6;

/** 방마다 다른 돌 색 (배경 벽, 단단한 돌, 강조) */
const ROOM_TONES: Record<RoomId, { bg: string; bgLine: string; block: string; light: string; dark: string; accent: string }> = {
  r1: { bg: "#241c15", bgLine: "#1a140f", block: "#6b5a45", light: "#8f7a5e", dark: "#3a2f24", accent: "#a16207" },
  r2: { bg: "#221912", bgLine: "#18110c", block: "#5f4b37", light: "#806650", dark: "#33281d", accent: "#92400e" },
  r3: { bg: "#261515", bgLine: "#1b0e0e", block: "#6a4038", light: "#8c5a4f", dark: "#3a211d", accent: "#b91c1c" },
  r4: { bg: "#1c1b20", bgLine: "#141317", block: "#5b5760", light: "#7d7882", dark: "#323036", accent: "#a16207" },
  r5: { bg: "#131e1c", bgLine: "#0d1514", block: "#3f5a55", light: "#5c7d77", dark: "#22322f", accent: "#0e7490" },
  r6: { bg: "#141d17", bgLine: "#0e1510", block: "#45574a", light: "#637a69", dark: "#253029", accent: "#15803d" },
  r7: { bg: "#131723", bgLine: "#0d1019", block: "#3f4a63", light: "#5c6987", dark: "#222838", accent: "#1d4ed8" },
  r8: { bg: "#1b1324", bgLine: "#130d1a", block: "#5a4470", light: "#7d6396", dark: "#30243d", accent: "#a16207" },
};

/** 좌표마다 고정된 의사 난수 (같은 방은 항상 같은 모양) */
function hash(a: number, b: number, c: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface ObjectView {
  entity: PlacedEntity;
  image: Phaser.GameObjects.Image;
  extra?: Phaser.GameObjects.Image;
}

/**
 * Lost Relic 렌더러.
 * 게임 규칙은 알지 못하며, 매 프레임 controller.update()로 시뮬레이션을 진행한 뒤 GameState를 화면에 옮긴다.
 * 방 배경(벽·발판·사다리)은 방에 들어올 때 한 번만 캔버스 텍스처로 그리고, 움직이는 오브젝트만 매 프레임 갱신한다.
 */
export class LostRelicScene extends Phaser.Scene {
  private readonly controller: LostRelicController;
  private roomId: RoomId | null = null;
  private background!: Phaser.GameObjects.Image;
  private views: ObjectView[] = [];
  private spikeImages: { image: Phaser.GameObjects.Image; col: number; row: number; group: number }[] = [];
  private crumbleImages: { image: Phaser.GameObjects.Image; id: string; col: number; row: number }[] = [];
  private flames: { image: Phaser.GameObjects.Image; glow: Phaser.GameObjects.Image; x: number; y: number; seed: number }[] = [];
  private enemyImages = new Map<string, { body: Phaser.GameObjects.Image; mark?: Phaser.GameObjects.Image }>();
  private crusherImages = new Map<string, Phaser.GameObjects.Image>();
  private rockImages = new Map<number, Phaser.GameObjects.Image>();
  private chains!: Phaser.GameObjects.Graphics;
  private warnings!: Phaser.GameObjects.Graphics;
  private player!: Phaser.GameObjects.Image;
  private darkness!: Phaser.GameObjects.RenderTexture;
  private lightBrush!: Phaser.GameObjects.Image;
  private fade!: Phaser.GameObjects.Rectangle;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private elapsed = 0;

  constructor(controller: LostRelicController) {
    super("lost-relic");
    this.controller = controller;
  }

  private get state(): GameState {
    return this.controller.state;
  }

  create() {
    this.createTextures();
    this.background = this.add.image(0, 0, "__DEFAULT").setOrigin(0).setScale(SCALE).setDepth(0);
    this.chains = this.add.graphics().setDepth(9);
    this.warnings = this.add.graphics().setDepth(11);
    this.player = this.add.image(0, 0, "player-idle").setOrigin(0.5, 1).setScale(SCALE).setDepth(20);
    this.darkness = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(40);
    this.lightBrush = this.make.image({ x: 0, y: 0, key: "light", add: false });
    this.fade = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setDepth(60);

    const particle = (texture: string, config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number) =>
      this.add.particles(0, 0, texture, { emitting: false, ...config }).setDepth(depth);
    this.sparks = particle("spark", {
      speed: { min: 30, max: 110 },
      lifespan: { min: 300, max: 700 },
      scale: { start: 2, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    }, 45);
    this.dust = particle("dust", {
      speed: { min: 15, max: 70 },
      angle: { min: 200, max: 340 },
      gravityY: 160,
      lifespan: { min: 300, max: 800 },
      scale: { start: 2, end: 0.5 },
      alpha: { start: 0.9, end: 0 },
    }, 35);
    this.embers = particle("ember", {
      speed: { min: 40, max: 180 },
      lifespan: { min: 300, max: 900 },
      scale: { start: 2.5, end: 0 },
      alpha: { start: 1, end: 0 },
      gravityY: 80,
      blendMode: Phaser.BlendModes.ADD,
    }, 45);
  }

  update(_time: number, delta: number) {
    const events = this.controller.update(delta / 1000);
    if (this.state.room !== this.roomId) this.buildRoom(this.state.room);
    const running = this.state.phase === "playing" || this.state.phase === "dying";
    if (running) this.elapsed += delta / 1000;
    for (const event of events) this.handleEvent(event);

    this.syncObjects();
    this.syncTraps();
    this.syncEnemies();
    this.syncPlayer();
    this.drawLighting();
    this.drawFade();
  }

  // ── 텍스처 ──

  private paint(key: string, sprite: S.SpriteDef) {
    S.assertPixelArt(key, sprite.art);
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
    for (const [name, frame] of Object.entries(S.PLAYER_FRAMES)) this.paint(`player-${name}`, frame);
    this.paint("chest-closed", S.CHEST_CLOSED);
    this.paint("chest-half", S.CHEST_HALF);
    this.paint("chest-open", S.CHEST_OPEN);
    this.paint("chest-sealed", S.CHEST_SEALED);
    this.paint("jar", S.JAR);
    this.paint("jar-empty", S.JAR_EMPTY);
    this.paint("tablet", S.TABLET);
    this.paint("door-bronzeKey", S.DOOR_BRONZE);
    this.paint("door-silverKey", S.DOOR_SILVER);
    this.paint("exit-door", S.EXIT_DOOR);
    this.paint("hatch-slab", S.HATCH_SLAB);
    this.paint("hatch-grate", S.HATCH_GRATE);
    this.paint("stone-gate", S.STONE_GATE);
    this.paint("cracked-wall", S.CRACKED_WALL);
    this.paint("rubble", S.RUBBLE);
    this.paint("loose-brick", S.LOOSE_BRICK);
    this.paint("brick-hole", S.BRICK_HOLE);
    this.paint("statue", S.STATUE);
    this.paint("plate", S.PLATE);
    this.paint("plate-on", S.PLATE_ON);
    this.paint("altar", S.ALTAR);
    S.COIN_FRAMES.forEach((frame, i) => this.paint(`coin-${i}`, frame));
    this.paint("spikes", S.SPIKES);
    this.paint("spike-holes", S.SPIKE_HOLES);
    this.paint("crumble", S.CRUMBLE);
    this.paint("crusher", S.CRUSHER);
    this.paint("rock", S.ROCK);
    S.SNAKE_FRAMES.forEach((frame, i) => this.paint(`snake-${i}`, frame));
    S.BAT_FRAMES.forEach((frame, i) => this.paint(`bat-${i}`, frame));
    S.GUARDIAN_FRAMES.forEach((frame, i) => this.paint(`guardian-${i}`, frame));
    S.FLAME_FRAMES.forEach((frame, i) => this.paint(`flame-${i}`, frame));
    this.paint("alert", S.ALERT_MARK);
    this.paint("spark", S.SPARK);
    this.paint("dust", S.DUST);
    this.paint("ember", { art: ["oo", "oo"], palette: { o: "#fb923c" } });
    for (const id of ITEM_IDS) this.paint(`item-${id}`, { art: ITEMS[id].icon, palette: ITEMS[id].palette });

    // 빛: 가운데가 밝고 가장자리로 갈수록 사라지는 원 (어둠을 지우는 붓)
    if (!this.textures.exists("light")) {
      const size = 128;
      const texture = this.textures.createCanvas("light", size, size);
      if (texture) {
        const ctx = texture.getContext();
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,255,255,1)");
        gradient.addColorStop(0.45, "rgba(255,255,255,0.75)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        texture.refresh();
      }
    }
    if (!this.textures.exists("glow")) {
      const size = 64;
      const texture = this.textures.createCanvas("glow", size, size);
      if (texture) {
        const ctx = texture.getContext();
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, "rgba(255,170,60,0.55)");
        gradient.addColorStop(1, "rgba(255,120,20,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        texture.refresh();
      }
    }
  }

  /** 방 배경(벽·돌·발판·사다리·횃불 받침)을 픽셀 단위로 그린다. 방마다 한 번만 만든다. */
  private roomTexture(room: ParsedRoom): string {
    const key = `room-${room.def.id}`;
    if (this.textures.exists(key)) return key;
    const texture = this.textures.createCanvas(key, COLS * ART, ROWS * ART);
    if (!texture) return "__DEFAULT";
    const ctx = texture.getContext();
    const tone = ROOM_TONES[room.def.id];
    const seed = room.def.index;
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    const tileAt = (c: number, r: number) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? "solid" : room.tiles[r][c]);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * ART;
        const y = r * ART;
        const tile = room.tiles[r][c];
        if (tile === "solid") {
          px(x, y, ART, ART, tone.block);
          // 돌 블록: 위·왼쪽은 밝게, 아래·오른쪽은 어둡게, 열 단위로 엇갈린 줄눈
          if (tileAt(c, r - 1) !== "solid") px(x, y, ART, 1, tone.light);
          px(x, y + ART - 1, ART, 1, tone.dark);
          const joint = (c + r) % 2 === 0 ? 0 : 5;
          px(x + joint, y + 1, 1, ART - 2, tone.dark);
          px(x, y + 5, ART, 1, tone.dark);
          px(x + 1, y + 1, 3, 1, tone.light);
          if (hash(c, r, seed) > 0.82) px(x + 2 + Math.floor(hash(r, c, seed) * 5), y + 2, 1, 3, tone.dark);
          if (tileAt(c, r - 1) !== "solid" && hash(c, r, seed + 9) > 0.7) px(x + Math.floor(hash(c, r, 3) * 7), y, 2, 1, "#4d7c0f");
          continue;
        }
        // 배경 벽: 어두운 벽돌
        px(x, y, ART, ART, tone.bg);
        const offset = r % 2 === 0 ? 0 : 5;
        px(x, y + 4, ART, 1, tone.bgLine);
        px(x, y + 9, ART, 1, tone.bgLine);
        px(x + offset, y, 1, 4, tone.bgLine);
        px(x + ((offset + 5) % 10), y + 5, 1, 4, tone.bgLine);
        if (hash(c, r, seed + 4) > 0.97) {
          // 드문드문 새겨진 문양
          px(x + 3, y + 2, 4, 1, tone.dark);
          px(x + 3, y + 2, 1, 4, tone.dark);
          px(x + 6, y + 2, 1, 4, tone.dark);
        }
        if (tile === "platform") {
          px(x, y, ART, 1, tone.light);
          px(x, y + 1, ART, 3, tone.block);
          px(x, y + 4, ART, 1, tone.dark);
          if (c % 3 === 0) px(x + 4, y + 5, 2, 2, tone.dark);
        } else if (tile === "ladder") {
          px(x + 1, y, 1, ART, "#92400e");
          px(x + 8, y, 1, ART, "#92400e");
          px(x + 2, y, 1, ART, "#5b2a0a");
          px(x + 9, y, 1, ART, "#5b2a0a");
          for (const ry of [1, 4, 7]) px(x + 1, y + ry, 8, 1, "#b45309");
        }
      }
    }
    // 횃불 받침
    for (const torch of room.torches) {
      const x = torch.col * ART;
      const y = torch.row * ART;
      px(x + 3, y + 6, 4, 2, "#44403c");
      px(x + 4, y + 8, 2, 2, "#292524");
      px(x + 2, y + 5, 6, 1, "#57534e");
    }
    // 석상 레일
    for (const entity of room.entities) {
      if (entity.def.kind !== "statue") continue;
      const y = (entity.row + 1) * ART;
      px(entity.def.minCol * ART, y, (entity.def.maxCol - entity.def.minCol + 1) * ART, 1, "#1c1917");
      for (let c = entity.def.minCol; c <= entity.def.maxCol; c++) px(c * ART + 4, y + 1, 2, 1, tone.accent);
    }
    texture.refresh();
    return key;
  }

  // ── 방 구성 ──

  private buildRoom(id: RoomId) {
    this.roomId = id;
    const room = getRoom(id);
    this.background.setTexture(this.roomTexture(room));
    for (const view of this.views) {
      view.image.destroy();
      view.extra?.destroy();
    }
    this.views = [];
    for (const s of this.spikeImages) s.image.destroy();
    for (const c of this.crumbleImages) c.image.destroy();
    for (const f of this.flames) {
      f.image.destroy();
      f.glow.destroy();
    }
    for (const e of this.enemyImages.values()) {
      e.body.destroy();
      e.mark?.destroy();
    }
    for (const c of this.crusherImages.values()) c.destroy();
    for (const r of this.rockImages.values()) r.destroy();
    this.spikeImages = [];
    this.crumbleImages = [];
    this.flames = [];
    this.enemyImages.clear();
    this.crusherImages.clear();
    this.rockImages.clear();

    for (const entity of room.entities) {
      const view = this.createView(entity);
      if (view) this.views.push(view);
    }
    this.spikeImages = room.spikes.map((spike) => ({
      ...spike,
      image: this.add.image(spike.col * TILE, (spike.row + 1) * TILE, "spike-holes").setOrigin(0, 1).setScale(SCALE).setDepth(12),
    }));
    this.crumbleImages = room.crumbles.map((crumble) => ({
      ...crumble,
      image: this.add.image(crumble.col * TILE, crumble.row * TILE, "crumble").setOrigin(0).setScale(SCALE).setDepth(8),
    }));
    this.flames = room.torches.map((torch, i) => {
      const x = torch.col * TILE + TILE / 2;
      const y = torch.row * TILE + 12;
      return {
        x,
        y,
        seed: i * 1.7,
        glow: this.add.image(x, y, "glow").setScale(2.2).setBlendMode(Phaser.BlendModes.ADD).setDepth(41),
        image: this.add.image(x, y, "flame-0").setOrigin(0.5, 1).setScale(SCALE).setDepth(42),
      };
    });
  }

  private createView(entity: PlacedEntity): ObjectView | null {
    const { def, col, row } = entity;
    const cx = col * TILE + TILE / 2;
    const floor = (row + 1) * TILE;
    const img = (key: string, x: number, y: number, ox: number, oy: number, depth = 10) =>
      this.add.image(x, y, key).setOrigin(ox, oy).setScale(SCALE).setDepth(depth);
    switch (def.kind) {
      case "chest":
        return { entity, image: img("chest-closed", cx, floor, 0.5, 1) };
      case "jar":
        return { entity, image: img("jar", cx, floor, 0.5, 1) };
      case "tablet":
        return { entity, image: img("tablet", cx, floor, 0.5, 1) };
      case "lockedDoor":
        return { entity, image: img(`door-${def.key}`, cx, (row - 2) * TILE, 0.5, 0) };
      case "exitDoor":
        return { entity, image: img("exit-door", cx, (row - 2) * TILE, 0.5, 0) };
      case "hatch": {
        const key = def.id === "r4-stone-gate" ? "stone-gate" : def.secret ? "hatch-slab" : "hatch-grate";
        return { entity, image: img(key, col * TILE, row * TILE, 0, 0, 13) };
      }
      case "crackedWall":
        return {
          entity,
          image: img("cracked-wall", col * TILE, (row - 2) * TILE, 0, 0),
          extra: img("rubble", col * TILE, floor, 0, 1).setVisible(false),
        };
      case "secretSpot":
        return { entity, image: img("loose-brick", col * TILE, row * TILE, 0, 0, 6) };
      case "statue":
        return { entity, image: img("statue", cx, floor, 0.5, 1, 15) };
      case "plate":
        return { entity, image: img("plate", cx, floor + 2, 0.5, 1, 7) };
      case "altar":
        return { entity, image: img("altar", cx, floor, 0.5, 1), extra: img("item-relic", cx, floor - 40, 0.5, 0.5, 16) };
      case "coin":
        return { entity, image: img("coin-0", cx, row * TILE + TILE / 2, 0.5, 0.5, 14) };
      default:
        return null;
    }
  }

  // ── 동기화 ──

  private openProgress(flag: string): number {
    if (!this.state.flags.has(flag)) return 0;
    const at = this.state.flagTimes.get(flag);
    if (at === undefined) return 1;
    return Math.min(1, (this.state.time - at) / DOOR_OPEN_TIME);
  }

  private syncObjects() {
    const s = this.state;
    const t = this.elapsed;
    for (const view of this.views) {
      const { def } = view.entity;
      const image = view.image;
      switch (def.kind) {
        case "chest": {
          const visible = !def.hiddenUntil || s.flags.has(def.hiddenUntil);
          image.setVisible(visible);
          if (!visible) break;
          // 숨겨진 상자가 드러날 때 살짝 떠오르며 나타난다.
          if (def.hiddenUntil) image.setAlpha(0.3 + 0.7 * Math.min(1, this.openProgress(def.hiddenUntil) * 2));
          // 여는 중·막 열린 상자는 탐험가 앞에 그려 뚜껑이 열리는 모습이 가려지지 않게 한다.
          const openedAt = s.flagTimes.get(chestFlag(def.id));
          image.setDepth(openedAt !== undefined && s.time - openedAt < 1.4 ? 21 : 10);
          if (s.openingChest?.id === def.id) {
            const p = 1 - s.openingChest.timer / GAME_CONFIG.chestOpenTime;
            image.setTexture(p < 0.45 ? "chest-closed" : p < 0.8 ? "chest-half" : "chest-open");
            image.x = view.entity.col * TILE + TILE / 2 + (p < 0.45 ? Math.round(Math.sin(t * 60)) : 0);
          } else if (s.flags.has(chestFlag(def.id))) {
            image.setTexture("chest-open");
            image.x = view.entity.col * TILE + TILE / 2;
          } else {
            image.setTexture(def.lockedUntil && !s.flags.has(def.lockedUntil) ? "chest-sealed" : "chest-closed");
          }
          break;
        }
        case "jar":
          image.setTexture(s.flags.has(searchedFlag(def.id)) ? "jar-empty" : "jar");
          break;
        case "lockedDoor": {
          const p = this.openProgress(openFlag(def.id));
          image.setScale(SCALE, SCALE * (1 - p)).setVisible(p < 1);
          break;
        }
        case "exitDoor": {
          const glow = s.inventory.relic > 0 ? 0.75 + 0.25 * Math.sin(t * 4) : 1;
          image.setTint(s.inventory.relic > 0 ? Phaser.Display.Color.GetColor(255, Math.round(200 + 55 * glow), Math.round(120 * glow)) : 0xffffff);
          break;
        }
        case "hatch": {
          const p = this.openProgress(def.flag);
          image.setVisible(p < 1).setAlpha(1 - p);
          break;
        }
        case "crackedWall": {
          const open = s.flags.has(openFlag(def.id));
          image.setVisible(!open);
          view.extra?.setVisible(open);
          break;
        }
        case "secretSpot":
          image.setTexture(s.flags.has(def.reveals) ? "brick-hole" : "loose-brick");
          if (!s.flags.has(def.reveals)) image.setAlpha(0.85 + 0.15 * Math.sin(t * 3));
          else image.setAlpha(1);
          break;
        case "statue": {
          const statue = s.statues[def.id];
          if (statue) image.x = statue.x;
          image.setTint(statue?.locked ? 0xfff3b0 : 0xffffff);
          break;
        }
        case "plate":
          image.setTexture(s.flags.has(def.flag) ? "plate-on" : "plate");
          image.setAlpha(s.flags.has(def.flag) ? 1 : 0.75 + 0.25 * Math.sin(t * 3));
          break;
        case "altar":
          view.extra?.setVisible(!s.flags.has(FLAG.relic));
          if (view.extra) view.extra.y = (view.entity.row + 1) * TILE - 40 + Math.sin(t * 2) * 3;
          if (!s.flags.has(FLAG.relic) && Math.random() < 0.06) {
            this.sparks.explode(1, view.image.x + (Math.random() - 0.5) * 22, view.image.y - 40 + (Math.random() - 0.5) * 18);
          }
          break;
        case "coin": {
          const taken = s.flags.has(`coin:${def.id}`);
          image.setVisible(!taken);
          if (!taken) {
            const frame = Math.floor(t * 8 + view.entity.col) % 4;
            image.setTexture(`coin-${frame === 3 ? 1 : frame}`);
            image.y = view.entity.row * TILE + TILE / 2 + Math.sin(t * 3 + view.entity.col) * 2;
          }
          break;
        }
        default:
          break;
      }
    }

    // 횃불 흔들림
    for (const flame of this.flames) {
      const flicker = Math.sin(t * 9 + flame.seed) * 0.5 + Math.sin(t * 23 + flame.seed * 3) * 0.5;
      flame.image.setTexture(`flame-${Math.floor(t * 10 + flame.seed) % 3}`);
      flame.glow.setScale(2.1 + flicker * 0.15).setAlpha(0.8 + flicker * 0.15);
    }
  }

  private syncTraps() {
    const s = this.state;
    for (const spike of this.spikeImages) {
      const phase = spikePhase(s.roomTime, spike.group);
      if (phase.mode === "hidden") spike.image.setTexture("spike-holes").setY((spike.row + 1) * TILE);
      else spike.image.setTexture("spikes").setY((spike.row + 1) * TILE + (phase.mode === "warn" ? 7 : 0));
    }
    for (const crumble of this.crumbleImages) {
      const state = s.crumbles[crumble.id];
      if (!state) continue;
      const x = crumble.col * TILE;
      if (state.mode === "fallen") {
        crumble.image.setVisible(false);
      } else {
        const wasHidden = !crumble.image.visible;
        crumble.image.setVisible(true).setAlpha(wasHidden ? 0.3 : Math.min(1, crumble.image.alpha + 0.05));
        crumble.image.x = state.mode === "shaking" ? x + Math.round(Math.sin(this.elapsed * 70 + crumble.col)) : x;
      }
      if (state.mode === "fallen" && state.timer > GAME_CONFIG.traps.crumbleRespawn - 0.05) {
        this.dust.explode(6, x + TILE / 2, crumble.row * TILE + 6);
      }
    }

    // 돌 블록과 사슬
    this.chains.clear();
    const active = new Set<string>();
    for (const c of s.crushers) {
      active.add(c.id);
      let image = this.crusherImages.get(c.id);
      if (!image) {
        image = this.add.image(c.x, c.bottom, "crusher").setOrigin(0.5, 1).setScale(SCALE).setDepth(14);
        this.crusherImages.set(c.id, image);
      }
      const shake = c.mode === "shake" ? Math.round(Math.sin(this.elapsed * 80)) : 0;
      image.setPosition(c.x + shake, c.bottom);
      const top = c.bottom - GAME_CONFIG.traps.crusher.height;
      this.chains.fillStyle(0x57534e, 1);
      for (const dx of [-8, 8]) for (let y = 40; y < top; y += 6) this.chains.fillRect(c.x + dx - 1 + shake, y, 2, 4);
    }
    for (const [id, image] of this.crusherImages) if (!active.has(id)) image.destroy();

    // 떨어지는 돌: 경고 중에는 천장 먼지와 바닥 그림자
    this.warnings.clear();
    const rocks = new Set<number>();
    for (const rock of s.rocks) {
      rocks.add(rock.id);
      let image = this.rockImages.get(rock.id);
      if (!image) {
        image = this.add.image(rock.x, rock.y, "rock").setScale(SCALE).setDepth(16);
        this.rockImages.set(rock.id, image);
      }
      image.setPosition(rock.x, rock.y).setVisible(rock.warn <= 0);
      if (rock.warn > 0) {
        if (Math.random() < 0.35) this.dust.explode(1, rock.x + (Math.random() - 0.5) * 12, rock.y - 4);
        const floor = this.floorBelow(rock.x);
        const pulse = 0.35 + 0.35 * Math.sin(this.elapsed * 18);
        this.warnings.fillStyle(0xef4444, pulse);
        this.warnings.fillRect(rock.x - 9, floor - 3, 18, 3);
      }
    }
    for (const [id, image] of this.rockImages) {
      if (rocks.has(id)) continue;
      image.destroy();
      this.rockImages.delete(id);
    }
  }

  private floorBelow(x: number): number {
    const room = getRoom(this.state.room);
    const col = Math.floor(x / TILE);
    for (let r = 4; r < ROWS; r++) if (room.tiles[r]?.[col] === "solid") return r * TILE;
    return H;
  }

  private syncEnemies() {
    const live = new Set<string>();
    for (const enemy of this.state.enemies) {
      live.add(enemy.id);
      let view = this.enemyImages.get(enemy.id);
      if (!view) {
        const body = this.add.image(enemy.x, enemy.y, `${enemy.kind}-0`).setScale(SCALE).setDepth(18);
        body.setOrigin(0.5, enemy.kind === "bat" ? 0.5 : 1);
        view = { body, mark: enemy.kind === "guardian" ? this.add.image(0, 0, "alert").setScale(SCALE).setDepth(19).setVisible(false) : undefined };
        this.enemyImages.set(enemy.id, view);
      }
      const speed = enemy.kind === "bat" ? 10 : enemy.mode === "chase" ? 9 : 5;
      const moving = enemy.mode !== "rest" && enemy.mode !== "alert";
      const frame = moving ? Math.floor(this.elapsed * speed) % 2 : 0;
      view.body.setTexture(`${enemy.kind}-${frame}`).setPosition(enemy.x, enemy.y).setFlipX(enemy.dir < 0);
      if (view.mark) {
        const alert = enemy.mode === "alert" || enemy.mode === "chase";
        view.mark.setVisible(alert).setPosition(enemy.x, enemy.y - 46 + (enemy.mode === "alert" ? Math.sin(this.elapsed * 30) * 2 : 0));
        view.body.setTint(enemy.mode === "chase" ? 0xffd2b0 : 0xffffff);
      }
    }
    for (const [id, view] of this.enemyImages) {
      if (live.has(id)) continue;
      view.body.destroy();
      view.mark?.destroy();
      this.enemyImages.delete(id);
    }
  }

  private syncPlayer() {
    const p = this.state.player;
    let frame: string;
    switch (p.anim) {
      case "walk":
        frame = Math.floor(p.stride / 14) % 2 === 0 ? "walk1" : "walk2";
        break;
      case "climb":
        frame = Math.floor(p.stride / 10) % 2 === 0 ? "climb1" : "climb2";
        break;
      default:
        frame = p.anim;
    }
    this.player.setTexture(`player-${frame}`).setPosition(Math.round(p.x), Math.round(p.y)).setFlipX(p.facing < 0 && p.anim !== "climb");
    const blinking = p.invincible > 0 && this.state.phase === "playing" && Math.floor(this.elapsed * 14) % 2 === 0;
    this.player.setAlpha(blinking ? 0.35 : 1);
    this.player.setTint(p.stun > 0 || this.state.phase === "dying" ? 0xff8080 : 0xffffff);
    // 쓰러질 때는 바라보는 반대쪽으로 천천히 눕는다.
    if (this.state.phase === "dying") this.player.setAngle(Phaser.Math.Clamp(this.player.angle - p.facing * 3, -90, 90));
    else this.player.setAngle(0);
  }

  // ── 조명·페이드 ──

  private drawLighting() {
    const s = this.state;
    const rt = this.darkness;
    rt.clear();
    rt.fill(0x05030a, 0.58);
    const light = (x: number, y: number, radius: number) => {
      this.lightBrush.setScale((radius * 2) / 128);
      rt.erase(this.lightBrush, x, y);
    };
    for (const flame of this.flames) {
      const flicker = Math.sin(this.elapsed * 9 + flame.seed) * 4 + Math.sin(this.elapsed * 21 + flame.seed) * 3;
      light(flame.x, flame.y - 6, 95 + flicker);
    }
    const p = s.player;
    light(p.x, p.y - 16, 78);
    // 상자가 열리는 순간 안에서 빛이 새어 나온다.
    for (const [flag, at] of s.flagTimes) {
      const age = s.time - at;
      if (!flag.startsWith("chest:") || age > 1.2) continue;
      const view = this.views.find((v) => chestFlag(v.entity.def.id) === flag);
      if (view) light(view.image.x, view.image.y - 14, 40 + 70 * Math.sin(Math.min(1, age / 1.2) * Math.PI));
    }
    if (!s.flags.has(FLAG.relic) && s.room === "r8") {
      const altar = getRoom("r8").entities.find((e) => e.def.kind === "altar");
      if (altar) light(altar.col * TILE + TILE / 2, (altar.row + 1) * TILE - 40, 110 + Math.sin(this.elapsed * 2) * 8);
    }
    if (s.inventory.relic > 0) light(p.x, p.y - 20, 105);
    // 퍼즐 힌트(빛나는 스위치)와 수호병의 눈은 어둠 속에서도 보이게 한다.
    for (const view of this.views) {
      if (view.entity.def.kind === "plate" && !s.flags.has(view.entity.def.flag)) light(view.image.x, view.image.y - 6, 46 + Math.sin(this.elapsed * 3) * 6);
    }
    for (const enemy of s.enemies) if (enemy.kind === "guardian") light(enemy.x, enemy.y - 24, 52);
  }

  private drawFade() {
    const t = this.state.transition;
    const { fadeOut, fadeIn } = GAME_CONFIG.transition;
    let alpha = 0;
    if (t?.stage === "out") alpha = 1 - t.timer / fadeOut;
    else if (t?.stage === "in") alpha = t.timer / fadeIn;
    if (this.state.phase === "dying") alpha = Math.max(alpha, 1 - this.state.endTimer / GAME_CONFIG.deathDelay) * 0.6;
    this.fade.setAlpha(Math.min(1, Math.max(0, alpha)));
  }

  // ── 이벤트 연출 ──

  private floatingIcon(key: string, x: number, y: number) {
    const icon = this.add.image(x, y, key).setScale(SCALE).setDepth(46);
    this.tweens.add({
      targets: icon,
      y: y - 26,
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => {
        this.tweens.add({ targets: icon, alpha: 0, duration: 350, onComplete: () => icon.destroy() });
      },
    });
  }

  private handleEvent(event: GameEvent) {
    switch (event.type) {
      case "itemFound":
        this.floatingIcon(`item-${event.item}`, event.x, event.y);
        this.sparks.explode(event.item === "coin" ? 8 : 14, event.x, event.y);
        break;
      case "coin":
        this.sparks.explode(6, event.x, event.y);
        break;
      case "secretFound":
        this.sparks.explode(22, event.x, event.y);
        break;
      case "toolUse":
        this.embers.explode(30, event.x, event.y);
        this.dust.explode(26, event.x, event.y + 10);
        this.cameras.main.shake(260, 0.012);
        break;
      case "playerHit":
        this.cameras.main.shake(140, 0.006);
        break;
      case "relicFound":
        this.cameras.main.flash(380, 255, 240, 180);
        this.sparks.explode(36, event.x, event.y);
        this.floatingIcon("item-relic", event.x, event.y);
        this.cameras.main.shake(600, 0.004);
        break;
      case "rockLanded":
        this.dust.explode(8, event.x, this.floorBelow(event.x) - 2);
        break;
      case "doorOpen": {
        const view = this.views.find((v) => v.entity.def.id === event.id);
        if (view) this.dust.explode(14, view.entity.col * TILE + TILE / 2, (view.entity.row + 1) * TILE - 4);
        break;
      }
      case "switchActivate": {
        const view = this.views.find((v) => v.entity.def.id === event.id);
        if (view) this.sparks.explode(18, view.image.x, view.image.y - 6);
        break;
      }
      default:
        break;
    }
  }
}
