import { chainLabel, chainMultiplier, COLS, GAME_CONFIG, ROWS, SPAWN_X, SPAWN_Y } from "../config";
import { landingCells, pairCells } from "../logic/board";
import type { Color, Crystal, GameEvent, GameState } from "../types";
import { CRYSTALS, CrystalCache } from "./crystals";

/*
 * 보드 캔버스 그리기 (상태를 읽기만 하고 바꾸지 않는다).
 * 내부 해상도 192×384(칸 32px) × devicePixelRatio로 그리고, 화면 크기는 CSS로 맞춘다.
 * 연출(파편·연쇄 문구·화면 흔들림)은 게임 이벤트를 받아 여기서만 만든다. Math.random()은 연출에만 쓴다.
 */

export const CELL = 32;
export const BOARD_W = COLS * CELL;
export const BOARD_H = ROWS * CELL;

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

interface Particle {
  kind: "shard" | "spark" | "ring";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  max: number;
  color: string;
}

interface Popup {
  kind: "combo" | "total" | "bonus";
  text: string;
  sub?: string;
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  color: string;
}

export interface RenderOptions {
  /** 화면 흔들림 배율 (0 = 끔, 0.4 = 약하게, 1 = 보통) */
  shake: number;
  font: string;
}

const MAX_PARTICLES = 420;
const ease = (t: number) => t * t;

export class CascadeRenderer {
  private crystals = new CrystalCache();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private shakeTime = 0;
  private shakePower = 0;
  private flash = 0;
  private flashColor = "#ffffff";
  private clock = 0;

  /** 게임 이벤트 → 연출 */
  handle(events: readonly GameEvent[]) {
    for (const e of events) {
      if (e.type === "pop") this.onPop(e.chain, e.crystals, e.points);
      else if (e.type === "chainEnd" && e.chain >= 2)
        this.popups.push({ kind: "total", text: `+${e.total.toLocaleString("en-US")}`, sub: `${e.chain} CHAIN`, x: BOARD_W / 2, y: BOARD_H * 0.42, age: 0, life: 1.3, size: 14, color: "#fff3bd" });
      else if (e.type === "timeBonus")
        this.popups.push({ kind: "bonus", text: `+${e.seconds} SEC`, x: BOARD_W / 2, y: 46, age: 0, life: 1.2, size: 12, color: "#7dffb9" });
      else if (e.type === "start") this.reset();
    }
  }

  reset() {
    this.particles = [];
    this.popups = [];
    this.shakeTime = 0;
    this.flash = 0;
  }

  private onPop(chain: number, crystals: Crystal[], points: number) {
    const level = Math.min(chain, 5);
    const perCrystal = Math.min(5 + level * 3, Math.floor((MAX_PARTICLES - this.particles.length) / Math.max(crystals.length, 1)));
    for (const c of crystals) {
      const cx = c.x * CELL + CELL / 2;
      const cy = c.y * CELL + CELL / 2;
      const style = CRYSTALS[c.color];
      for (let i = 0; i < perCrystal; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * (60 + level * 40);
        const spark = i % 3 === 0;
        this.particles.push({
          kind: spark ? "spark" : "shard",
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 14,
          size: spark ? 2 + Math.random() * 2 : 3 + Math.random() * (2 + level),
          life: 0,
          max: 0.45 + Math.random() * (0.3 + level * 0.08),
          color: spark ? style.glow : i % 2 ? style.main : style.light,
        });
      }
      this.particles.push({ kind: "ring", x: cx, y: cy, vx: 0, vy: 0, rot: 0, vr: 0, size: CELL * (0.6 + level * 0.15), life: 0, max: 0.35, color: style.glow });
    }
    const cx = crystals.reduce((s, c) => s + c.x, 0) / crystals.length;
    const cy = crystals.reduce((s, c) => s + c.y, 0) / crystals.length;
    const label = chainLabel(chain);
    this.popups.push({
      kind: "combo",
      text: label,
      sub: chain >= 2 ? `${chain} CHAIN ×${chainMultiplier(chain)}  +${points.toLocaleString("en-US")}` : `+${points.toLocaleString("en-US")}`,
      x: (cx + 0.5) * CELL,
      y: Math.min(Math.max(cy * CELL, 70), BOARD_H - 60),
      age: 0,
      life: 0.95 + level * 0.1,
      size: Math.min(9 + level * 2.6, 22),
      color: ["#ffffff", "#ffffff", "#bfffdc", "#ffe27a", "#ffb3c1", "#ffffff"][level],
    });
    // 지금 터지는 문구가 가장 잘 보이도록 예전 연쇄 문구는 빨리 지운다
    for (const p of this.popups) if (p.kind === "combo" && p.text !== label) p.age = Math.max(p.age, p.life - 0.15);
    this.shakePower = Math.max(this.shakePower * (this.shakeTime > 0 ? 1 : 0), GAME_CONFIG.shake[level]);
    this.shakeTime = 0.12 + level * 0.04;
    this.flash = 0.1 + level * 0.07;
    this.flashColor = CRYSTALS[crystals[0].color].glow;
  }

