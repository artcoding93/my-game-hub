import { BOSS, BUBBLE, HUD_H, ITEMS, PHASE, SCREEN_H, SCREEN_W, TILE, WORLD_H, WORLD_W } from "../config";
import { escapeTime } from "../logic/game";
import type { StageTheme } from "../stages";
import type { Bubble, Enemy, GameEvent, GameState, Player } from "../types";
import { SpriteCache, type Pix } from "./pixels";
import { buildBackground, buildTiles, drawTile, pixelCircle, TILE_STYLES } from "./scenery";
import { buildBubble, buildCogling, buildItem, buildLumi, buildNote, buildQueen, buildSpringlet, buildWhirlwing, buildZipwind, type LumiPose } from "./sprites";

/*
 * 캔버스 그리기 (512×288 고정 해상도, CSS로 확대하며 픽셀을 보간하지 않는다).
 * 상태를 읽기만 하며, 파티클·화면 흔들림·반딧불 같은 연출에만 Math.random()을 쓴다.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  gravity: number;
}

export interface RenderOptions {
  shake: boolean;
  font: string;
  best: number;
}

const SPRITE_SIZE: Record<Enemy["kind"], [number, number]> = { cogling: [18, 16], springlet: [18, 18], whirlwing: [22, 14], zipwind: [18, 14] };
const BUBBLE_COLORS = ["#8feaff", "#ffffff", "#c9f6ff"];

export class BubbleRenderer {
  private sprites = new SpriteCache();
  private backgrounds = new Map<StageTheme, HTMLCanvasElement>();
  private tiles: HTMLCanvasElement | null = null;
  private tilesFor: unknown = null;
  private particles: Particle[] = [];
  private ambient: { x: number; y: number; s: number; v: number; p: number }[] = [];
  private bossBooms = 0;

  constructor() {
    for (let i = 0; i < 40; i++) this.ambient.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, s: Math.random() < 0.3 ? 2 : 1, v: 6 + Math.random() * 14, p: Math.random() * 6 });
  }

  // ── 이벤트 → 파티클 ──

  handleEvents(events: GameEvent[], s: GameState) {
    for (const e of events) {
      switch (e.type) {
        case "capture":
          this.ring(e.x, e.y, 10, ["#ffffff", "#8feaff"], 70, 0.4);
          break;
        case "pop":
          this.ring(e.x, e.y, 8, BUBBLE_COLORS, 80, 0.3);
          break;
        case "fizz":
          this.burst(e.x, e.y, 4, BUBBLE_COLORS, 30, 0.3, 1);
          break;
        case "bubbleBounce":
          this.burst(e.x, e.y, 6, BUBBLE_COLORS, 60, 0.3, 1);
          break;
        case "kill":
          this.ring(e.x, e.y, 10 + e.combo * 2, e.combo >= 3 ? ["#ffe14a", "#ff7ac8", "#7cf0ff"] : ["#ffe14a", "#ffffff", "#8feaff"], 110 + e.combo * 10, 0.55);
          break;
        case "escape":
          this.burst(e.x, e.y, 10, BUBBLE_COLORS, 110, 0.5, 2);
          break;
        case "item":
          this.ring(e.x, e.y + 4, 10, ["#ffe14a", "#ffffff", "#ff9ad6"], 80, 0.5);
          break;
        case "hurt":
          this.ring(s.player.x + s.player.w / 2, s.player.y + 6, 10, ["#ff5a6a", "#ffffff"], 90, 0.45);
          break;
        case "shieldBlock":
          this.ring(s.player.x + s.player.w / 2, s.player.y + 6, 14, ["#ffd84a", "#ffffff"], 100, 0.5);
          break;
        case "bossHit":
          this.ring(e.x, e.y, 20, ["#ffe14a", "#ffffff", "#ff7ac8"], 160, 0.7);
          break;
        case "bossDefeat":
          this.bossBooms = 2.2;
          break;
        case "stageStart":
          this.particles = [];
          break;
      }
    }
  }

  private burst(x: number, y: number, n: number, colors: string[], speed: number, life: number, size: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0, max: life * (0.6 + Math.random() * 0.6), color: colors[i % colors.length], size: size + (Math.random() < 0.3 ? 1 : 0), gravity: 200 });
    }
  }

  private ring(x: number, y: number, n: number, colors: string[], speed: number, life: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0, max: life, color: colors[i % colors.length], size: 2, gravity: 0 });
    }
  }

  // ── 그리기 ──

  render(ctx: CanvasRenderingContext2D, s: GameState, dt: number, opts: RenderOptions) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0e0a28";
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    ctx.save();
    if (opts.shake && s.shake.time > 0) {
      const a = s.shake.amount;
      ctx.translate(Math.round((Math.random() * 2 - 1) * a), HUD_H + Math.round((Math.random() * 2 - 1) * a));
    } else ctx.translate(0, HUD_H);
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();

    const theme = s.stage.theme;
    let bg = this.backgrounds.get(theme);
    if (!bg) {
      bg = buildBackground(theme);
      this.backgrounds.set(theme, bg);
    }
    ctx.drawImage(bg, 0, 0);
    this.drawSceneryMotion(ctx, s, dt);
    if (this.tilesFor !== s.level) {
      this.tiles = buildTiles(s.level, theme);
      this.tilesFor = s.level;
    }
    if (this.tiles) ctx.drawImage(this.tiles, 0, 0);
    for (const mp of s.platforms) {
      for (let x = 0; x < mp.w; x += TILE) drawTile(ctx, Math.round(mp.x + x), mp.y, "platform", TILE_STYLES[theme], true, x / TILE);
    }

    for (const it of s.items) this.drawItem(ctx, it.kind, it.x, it.y, it.life, s.time);
    for (const e of s.enemies) if (e.state === "active") this.drawEnemy(ctx, e, s);
    this.drawBoss(ctx, s, dt);
    this.drawPlayer(ctx, s);
    for (const b of s.bubbles) this.drawBubble(ctx, b, s);
    for (const e of s.enemies) if (e.state === "dead") this.drawEnemy(ctx, e, s);
    for (const n of s.notes) {
      const img = this.sprites.get("note", n.vx < 0, buildNote);
      ctx.drawImage(img, Math.round(n.x - 1), Math.round(n.y - 1));
    }
    for (const sp of s.sparks) this.drawSpark(ctx, sp.x, sp.y, s.time);
    this.drawParticles(ctx, dt);
    this.drawPopups(ctx, s, opts.font);
    if (s.freeze > 0) {
      // Time Freeze: 화면이 살짝 푸르게
      ctx.fillStyle = `rgba(120,200,255,${0.1 + 0.04 * Math.sin(s.time * 8)})`;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
    this.drawForeground(ctx, s, dt);
    this.drawPhase(ctx, s, opts.font);
    ctx.restore();

    this.drawHud(ctx, s, opts.font, opts.best);
  }

  private drawSceneryMotion(ctx: CanvasRenderingContext2D, s: GameState, dt: number) {
    const t = s.time;
    switch (s.stage.theme) {
      case "garden":
        // 반딧불
        for (const f of this.ambient) {
          f.p += dt;
          const x = (f.x + Math.sin(f.p * 0.7) * 20 + WORLD_W) % WORLD_W;
          const y = 120 + ((f.y + Math.cos(f.p * 0.5) * 16) % 110);
          const on = Math.sin(f.p * 2.3) > 0.2;
          if (!on) continue;
          ctx.fillStyle = "rgba(255,240,140,0.85)";
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
          ctx.fillStyle = "rgba(255,240,140,0.25)";
          ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
          ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
        }
        break;
      case "factory": {
        // 컨베이어 띠
        const off = Math.floor(t * 30) % 8;
        ctx.fillStyle = "#2a141a";
        ctx.fillRect(0, 224, WORLD_W, 6);
        ctx.fillStyle = "#c46a5a";
        for (let x = -8 + off; x < WORLD_W; x += 8) ctx.fillRect(x, 225, 4, 4);
        this.drawGearShape(ctx, 40, 200, 14, t * 0.8, "#6a3846", 8);
        this.drawGearShape(ctx, 472, 200, 14, -t * 0.8, "#6a3846", 8);
        break;
      }
      case "tower": {
        // 풍차 날개 (바람 세기에 따라 도는 속도가 바뀐다)
        const a = t * (0.6 + Math.abs(s.wind) * 1.6) * (s.wind >= 0 ? 1 : -1);
        for (let k = 0; k < 4; k++) {
          const ang = a + (k * Math.PI) / 2;
          // 배경 장식이므로 흐리게 (위험물로 보이지 않게)
          ctx.fillStyle = k % 2 ? "rgba(255,255,255,0.3)" : "rgba(255,214,214,0.3)";
          for (let d = 6; d < 44; d++) ctx.fillRect(Math.round(256 + Math.cos(ang) * d) - 1, Math.round(150 + Math.sin(ang) * d) - 1, 3, 3);
        }
        pixelCircle(ctx, 256, 150, 4, "#8a5432");
        break;
      }
      case "maze":
        // 반짝이는 별
        for (let i = 0; i < 16; i++) {
          const k = Math.sin(t * 2 + i * 1.9);
          if (k < 0.8) continue;
          ctx.fillStyle = "#ffffff";
          const x = (i * 71 + 13) % WORLD_W;
          const y = (i * 47 + 19) % WORLD_H;
          ctx.fillRect(x, y - 2, 1, 5);
          ctx.fillRect(x - 2, y, 5, 1);
        }
        break;
      case "clock": {
        this.drawGearShape(ctx, 60, 60, 30, t * 0.3, "#3c2630", 12);
        this.drawGearShape(ctx, 100, 98, 18, -t * 0.5, "#45303a", 9);
        this.drawGearShape(ctx, 452, 70, 26, -t * 0.35, "#3c2630", 11);
        // 진자 (달 창 가운데에 매달려 흔들린다)
        const swing = Math.sin(t * 1.8) * 0.5;
        const px = 256 + Math.sin(swing) * 120;
        const py = 92 + Math.cos(swing) * 120;
        ctx.fillStyle = "#a67c52";
        for (let d = 0; d < 120; d += 2) ctx.fillRect(Math.round(256 + Math.sin(swing) * d), Math.round(92 + Math.cos(swing) * d), 1, 2);
        pixelCircle(ctx, Math.round(px), Math.round(py), 8, "#d9a441");
        pixelCircle(ctx, Math.round(px) - 2, Math.round(py) - 2, 3, "#ffd87a");
        break;
      }
    }
  }

  private drawForeground(ctx: CanvasRenderingContext2D, s: GameState, dt: number) {
    if (s.stage.theme !== "tower") return;
    if (Math.abs(s.wind) > 0.15) {
      // 바람 줄기
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 12; i++) {
        const speed = 260 * s.wind;
        const x = ((((s.time * speed + i * 97) % (WORLD_W + 80)) + WORLD_W + 80) % (WORLD_W + 80)) - 40;
        const y = 24 + ((i * 53) % 200);
        ctx.fillRect(Math.round(x), y, Math.round(20 * Math.abs(s.wind)), 1);
      }
    }
    // 날리는 꽃잎
    ctx.fillStyle = "rgba(255,200,220,0.8)";
    for (const f of this.ambient.slice(0, 18)) {
      f.x += (s.wind * 70 + 6) * dt;
      f.y += f.v * 0.6 * dt;
      if (f.y > WORLD_H) f.y = -2;
      if (f.x > WORLD_W) f.x = 0;
      if (f.x < 0) f.x = WORLD_W;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 1);
    }
  }

  private lumi(pose: LumiPose, flip: boolean, flash = false) {
    return this.sprites.get(`lumi-${pose}${flash ? "-f" : ""}`, flip, () => {
      const p = buildLumi(pose);
      return flash ? p.silhouette("#ffffff") : p;
    });
  }

  private lumiPose(s: GameState, p: Player): LumiPose {
    if (s.phase === "clear" || s.phase === "victory") return Math.floor(s.phaseTime * 4) % 2 === 0 ? "win0" : "win1";
    if (!p.alive || p.hurt > 0) return "hurt";
    if (p.shootAnim < 0.15) return "blow";
    if (!p.grounded) return p.vy < 0 ? "jump" : "fall";
    if (Math.abs(p.vx) > 8) return (["walk0", "walk1", "walk2", "walk3"] as const)[Math.floor(p.walkTime * 10) % 4];
    return Math.floor(s.time / 0.6) % 2 === 0 ? "idle0" : "idle1";
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, s: GameState) {
    const p = s.player;
    if (s.phase === "gameover") return;
    const blink = p.alive && p.invulnerable > 0 && p.hurt <= 0 && Math.floor(s.time * 14) % 2 === 0;
    const pose = this.lumiPose(s, p);
    const img = this.lumi(pose, p.facing < 0, p.hurt > 0 && Math.floor(s.time * 20) % 2 === 0);
    const cx = Math.round(p.x + p.w / 2);
    const bottom = Math.round(p.y + p.h);
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.drawImage(img, cx - 10, bottom - 17);
    ctx.globalAlpha = 1;
    if (p.shield) {
      const r = 13 + Math.sin(s.time * 6);
      for (let i = 0; i < 8; i++) {
        const a = s.time * 3 + (i / 8) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? "#ffd84a" : "#ffffff";
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(bottom - 8 + Math.sin(a) * r), 2, 2);
      }
    }
    if ((p.rapid > 0 || p.giant > 0) && Math.random() < 0.15) {
      this.particles.push({ x: cx + (Math.random() - 0.5) * 14, y: bottom - 14, vx: 0, vy: -20, life: 0, max: 0.4, color: p.giant > 0 ? "#ffe27a" : "#8feaff", size: 1, gravity: 0 });
    }
  }

  private enemySprite(e: Enemy, s: GameState): HTMLCanvasElement {
    const angry = e.angry > 0;
    const frozen = s.freeze > 0;
    const t = frozen ? e.id : s.time + e.id * 0.37;
    switch (e.kind) {
      case "cogling": {
        const f = Math.floor(t * 6) % 2;
        return this.sprites.get(`cog${f}${angry ? "a" : ""}`, e.dir < 0, () => buildCogling(f, angry));
      }
      case "springlet": {
        const pose = !e.grounded ? "air" : e.hopTimer < 0.25 ? "squash" : "idle";
        return this.sprites.get(`spr-${pose}${angry ? "a" : ""}`, e.dir < 0, () => buildSpringlet(pose, angry));
      }
      case "whirlwing": {
        const f = Math.floor(t * 14) % 2;
        return this.sprites.get(`whirl${f}${angry ? "a" : ""}`, e.dir < 0, () => buildWhirlwing(f, angry));
      }
      case "zipwind": {
        const f = Math.floor(t * 12) % 2;
        return this.sprites.get(`zip${f}${angry ? "a" : ""}`, e.dir < 0, () => buildZipwind(f, angry));
      }
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, s: GameState) {
    const img = this.enemySprite(e, s);
    const [w, h] = SPRITE_SIZE[e.kind];
    const cx = e.x + e.w / 2;
    const bottom = e.y + e.h;
    const x = Math.round(cx - w / 2);
    const y = Math.round(bottom - h + 1);
    if (e.state === "dead") {
      // 쓰러짐: 빙글 돌며 날아간다
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - e.deadTime);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(e.deadTime * 12 * Math.sign(e.vx || 1));
      ctx.drawImage(img, -w / 2, -h / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.drawImage(img, x, y);
  }

  private drawBubble(ctx: CanvasRenderingContext2D, b: Bubble, s: GameState) {
    const wobble = Math.sin(s.time * 6 + b.id) * 0.6;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2 + wobble;
    let tint: "normal" | "warn" | "giant" = b.giant && !b.captive ? "giant" : "normal";
    let shake = 0;
    if (b.captive) {
      const limit = escapeTime(b.captive);
      const ratio = b.captiveTime / limit;
      if (ratio >= BUBBLE.warnAt) {
        // 탈출 경고: 분홍색으로 깜빡이고, 마지막 1초는 떨린다
        tint = Math.floor(s.time * (ratio > 0.9 ? 16 : 8)) % 2 === 0 ? "warn" : "normal";
        if (limit - b.captiveTime < 1) shake = Math.floor(s.time * 20) % 2 ? 1 : -1;
      }
      // 갇힌 적 (몸을 웅크리고 뒤집힌 채 방울 안에서 천천히 돈다)
      const e = b.captive;
      const img = this.enemySprite(e, s);
      const [w, h] = SPRITE_SIZE[e.kind];
      ctx.save();
      ctx.translate(Math.round(cx + shake), Math.round(cy));
      ctx.rotate(Math.sin(s.time * 2 + b.id) * 0.4);
      ctx.scale(0.8, 0.8);
      ctx.drawImage(img, -w / 2, -h / 2);
      ctx.restore();
    }
    if (b.popIn >= 0) tint = "normal";
    const size = Math.round(b.w);
    const img = this.sprites.get(`bubble${size}${tint}`, false, () => buildBubble(size, tint));
    ctx.drawImage(img, Math.round(cx - size / 2 + shake), Math.round(cy - size / 2));
  }

  private drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const c = ["#ffe14a", "#ffffff", "#ff9ad6"][Math.floor(t * 20) % 3];
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 3, 2, 6);
    ctx.fillRect(Math.round(x) - 3, Math.round(y) - 1, 6, 2);
    if (Math.random() < 0.6) this.particles.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.25, color: "#ffe14a", size: 1, gravity: 0 });
  }

  private drawBoss(ctx: CanvasRenderingContext2D, s: GameState, dt: number) {
    const b = s.boss;
    if (this.bossBooms > 0) {
      this.bossBooms -= dt;
      if (b && Math.random() < 0.35) this.burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, 8, ["#ffe14a", "#ff7ac8", "#ffffff"], 120, 0.5, 2);
    }
    if (!b || b.state === "dead") return;
    const glow = b.state === "telegraph" && Math.floor(s.time * 10) % 2 === 0;
    const frame = s.freeze > 0 ? 0 : Math.floor(s.time * 6) % 2;
    const flash = (b.invulnerable > 0 && Math.floor(s.time * 16) % 2 === 0) || (b.state === "dying" && Math.floor(s.time * 10) % 2 === 0);
    const img = this.sprites.get(`queen${frame}${glow ? "g" : ""}${flash ? "f" : ""}`, b.dir < 0, () => {
      const p: Pix = buildQueen(frame, glow);
      return flash ? p.silhouette("#ffffff") : p;
    });
    const shakeX = b.state === "dying" ? Math.round((Math.random() - 0.5) * 3) : 0;
    const x = Math.round(b.x + b.w / 2 - 17 + shakeX);
    const y = Math.round(b.y + b.h - 31);
    ctx.drawImage(img, x, y);
    if (b.state === "telegraph") {
      // 예고: 종 아래로 음파 고리
      const r = 4 + ((s.time * 30) % 14);
      ctx.fillStyle = "rgba(255,90,150,0.7)";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillRect(Math.round(x + 17 + Math.cos(a) * r), Math.round(y + 29 + Math.sin(a) * r * 0.5), 1, 1);
      }
    }
  }

  private drawGearShape(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number, color: string, teeth: number) {
    ctx.fillStyle = color;
    for (let yy = -r; yy <= r; yy++) {
      const w = Math.floor(Math.sqrt(r * r - yy * yy));
      ctx.fillRect(Math.round(x - w), Math.round(y + yy), w * 2 + 1, 1);
    }
    const tooth = Math.max(2, Math.round(r / 3));
    for (let i = 0; i < teeth; i++) {
      const a = spin + (i / teeth) * Math.PI * 2;
      ctx.fillRect(Math.round(x + Math.cos(a) * (r + 1) - tooth / 2), Math.round(y + Math.sin(a) * (r + 1) - tooth / 2), tooth, tooth);
    }
  }

  private drawItem(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, life: number, time: number) {
    if (life < 3 && Math.floor(time * 10) % 2 === 0) return;
    const img = this.sprites.get(`item-${kind}`, false, () => buildItem(kind));
    const bob = Math.round(Math.sin(time * 5 + x) * 1);
    ctx.drawImage(img, Math.round(x - 1), Math.round(y - 1 + bob));
    if (kind !== "candy" && Math.floor(time * 8) % 3 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(x + 10), Math.round(y - 2), 1, 3);
      ctx.fillRect(Math.round(x + 9), Math.round(y - 1), 3, 1);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, dt: number) {
    const next: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = Math.min(1, 1.4 * (1 - p.life / p.max));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      next.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = next.length > 500 ? next.slice(-500) : next;
  }

  private text(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, color: string, font: string, size = 8, align: CanvasTextAlign = "left") {
    ctx.font = `${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#0e0a28";
    const o = size >= 16 ? 2 : 1;
    for (const [dx, dy] of [
      [-o, 0],
      [o, 0],
      [0, -o],
      [0, o],
    ])
      ctx.fillText(str, Math.round(x + dx), Math.round(y + dy));
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
  }

  private drawPopups(ctx: CanvasRenderingContext2D, s: GameState, font: string) {
    for (const p of s.popups) {
      if (p.big) {
        const color = ["#ffe14a", "#ff7ac8", "#7cf0ff", "#ffffff"][Math.floor(s.time * 14) % 4];
        const size = p.life > 0.98 ? 24 : 16;
        this.text(ctx, p.text, Math.min(Math.max(p.x, 90), WORLD_W - 90), Math.max(p.y - (size === 24 ? 12 : 8), 4), color, font, size, "center");
      } else this.text(ctx, p.text, Math.min(Math.max(p.x, 24), WORLD_W - 24), Math.max(p.y - 4, 2), "#ffffff", font, 8, "center");
    }
  }

  private drawPhase(ctx: CanvasRenderingContext2D, s: GameState, font: string) {
    if (s.phase === "intro") {
      ctx.fillStyle = "rgba(14,10,40,0.55)";
      ctx.fillRect(0, 92, WORLD_W, 64);
      this.text(ctx, `STAGE ${s.stageIndex + 1}`, WORLD_W / 2, 100, "#ffe14a", font, 16, "center");
      this.text(ctx, s.stage.name, WORLD_W / 2, 122, "#ffffff", font, 8, "center");
      if (s.phaseTime > PHASE.intro * 0.45) this.text(ctx, "READY!", WORLD_W / 2, 138, "#8feaff", font, 8, "center");
    } else if (s.phase === "clear") {
      ctx.fillStyle = "rgba(14,10,40,0.4)";
      ctx.fillRect(0, 96, WORLD_W, 50);
      const last = s.stageIndex >= 4;
      this.text(ctx, last ? "QUEEN DEFEATED!" : "STAGE CLEAR!", WORLD_W / 2, 104, "#ffe14a", font, 16, "center");
      this.text(ctx, "BONUS GET!", WORLD_W / 2, 128, "#ffffff", font, 8, "center");
    } else if (s.phase === "gameover" || s.phase === "victory") {
      ctx.fillStyle = "rgba(14,10,40,0.55)";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, s: GameState, font: string, best: number) {
    ctx.fillStyle = "#0e0a28";
    ctx.fillRect(0, 0, SCREEN_W, HUD_H);
    ctx.fillStyle = "#2c2466";
    ctx.fillRect(0, HUD_H - 2, SCREEN_W, 2);
    this.text(ctx, "1P", 8, 4, "#ffe14a", font);
    this.text(ctx, String(s.score).padStart(7, "0"), 30, 4, "#ffffff", font);
    this.text(ctx, `STAGE ${s.stageIndex + 1}/5`, SCREEN_W / 2, 4, "#8feaff", font, 8, "center");
    this.text(ctx, "HI", SCREEN_W - 92, 4, "#ff9ad6", font);
    this.text(ctx, String(Math.max(best, s.score)).padStart(7, "0"), SCREEN_W - 68, 4, "#ffffff", font);
    // 목숨 (Lumi 얼굴)
    const life = this.sprites.get("item-life", false, () => buildItem("life"));
    for (let i = 0; i < s.player.lives; i++) ctx.drawImage(life, 6 + i * 13, 15);
    let x = 8 + Math.max(s.player.lives, 1) * 13 + 4;
    const icon = (kind: string, remain: number, total: number) => {
      const img = this.sprites.get(`item-${kind}`, false, () => buildItem(kind));
      ctx.drawImage(img, x, 15);
      if (remain >= 0) {
        ctx.fillStyle = "#2c2466";
        ctx.fillRect(x + 1, 28, 12, 2);
        ctx.fillStyle = "#8feaff";
        ctx.fillRect(x + 1, 28, Math.round(12 * Math.min(1, remain / total)), 2);
      }
      x += 16;
    };
    if (s.player.shield) icon("shield", -1, 1);
    if (s.player.rapid > 0) icon("rapid", s.player.rapid, ITEMS.duration);
    if (s.player.giant > 0) icon("giant", s.player.giant, ITEMS.duration);
    if (s.freeze > 0) icon("freeze", s.freeze, ITEMS.freezeTime);
    // 콤보 진행 중
    if (s.combo.timer > 0 && s.combo.count >= 2) this.text(ctx, `COMBO x${s.combo.count}`, SCREEN_W / 2, 18, "#ff9ad6", font, 8, "center");
    else if (s.stage.wind) {
      const dir = s.wind >= 0 ? ">" : "<";
      const n = Math.max(1, Math.round(Math.abs(s.wind) * 3));
      this.text(ctx, `WIND ${dir.repeat(n)}`, SCREEN_W / 2, 18, "#bfe4ff", font, 8, "center");
    }
    // 보스 체력
    if (s.boss && s.boss.state !== "dead") {
      this.text(ctx, "QUEEN", SCREEN_W - 132, 18, "#ff9ad6", font);
      for (let i = 0; i < BOSS.hp; i++) {
        ctx.fillStyle = i < s.boss.hp ? "#ff5d8f" : "#3a3466";
        ctx.fillRect(SCREEN_W - 88 + i * 13, 18, 10, 8);
        ctx.fillStyle = i < s.boss.hp ? "#ffb3cb" : "#4a4480";
        ctx.fillRect(SCREEN_W - 88 + i * 13, 18, 10, 2);
      }
    }
  }
}
