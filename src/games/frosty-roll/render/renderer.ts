import { BALL, ENEMY, HUD_H, PHASE, SCREEN_H, SCREEN_W, TILE, WORLD_H, WORLD_W } from "../config";
import type { StageTheme } from "../stages";
import type { Enemy, GameEvent, GameState, Player } from "../types";
import { SpriteCache, type Pix } from "./pixels";
import { buildBackground, buildTiles, TILE_STYLES, drawTile } from "./scenery";
import { buildBall, buildBat, buildFox, buildGuardian, buildHopper, buildImp, buildItem, buildRunner, buildShot, buildSnowCover, type FoxPose } from "./sprites";

/*
 * 캔버스 그리기 (512×288 고정 해상도, CSS로 확대하며 픽셀을 보간하지 않는다).
 * 상태를 읽기만 하며, 파티클·화면 흔들림·배경 눈발 같은 연출에만 Math.random()을 쓴다.
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

const SPRITE_SIZE: Record<Enemy["kind"], [number, number]> = { imp: [18, 16], hopper: [18, 18], bat: [22, 14], runner: [18, 16] };

export class FrostyRenderer {
  private sprites = new SpriteCache();
  private backgrounds = new Map<StageTheme, HTMLCanvasElement>();
  private tiles: HTMLCanvasElement | null = null;
  private tilesFor: unknown = null;
  private particles: Particle[] = [];
  private ambient: { x: number; y: number; s: number; v: number }[] = [];
  private bossBooms = 0;

  constructor() {
    for (let i = 0; i < 60; i++) this.ambient.push({ x: Math.random() * WORLD_W, y: Math.random() * WORLD_H, s: Math.random() < 0.3 ? 2 : 1, v: 12 + Math.random() * 18 });
  }

  // ── 이벤트 → 파티클 ──

  handleEvents(events: GameEvent[], s: GameState) {
    for (const e of events) {
      switch (e.type) {
        case "snowHit":
          this.burst(e.x, e.y, 5, ["#ffffff", "#d6ecff"], 60, 0.35, 1);
          break;
        case "freeze":
          this.ring(e.x, e.y, 12, ["#ffffff", "#bfe4ff"], 90, 0.5);
          break;
        case "kick":
          this.burst(e.x, e.y + 6, 8, ["#ffffff", "#dcecff"], 80, 0.4, 2);
          break;
        case "bounce":
          this.burst(e.x, e.y, 6, ["#ffffff", "#bcd8f2"], 70, 0.35, 2);
          break;
        case "kill":
          this.ring(e.x, e.y + 6, 8 + e.chain * 2, e.chain >= 3 ? ["#ffe14a", "#ff7ac8", "#7cf0ff"] : ["#ffe14a", "#ffffff"], 110 + e.chain * 10, 0.55);
          break;
        case "shatter":
          this.burst(e.x, e.y, 18, ["#ffffff", "#dcecff", "#bcd8f2"], 150, 0.7, 3);
          break;
        case "crack":
          this.burst(e.x, e.y - 6, 3, ["#ffffff"], 40, 0.3, 1);
          break;
        case "escape":
          this.burst(e.x, e.y, 12, ["#ffffff", "#dcecff"], 120, 0.5, 2);
          break;
        case "item":
          this.ring(e.x, e.y + 4, 10, ["#ffe14a", "#ffffff", "#7cb8ff"], 80, 0.5);
          break;
        case "hurt":
          this.ring(s.player.x + s.player.w / 2, s.player.y + 6, 10, ["#ff5a6a", "#ffffff"], 90, 0.45);
          break;
        case "shieldBlock":
          this.ring(s.player.x + s.player.w / 2, s.player.y + 6, 14, ["#ffd84a", "#ffffff"], 100, 0.5);
          break;
        case "bossHit":
          this.ring(e.x, e.y, 20, ["#ffe14a", "#ffffff", "#ff9a3a"], 160, 0.7);
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
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, life: 0, max: life * (0.6 + Math.random() * 0.6), color: colors[i % colors.length], size: size + (Math.random() < 0.3 ? 1 : 0), gravity: 380 });
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
    ctx.fillStyle = "#0b1020";
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
    this.drawSceneryMotion(ctx, s);
    if (this.tilesFor !== s.level) {
      this.tiles = buildTiles(s.level, theme);
      this.tilesFor = s.level;
    }
    if (this.tiles) ctx.drawImage(this.tiles, 0, 0);
    for (const mp of s.platforms) {
      for (let x = 0; x < mp.w; x += TILE) drawTile(ctx, Math.round(mp.x + x), mp.y, "platform", TILE_STYLES[theme], true, x / TILE);
    }

    for (const it of s.items) this.drawItem(ctx, it.kind, it.x, it.y, it.life, s.time);
    for (const e of s.enemies) if (e.state === "ball") this.drawEnemy(ctx, e, s);
    for (const e of s.enemies) if (e.state === "active") this.drawEnemy(ctx, e, s);
    this.drawBoss(ctx, s, dt);
    for (const g of s.gears) this.drawGear(ctx, g.x + g.w / 2, g.y + g.h / 2, g.spin);
    this.drawPlayer(ctx, s);
    for (const e of s.enemies) if (e.state === "rolling" || e.state === "dead") this.drawEnemy(ctx, e, s);
    for (const shot of s.shots) {
      const img = this.sprites.get(shot.giant ? "shotG" : "shot", Math.floor(s.time * 12) % 2 === 0, () => buildShot(shot.giant));
      ctx.drawImage(img, Math.round(shot.x + shot.w / 2 - img.width / 2), Math.round(shot.y + shot.h / 2 - img.height / 2));
    }
    this.drawParticles(ctx, dt);
    this.drawPopups(ctx, s, opts.font);
    this.drawForeground(ctx, s, dt);
    this.drawPhase(ctx, s, opts.font);
    ctx.restore();

    this.drawHud(ctx, s, opts.font, opts.best);
  }

  private drawSceneryMotion(ctx: CanvasRenderingContext2D, s: GameState) {
    const t = s.time;
    switch (s.stage.theme) {
      case "factory":
        this.drawGearShape(ctx, 150, 150, 34, t * 0.4, "#1f3d52", 12);
        this.drawGearShape(ctx, 205, 182, 22, -t * 0.62, "#244861", 9);
        this.drawGearShape(ctx, 380, 140, 28, -t * 0.5, "#1f3d52", 10);
        break;
      case "cave":
        for (let i = 0; i < 14; i++) {
          const k = Math.sin(t * 2 + i * 1.7);
          if (k < 0.85) continue;
          ctx.fillStyle = "#ffffff";
          const x = (i * 73) % WORLD_W;
          const y = 130 + ((i * 41) % 100);
          ctx.fillRect(x, y - 2, 1, 5);
          ctx.fillRect(x - 2, y, 5, 1);
        }
        break;
      case "tower": {
        // 큰 시계의 바늘 (실제 시간처럼 천천히, 보스전 긴장감)
        const hand = (len: number, a: number, color: string, w: number) => {
          ctx.fillStyle = color;
          for (let k = 0; k < len; k++) ctx.fillRect(Math.round(256 + Math.cos(a) * k) - (w >> 1), Math.round(104 + Math.sin(a) * k) - (w >> 1), w, w);
        };
        hand(40, t * 0.1 - Math.PI / 2, "#3a2a1a", 3);
        hand(52, t * 1.2 - Math.PI / 2, "#5a3a1a", 2);
        break;
      }
    }
  }

  private drawForeground(ctx: CanvasRenderingContext2D, s: GameState, dt: number) {
    const theme = s.stage.theme;
    if (theme === "village" || theme === "canyon" || theme === "tower") {
      // 내리는 눈 (바람 스테이지는 바람 방향으로 비스듬히)
      const drift = theme === "canyon" ? s.wind * 90 : 8;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (const f of this.ambient) {
        f.y += f.v * dt;
        f.x += (drift + Math.sin(f.y / 20) * 6) * dt;
        if (f.y > WORLD_H) f.y = -2;
        if (f.x > WORLD_W) f.x = 0;
        if (f.x < 0) f.x = WORLD_W;
        ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
      }
    }
    if (theme === "canyon" && Math.abs(s.wind) > 0.2) {
      // 바람 줄기
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (let i = 0; i < 10; i++) {
        const speed = 260 * s.wind;
        const x = (((s.time * speed + i * 97) % (WORLD_W + 80)) + WORLD_W + 80) % (WORLD_W + 80) - 40;
        const y = 30 + ((i * 53) % 190);
        ctx.fillRect(Math.round(x), y, Math.round(18 * Math.abs(s.wind)), 1);
      }
    }
  }

  private fox(pose: FoxPose, flip: boolean, flash = false) {
    return this.sprites.get(`fox-${pose}${flash ? "-f" : ""}`, flip, () => {
      const p = buildFox(pose);
      return flash ? p.silhouette("#ffffff") : p;
    });
  }

  private foxPose(s: GameState, p: Player): FoxPose {
    if (s.phase === "clear" || s.phase === "victory") return Math.floor(s.phaseTime * 4) % 2 === 0 ? "win0" : "win1";
    if (!p.alive || p.hurt > 0) return "hurt";
    if (p.kickAnim < 0.18) return "kick";
    if (p.shootAnim < 0.15) return "throw";
    if (!p.grounded) return p.vy < 0 ? "jump" : "fall";
    if (Math.abs(p.vx) > 8) return (["walk0", "walk1", "walk2", "walk3"] as const)[Math.floor(p.walkTime * 10) % 4];
    return Math.floor(s.time / 0.6) % 2 === 0 ? "idle0" : "idle1";
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, s: GameState) {
    const p = s.player;
    if (s.phase === "gameover") return;
    const blink = p.alive && p.invulnerable > 0 && p.hurt <= 0 && Math.floor(s.time * 14) % 2 === 0;
    const pose = this.foxPose(s, p);
    const img = this.fox(pose, p.facing < 0, p.hurt > 0 && Math.floor(s.time * 20) % 2 === 0);
    const cx = Math.round(p.x + p.w / 2);
    const bottom = Math.round(p.y + p.h);
    ctx.globalAlpha = blink ? 0.35 : 1;
    ctx.drawImage(img, cx - 10, bottom - 17);
    ctx.globalAlpha = 1;
    // 효과 표시
    if (p.shield) {
      const r = 13 + Math.sin(s.time * 6);
      for (let i = 0; i < 8; i++) {
        const a = s.time * 3 + (i / 8) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? "#ffd84a" : "#ffffff";
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(bottom - 8 + Math.sin(a) * r), 2, 2);
      }
    }
    if (p.speedBoost > 0 && p.grounded && Math.abs(p.vx) > 20 && Math.random() < 0.5) {
      this.particles.push({ x: cx - p.facing * 6, y: bottom - 1, vx: -p.facing * 20, vy: -10, life: 0, max: 0.3, color: "#ffe27a", size: 1, gravity: 0 });
    }
    if (p.rapid > 0 && Math.random() < 0.15) {
      this.particles.push({ x: cx + (Math.random() - 0.5) * 14, y: bottom - 14, vx: 0, vy: -20, life: 0, max: 0.4, color: "#7cb8ff", size: 1, gravity: 0 });
    }
  }

  private enemySprite(e: Enemy, s: GameState): HTMLCanvasElement {
    const angry = e.angry > 0;
    const t = s.time + e.id * 0.37;
    switch (e.kind) {
      case "imp": {
        const f = Math.floor(t * 6) % 2;
        return this.sprites.get(`imp${f}${angry ? "a" : ""}`, e.dir < 0, () => buildImp(f, angry));
      }
      case "hopper": {
        const pose = !e.grounded ? "air" : e.hopTimer < 0.25 ? "squash" : "idle";
        return this.sprites.get(`hop-${pose}${angry ? "a" : ""}`, e.dir < 0, () => buildHopper(pose, angry));
      }
      case "bat": {
        const f = Math.floor(t * 8) % 2;
        return this.sprites.get(`bat${f}${angry ? "a" : ""}`, e.dir < 0, () => buildBat(f, angry));
      }
      case "runner": {
        const f = Math.floor(t * 14) % 4;
        return this.sprites.get(`run${f}${angry ? "a" : ""}`, e.dir < 0, () => buildRunner(f, angry));
      }
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, s: GameState) {
    const cx = e.x + e.w / 2;
    const bottom = e.y + e.h;
    if (e.state === "ball" || e.state === "rolling" || (e.state === "dead" && e.w === BALL.size)) {
      if (e.state === "dead") return; // 부서진 눈덩이는 파티클로만
      const limit = e.enhanced ? BALL.enhancedEscape : BALL.escapeTime;
      const wobble = e.state === "ball" && e.ballTime > limit - 1.2 ? (Math.floor(s.time * 20) % 2 ? 1 : -1) : 0;
      const img = this.sprites.get(`ball${e.crack}${e.state === "ball" ? "e" : ""}`, e.dir < 0, () => buildBall(e.crack, e.state === "ball"));
      const x = Math.round(cx - 10 + wobble);
      const y = Math.round(bottom - 19);
      if (e.state === "rolling") {
        // 굴러가는 잔상과 회전 무늬
        ctx.globalAlpha = 0.35;
        ctx.drawImage(img, Math.round(x - e.dir * 6), y);
        ctx.globalAlpha = 1;
        ctx.drawImage(img, x, y);
        const a = (e.x / 9) * e.dir;
        ctx.fillStyle = "#9cc4ea";
        for (const k of [0, Math.PI * 0.66, Math.PI * 1.33]) ctx.fillRect(Math.round(cx + Math.cos(a + k) * 5), Math.round(bottom - 9 + Math.sin(a + k) * 5), 2, 2);
        if (e.grounded && Math.random() < 0.6) {
          this.particles.push({ x: cx - e.dir * 8, y: bottom - 2, vx: -e.dir * (30 + Math.random() * 40), vy: -40 - Math.random() * 40, life: 0, max: 0.35, color: "#ffffff", size: 2, gravity: 300 });
        }
        if (e.chain >= 2) {
          ctx.fillStyle = ["#ffe14a", "#ff7ac8", "#7cf0ff"][Math.floor(s.time * 12) % 3];
          ctx.fillRect(Math.round(cx - 1), y - 3, 2, 2);
        }
      } else ctx.drawImage(img, x, y);
      return;
    }
    const img = this.enemySprite(e, s);
    const [w, h] = SPRITE_SIZE[e.kind];
    const x = Math.round(cx - w / 2);
    const y = Math.round(bottom - h + 1);
    if (e.state === "dead") {
      // 쓰러짐: 뒤집혀 날아간다
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - e.deadTime / 1.2);
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(1, -1);
      ctx.drawImage(img, -w / 2, -h / 2);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    ctx.drawImage(img, x, y);
    if (e.snow > 0) {
      const level = Math.min(e.snow, 2);
      const cover = this.sprites.get(`snow-${e.kind}-${level}`, e.dir < 0, () => buildSnowCover(w, h, level, ENEMY[e.kind].w));
      ctx.drawImage(cover, x, y);
    }
  }

  private drawBoss(ctx: CanvasRenderingContext2D, s: GameState, dt: number) {
    const b = s.boss;
    if (this.bossBooms > 0) {
      this.bossBooms -= dt;
      if (b && Math.random() < 0.35) this.burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, 8, ["#ffe14a", "#ff9a3a", "#ffffff"], 120, 0.5, 2);
    }
    if (!b || b.state === "dead") return;
    const glow = b.state === "telegraph" && Math.floor(s.time * 10) % 2 === 0;
    const frame = Math.floor(s.time * 3) % 2;
    const flash = (b.invulnerable > 0 && Math.floor(s.time * 16) % 2 === 0) || (b.state === "dying" && Math.floor(s.time * 10) % 2 === 0);
    const img = this.sprites.get(`boss${frame}${glow ? "g" : ""}${flash ? "f" : ""}`, b.dir < 0, () => {
      const p: Pix = buildGuardian(frame, glow);
      return flash ? p.silhouette("#ffffff") : p;
    });
    const cx = b.x + b.w / 2;
    const bottom = b.y + b.h;
    const shakeX = b.state === "dying" ? Math.round((Math.random() - 0.5) * 3) : 0;
    const x = Math.round(cx - 16 + shakeX);
    const y = Math.round(bottom - 37);
    ctx.drawImage(img, x, y);
    if (!flash) {
      // 가슴 시계 바늘
      const ccx = x + 16;
      const ccy = y + 21;
      ctx.fillStyle = "#3a2a1a";
      for (let k = 0; k < 5; k++) ctx.fillRect(Math.round(ccx + Math.cos(s.time * 4) * k), Math.round(ccy + Math.sin(s.time * 4) * k), 1, 1);
      for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(ccx + Math.cos(s.time * 0.5) * k), Math.round(ccy + Math.sin(s.time * 0.5) * k), 1, 1);
    }
    if (glow) this.drawGearShape(ctx, b.dir > 0 ? x + 28 : x + 4, y + 8, 5, s.time * 8, "#c4ceda", 6);
  }

  private drawGear(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number) {
    this.drawGearShape(ctx, x, y, 5, spin, "#c4ceda", 6);
    ctx.fillStyle = "#4a5566";
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
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
    if ((kind === "candy" || kind === "gem") && Math.floor(time * 8) % 3 === 0) {
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
    ctx.fillStyle = "#0b1020";
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
        // 처음 0.12초는 크게 튀어나왔다가 제 크기로
        const size = p.life > 0.98 ? 24 : 16;
        this.text(ctx, p.text, Math.min(Math.max(p.x, 80), WORLD_W - 80), p.y - (size === 24 ? 12 : 8), color, font, size, "center");
      } else this.text(ctx, p.text, Math.min(Math.max(p.x, 20), WORLD_W - 20), p.y - 4, "#ffffff", font, 8, "center");
    }
  }

  private drawPhase(ctx: CanvasRenderingContext2D, s: GameState, font: string) {
    if (s.phase === "intro") {
      ctx.fillStyle = "rgba(11,16,32,0.55)";
      ctx.fillRect(0, 92, WORLD_W, 64);
      this.text(ctx, `STAGE ${s.stageIndex + 1}`, WORLD_W / 2, 100, "#ffe14a", font, 16, "center");
      this.text(ctx, s.stage.name, WORLD_W / 2, 122, "#ffffff", font, 8, "center");
      if (s.phaseTime > PHASE.intro * 0.45) this.text(ctx, "READY!", WORLD_W / 2, 138, "#7cf0ff", font, 8, "center");
    } else if (s.phase === "clear") {
      ctx.fillStyle = "rgba(11,16,32,0.45)";
      ctx.fillRect(0, 96, WORLD_W, 50);
      const last = s.stageIndex >= 4;
      this.text(ctx, last ? "BOSS DEFEATED!" : "STAGE CLEAR!", WORLD_W / 2, 104, "#ffe14a", font, 16, "center");
      this.text(ctx, "BONUS GET!", WORLD_W / 2, 128, "#ffffff", font, 8, "center");
    } else if (s.phase === "gameover" || s.phase === "victory") {
      ctx.fillStyle = "rgba(11,16,32,0.55)";
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }
  }

  private drawHud(ctx: CanvasRenderingContext2D, s: GameState, font: string, best: number) {
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, SCREEN_W, HUD_H);
    ctx.fillStyle = "#24305a";
    ctx.fillRect(0, HUD_H - 2, SCREEN_W, 2);
    this.text(ctx, "1P", 8, 4, "#ffe14a", font);
    this.text(ctx, String(s.score).padStart(7, "0"), 30, 4, "#ffffff", font);
    this.text(ctx, `STAGE ${s.stageIndex + 1}/5`, SCREEN_W / 2, 4, "#7cf0ff", font, 8, "center");
    this.text(ctx, "HI", SCREEN_W - 92, 4, "#ff9a7a", font);
    this.text(ctx, String(Math.max(best, s.score)).padStart(7, "0"), SCREEN_W - 68, 4, "#ffffff", font);
    // 목숨 (여우 얼굴)
    const life = this.sprites.get("item-life", false, () => buildItem("life"));
    for (let i = 0; i < s.player.lives; i++) ctx.drawImage(life, 6 + i * 13, 15);
    let x = 8 + Math.max(s.player.lives, 1) * 13 + 4;
    const icon = (kind: string, remain: number) => {
      const img = this.sprites.get(`item-${kind}`, false, () => buildItem(kind));
      ctx.drawImage(img, x, 15);
      if (remain >= 0) {
        ctx.fillStyle = "#24305a";
        ctx.fillRect(x + 1, 28, 12, 2);
        ctx.fillStyle = "#7cf0ff";
        ctx.fillRect(x + 1, 28, Math.round(12 * Math.min(1, remain / 15)), 2);
      }
      x += 16;
    };
    if (s.player.shield) icon("shield", -1);
    if (s.player.speedBoost > 0) icon("boots", s.player.speedBoost);
    if (s.player.rapid > 0) icon("rapid", s.player.rapid);
    if (s.player.giant > 0) icon("giant", s.player.giant);
    // 바람 표시
    if (s.stage.wind) {
      const dir = s.wind >= 0 ? ">" : "<";
      const n = Math.max(1, Math.round(Math.abs(s.wind) * 3));
      this.text(ctx, `WIND ${dir.repeat(n)}`, SCREEN_W / 2, 18, "#bfe4ff", font, 8, "center");
    }
    // 보스 체력
    if (s.boss && s.boss.state !== "dead") {
      this.text(ctx, "BOSS", SCREEN_W - 92, 18, "#ff9a7a", font);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < s.boss.hp ? "#ff5a6a" : "#3a3f5a";
        ctx.fillRect(SCREEN_W - 54 + i * 14, 18, 10, 8);
        ctx.fillStyle = i < s.boss.hp ? "#ffb0b8" : "#4a5070";
        ctx.fillRect(SCREEN_W - 54 + i * 14, 18, 10, 2);
      }
    }
  }

  /** 시작 화면 등에서 쓰는 미리보기 그림 (React) */
  foxPreview(pose: FoxPose): HTMLCanvasElement {
    return this.fox(pose, false);
  }
}