  private update(dt: number) {
    this.clock += dt;
    for (const p of this.particles) {
      p.life += dt;
      if (p.kind === "ring") continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.vx *= 1 - 1.6 * dt;
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.popups) p.age += dt;
    this.popups = this.popups.filter((p) => p.age < p.life);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) this.shakePower = 0;
    this.flash = Math.max(0, this.flash - dt);
  }

  /** dt: 연출을 진행할 시간 (일시정지 중에는 0) */
  render(ctx: CanvasRenderingContext2D, state: GameState, dt: number, opts: RenderOptions) {
    this.update(dt);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    ctx.save();
    if (this.shakeTime > 0 && opts.shake > 0) {
      const m = this.shakePower * opts.shake * (this.shakeTime / 0.3 + 0.3);
      ctx.translate(Math.round((Math.random() - 0.5) * 2 * m), Math.round((Math.random() - 0.5) * 2 * m));
    }
    this.drawBackground(ctx, state);
    this.drawBoard(ctx, state, dpr);
    if (state.active && state.phase !== "over") this.drawActive(ctx, state, dpr);
    this.drawParticles(ctx);
    ctx.restore();
    this.drawUrgency(ctx, state);
    this.drawPopups(ctx, opts.font);
    if (state.phase === "ready") this.drawReady(ctx, state, opts.font);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, state: GameState) {
    const bg = ctx.createLinearGradient(0, 0, 0, BOARD_H);
    bg.addColorStop(0, "#140a33");
    bg.addColorStop(1, "#22104a");
    ctx.fillStyle = bg;
    ctx.fillRect(-8, -8, BOARD_W + 16, BOARD_H + 16);
    // 동굴 벽의 희미한 결정 무늬
    ctx.fillStyle = "rgba(167, 139, 250, 0.06)";
    for (let i = 0; i < 9; i++) {
      const x = (i * 53) % BOARD_W;
      const y = BOARD_H - 30 - ((i * 97) % 220);
      ctx.beginPath();
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 18);
      ctx.lineTo(x - 7, y);
      ctx.fill();
    }
    // 격자
    ctx.strokeStyle = "rgba(196, 181, 253, 0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) {
      ctx.moveTo(x * CELL + 0.5, 0);
      ctx.lineTo(x * CELL + 0.5, BOARD_H);
    }
    for (let y = 1; y < ROWS; y++) {
      ctx.moveTo(0, y * CELL + 0.5);
      ctx.lineTo(BOARD_W, y * CELL + 0.5);
    }
    ctx.stroke();
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(this.flash * 1.2, 0.35);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
      ctx.globalAlpha = 1;
    }
    // 생성 위치 표시: 막히면 Game Over
    const sx = SPAWN_X * CELL;
    const sy = SPAWN_Y * CELL;
    const blocked = state.board[SPAWN_Y + 1]?.[SPAWN_X] !== 0 || state.board[SPAWN_Y + 2]?.[SPAWN_X] !== 0;
    ctx.strokeStyle = blocked ? `rgba(251, 113, 133, ${0.55 + 0.35 * Math.sin(this.clock * 10)})` : "rgba(251, 113, 133, 0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy + 9);
    ctx.lineTo(sx + CELL - 9, sy + CELL - 9);
    ctx.moveTo(sx + CELL - 9, sy + 9);
    ctx.lineTo(sx + 9, sy + CELL - 9);
    ctx.stroke();
  }

  private drawBoard(ctx: CanvasRenderingContext2D, state: GameState, dpr: number) {
    const r = state.resolve;
    const falling = new Map<string, number>();
    if (r?.stage === "drop") {
      for (const f of r.falls) {
        const d = f.toY - f.fromY;
        const p = Math.min(r.timer / (GAME_CONFIG.dropBase + GAME_CONFIG.dropPerCell * d), 1);
        falling.set(`${f.x},${f.toY}`, f.fromY + d * ease(p));
      }
    }
    const popping = new Set<string>();
    let popProgress = 0;
    if (r?.stage === "pop") {
      for (const c of r.popping) popping.add(`${c.x},${c.y}`);
      popProgress = Math.min(r.timer / r.duration, 1);
    }
    const settled = (x: number, y: number) => !falling.has(`${x},${y}`) && !popping.has(`${x},${y}`);

    // 같은 색끼리 이어진 칸은 연결선을 그려 그룹을 읽기 쉽게 한다
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = state.board[y][x];
        if (!c || !settled(x, y)) continue;
        ctx.fillStyle = CRYSTALS[c].main;
        ctx.globalAlpha = 0.45;
        if (x + 1 < COLS && state.board[y][x + 1] === c && settled(x + 1, y)) ctx.fillRect(x * CELL + CELL / 2, y * CELL + CELL / 2 - 4, CELL, 8);
        if (y + 1 < ROWS && state.board[y + 1][x] === c && settled(x, y + 1)) ctx.fillRect(x * CELL + CELL / 2 - 4, y * CELL + CELL / 2, 8, CELL);
        ctx.globalAlpha = 1;
      }
    }

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = state.board[y][x];
        if (!c) continue;
        const key = `${x},${y}`;
        if (popping.has(key)) {
          // 반짝임 → 부풀었다가 사라짐
          const blink = popProgress < 0.6 && Math.floor(popProgress * 14) % 2 === 0;
          const scale = popProgress < 0.6 ? 1 + popProgress * 0.25 : Math.max(1.15 - (popProgress - 0.6) * 2.9, 0);
          this.drawCrystal(ctx, c, x * CELL, y * CELL, dpr, { white: blink, scale });
        } else {
          const fy = falling.get(key);
          this.drawCrystal(ctx, c, x * CELL, (fy ?? y) * CELL, dpr);
        }
      }
    }
  }

  private drawActive(ctx: CanvasRenderingContext2D, state: GameState, dpr: number) {
    const pair = state.active!;
    // 떨어질 자리 미리보기 (갈라지는 경우도 표시)
    for (const c of landingCells(state.board, pair)) {
      if (c.y < 0) continue;
      ctx.strokeStyle = CRYSTALS[c.color].glow;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x * CELL + 5, c.y * CELL + 5, CELL - 10, CELL - 10);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    const cells = pairCells(pair);
    // 축 크리스털 둘레의 빛 (회전 중심)
    const pivot = cells[0];
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.beginPath();
    ctx.arc(pivot.x * CELL + CELL / 2, pivot.y * CELL + CELL / 2, CELL * 0.58 + Math.sin(this.clock * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    for (const c of cells) if (c.y >= -1) this.drawCrystal(ctx, c.color, c.x * CELL, c.y * CELL, dpr);
  }

  private drawCrystal(ctx: CanvasRenderingContext2D, color: Color, x: number, y: number, dpr: number, opts: { white?: boolean; scale?: number } = {}) {
    const scale = opts.scale ?? 1;
    if (scale <= 0) return;
    const img = this.crystals.get(color, CELL, dpr, opts.white);
    const size = CELL * scale;
    ctx.drawImage(img, x + (CELL - size) / 2, y + (CELL - size) / 2, size, size);
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = 1 - t;
      if (p.kind === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === "spark") {
        ctx.fillStyle = p.color;
        const s = p.size * (1 - t * 0.5);
        ctx.fillRect(p.x - s / 2, p.y - s * 1.5, s, s * 3);
        ctx.fillRect(p.x - s * 1.5, p.y - s / 2, s * 3, s);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.7, p.size * 0.6);
        ctx.lineTo(-p.size * 0.7, p.size * 0.6);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawUrgency(ctx: CanvasRenderingContext2D, state: GameState) {
    if (state.mode !== "rush" || state.phase !== "playing" || state.timeLeft > 5) return;
    const pulse = 0.35 + 0.25 * Math.sin(this.clock * 9);
    const band = ctx.createLinearGradient(0, 0, 0, 70);
    band.addColorStop(0, `rgba(244, 63, 94, ${pulse})`);
    band.addColorStop(1, "rgba(244, 63, 94, 0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, BOARD_W, 70);
  }

  private drawPopups(ctx: CanvasRenderingContext2D, font: string) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.popups) {
      const t = p.age / p.life;
      // 확대되며 나타났다가(탄성) 위로 떠오르며 사라진다
      const grow = p.age < 0.18 ? 0.4 + (p.age / 0.18) * 0.9 : p.age < 0.3 ? 1.3 - ((p.age - 0.18) / 0.12) * 0.3 : 1;
      const y = p.y - (p.kind === "combo" ? t * 22 : t * 30);
      ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
      const size = Math.round(p.size * grow);
      ctx.font = `${size}px ${font}`;
      // 보드 너비를 넘지 않도록 줄이고, 글자 전체가 보드 안에 들어오도록 가운데 위치를 옮긴다
      let width = ctx.measureText(p.text).width;
      if (width > BOARD_W - 8) {
        ctx.font = `${Math.floor((size * (BOARD_W - 8)) / width)}px ${font}`;
        width = BOARD_W - 8;
      }
      const x = Math.min(Math.max(p.x, width / 2 + 4), BOARD_W - width / 2 - 4);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1a0b3b";
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
      if (p.sub) {
        ctx.font = `7px ${font}`;
        const subX = Math.min(Math.max(p.x, ctx.measureText(p.sub).width / 2 + 4), BOARD_W - ctx.measureText(p.sub).width / 2 - 4);
        ctx.lineWidth = 3;
        ctx.strokeText(p.sub, subX, y + size * 0.5 + 9);
        ctx.fillStyle = "#e9d5ff";
        ctx.fillText(p.sub, subX, y + size * 0.5 + 9);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawReady(ctx: CanvasRenderingContext2D, state: GameState, font: string) {
    const go = state.readyTimer < 0.45;
    ctx.fillStyle = "rgba(20, 10, 51, 0.45)";
    ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${go ? 26 : 18}px ${font}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#1a0b3b";
    const text = go ? "GO!" : "READY?";
    ctx.strokeText(text, BOARD_W / 2, BOARD_H / 2);
    ctx.fillStyle = go ? "#7dffb9" : "#ffe27a";
    ctx.fillText(text, BOARD_W / 2, BOARD_H / 2);
  }
}

/** 다음 크리스털 미리보기: 짝(위)과 축(아래) */
export function drawNext(ctx: CanvasRenderingContext2D, colors: [Color, Color] | undefined, w: number, h: number, cache: CrystalCache) {
  ctx.clearRect(0, 0, w, h);
  if (!colors) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const size = Math.min(w, h / 2);
  const x = (w - size) / 2;
  ctx.drawImage(cache.get(colors[1], size, dpr), x, h / 2 - size, size, size);
  ctx.drawImage(cache.get(colors[0], size, dpr), x, h / 2, size, size);
}
