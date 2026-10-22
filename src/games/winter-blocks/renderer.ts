import { GAME_CONFIG } from "./config";
import { ghostY, HIDDEN, pieceCells } from "./logic/game";
import { shapeCells } from "./logic/pieces";
import type { Cell, CellKind, GameEvent, GameState, PieceType } from "./types";

/*
 * Winter Blocks 캔버스 그리기 (자체 디자인). 게임 상태를 읽기만 하고 바꾸지 않는다.
 * 내부 해상도는 고정(칸 24px)이고, 실제 크기는 CSS가 정한다. 선명도를 위해 devicePixelRatio를 곱해 그린다.
 */

export const CELL = 24;
export const BOARD_W = GAME_CONFIG.cols * CELL;
export const BOARD_H = GAME_CONFIG.visibleRows * CELL;

/** 블록 색: 겨울밤에 어울리는 밝은 얼음·불빛 색 */
const COLORS: Record<CellKind, { base: string; light: string; dark: string }> = {
  I: { base: "#5eead4", light: "#ccfbf1", dark: "#0f766e" },
  O: { base: "#fcd34d", light: "#fef3c7", dark: "#b45309" },
  T: { base: "#a78bfa", light: "#ede9fe", dark: "#5b21b6" },
  S: { base: "#86efac", light: "#dcfce7", dark: "#15803d" },
  Z: { base: "#fb7185", light: "#ffe4e6", dark: "#be123c" },
  J: { base: "#60a5fa", light: "#dbeafe", dark: "#1d4ed8" },
  L: { base: "#fdba74", light: "#ffedd5", dark: "#c2410c" },
  bump: { base: "#f0abfc", light: "#fdf4ff", dark: "#a21caf" },
  snow: { base: "#f1f5f9", light: "#ffffff", dark: "#94a3b8" },
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function snowflake(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, r / 5);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (Math.PI / 3) * i;
    ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.stroke();
}

/** 칸 하나: 둥근 사각형 + 위쪽 빛 + 얼음 결 + 종류별 무늬 */
export function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, cell: Cell, alpha = 1) {
  const c = COLORS[cell.kind];
  const pad = size * 0.06;
  const s = size - pad * 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x + pad, y + pad, s, s, size * 0.16);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, c.light);
  gradient.addColorStop(0.35, c.base);
  gradient.addColorStop(1, c.dark);
  ctx.fillStyle = gradient;
  ctx.fill();
  // 얼음 결: 대각선 반짝임 두 줄
  ctx.globalAlpha = alpha * 0.45;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, size / 16);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.22, y + size * 0.5);
  ctx.lineTo(x + size * 0.5, y + size * 0.22);
  ctx.moveTo(x + size * 0.3, y + size * 0.68);
  ctx.lineTo(x + size * 0.42, y + size * 0.56);
  ctx.stroke();
  ctx.globalAlpha = alpha;
  if (cell.kind === "snow") snowflake(ctx, x + size / 2, y + size / 2, size * 0.28, "#7dd3fc");
  if (cell.kind === "bump") {
    // 혹: 가운데 작은 별
    ctx.fillStyle = "#ffffff";
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size * 0.16;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const rr = i % 2 === 0 ? r : r * 0.4;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.fill();
  }
  if (cell.ice) {
    // 얼음: 푸른 유리막, 금이 가면 갈라진 선
    ctx.fillStyle = "rgba(186, 230, 253, 0.55)";
    roundRect(ctx, x + pad, y + pad, s, s, size * 0.16);
    ctx.fill();
    ctx.strokeStyle = "#e0f2fe";
    ctx.lineWidth = Math.max(1, size / 12);
    ctx.stroke();
    if (cell.ice === "cracked") {
      ctx.strokeStyle = "#0c4a6e";
      ctx.lineWidth = Math.max(1, size / 14);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.15, y + size * 0.3);
      ctx.lineTo(x + size * 0.45, y + size * 0.5);
      ctx.lineTo(x + size * 0.35, y + size * 0.85);
      ctx.moveTo(x + size * 0.45, y + size * 0.5);
      ctx.lineTo(x + size * 0.85, y + size * 0.4);
      ctx.moveTo(x + size * 0.62, y + size * 0.45);
      ctx.lineTo(x + size * 0.7, y + size * 0.15);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** devicePixelRatio에 맞춰 캔버스 크기를 맞추고 그리기 좌표를 내부 해상도로 둔다. */
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

const rowY = (row: number) => (row - HIDDEN) * CELL;

export function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, recent: readonly { event: GameEvent; at: number }[]) {
  const t = state.time;
  // 배경: 깊은 남색 → 보라
  const bg = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  bg.addColorStop(0, "#0b1338");
  bg.addColorStop(1, "#1e1146");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, BOARD_W, BOARD_H);
  // 격자
  ctx.strokeStyle = "rgba(148, 163, 255, 0.09)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < GAME_CONFIG.cols; x++) {
    ctx.moveTo(x * CELL + 0.5, 0);
    ctx.lineTo(x * CELL + 0.5, BOARD_H);
  }
  for (let y = 1; y < GAME_CONFIG.visibleRows; y++) {
    ctx.moveTo(0, y * CELL + 0.5);
    ctx.lineTo(BOARD_W, y * CELL + 0.5);
  }
  ctx.stroke();

  if (state.phase === "title") return;

  // 눈 블록 예고: 해당 열이 은은하게 깜빡이고 맨 위에 눈송이 표시
  if (state.snowColumn !== null) {
    const pulse = 0.12 + 0.1 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(186, 230, 253, ${pulse})`;
    ctx.fillRect(state.snowColumn * CELL, 0, CELL, BOARD_H);
    snowflake(ctx, state.snowColumn * CELL + CELL / 2, CELL / 2, CELL * 0.32, "#e0f2fe");
  }

  // 쌓인 칸
  state.board.forEach((row, y) => {
    if (y < HIDDEN) return;
    row.forEach((cell, x) => {
      if (cell) drawCell(ctx, x * CELL, rowY(y), CELL, cell);
    });
  });

  // 줄 제거 연출: 하얗게 빛나며 사라짐
  if (state.stage === "clear") {
    const p = 1 - state.stageTimer / GAME_CONFIG.clearTime;
    for (const y of state.clearingRows) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.85 * (1 - p)})`;
      ctx.fillRect(0, rowY(y), BOARD_W, CELL);
      for (let i = 0; i < 5; i++) {
        snowflake(ctx, ((i + 0.5) / 5) * BOARD_W + p * 20 * (i % 2 ? 1 : -1), rowY(y) + CELL / 2 - p * 14, CELL * 0.25 * (1 - p * 0.5), `rgba(224,242,254,${1 - p})`);
      }
    }
  }

  // 낙하 블록과 고스트
  if (state.active) {
    const ghost = { ...state.active, y: ghostY(state.board, state.active) };
    const color = COLORS[state.active.type];
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = color.base;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    for (const { x, y } of pieceCells(ghost)) if (y >= HIDDEN) ctx.strokeRect(x * CELL + 3, rowY(y) + 3, CELL - 6, CELL - 6);
    ctx.restore();
    for (const { x, y } of pieceCells(state.active)) if (y >= HIDDEN) drawCell(ctx, x * CELL, rowY(y), CELL, { kind: state.active.type });
  }

  // 혹·얼음·눈 생성 연출 (최근 이벤트)
  for (const { event, at } of recent) {
    const age = t - at;
    if (age < 0 || age > 0.6) continue;
    if (event.type === "bump" || event.type === "snowfall" || event.type === "iceCreate") {
      const cells = event.type === "bump" ? event.cells : [event.cell];
      for (const cell of cells) {
        const cx = cell.x * CELL + CELL / 2;
        const cy = rowY(cell.y) + CELL / 2;
        const p = age / 0.6;
        ctx.save();
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = event.type === "bump" ? "#f5d0fe" : "#e0f2fe";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * (0.3 + p * 0.9), 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + p;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(cx + Math.cos(a) * CELL * p * 1.1 - 1, cy + Math.sin(a) * CELL * p * 1.1 - 1, 2, 2);
        }
        ctx.restore();
      }
    }
  }

  // 바람 예고: 판 위쪽에 바람 방향으로 흐르는 줄무늬
  if (state.wind) {
    const dir = state.wind.dir;
    const strength = state.wind.timer < 1 ? 0.55 : 0.3;
    ctx.save();
    ctx.strokeStyle = `rgba(224, 242, 254, ${strength})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const y = 20 + i * 26;
      const offset = ((t * 140 * dir + i * 47) % (BOARD_W + 60) + BOARD_W + 60) % (BOARD_W + 60) - 30;
      ctx.beginPath();
      ctx.moveTo(offset, y);
      ctx.lineTo(offset - dir * 26, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 홀드·다음 블록 미리보기 */
export function drawPreview(ctx: CanvasRenderingContext2D, type: PieceType | null, width: number, height: number, dim = false) {
  ctx.clearRect(0, 0, width, height);
  if (!type) return;
  const cells = shapeCells(type, 0);
  const minX = Math.min(...cells.map((c) => c.x));
  const maxX = Math.max(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxY = Math.max(...cells.map((c) => c.y));
  const size = Math.min(width / 4.4, height / 2.6);
  const ox = (width - (maxX - minX + 1) * size) / 2;
  const oy = (height - (maxY - minY + 1) * size) / 2;
  for (const c of cells) drawCell(ctx, ox + (c.x - minX) * size, oy + (c.y - minY) * size, size, { kind: type }, dim ? 0.4 : 1);
}

// ── 게임판 바깥 배경의 눈 ──

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  twinkle: number;
}

/** 게임판 밖 배경에서 내리는 눈 (연출 전용, 게임 규칙과 무관해 Math.random 사용) */
export class SnowField {
  private flakes: Flake[] = [];
  private gust = 0;
  private gustDir = 0;

  constructor(count = 70) {
    for (let i = 0; i < count; i++) this.flakes.push(this.spawn(Math.random()));
  }

  private spawn(y: number): Flake {
    return { x: Math.random(), y, r: 0.6 + Math.random() * 1.8, speed: 0.03 + Math.random() * 0.05, drift: Math.random() * Math.PI * 2, twinkle: Math.random() * 6 };
  }

  /** 바람이 불면 잠깐 눈이 옆으로 휩쓸린다 */
  blow(dir: -1 | 1) {
    this.gust = 1.2;
    this.gustDir = dir;
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number, time: number) {
    ctx.clearRect(0, 0, width, height);
    this.gust = Math.max(0, this.gust - dt);
    const wind = this.gust > 0 ? this.gustDir * 0.35 * Math.min(1, this.gust) : 0;
    for (const f of this.flakes) {
      f.y += f.speed * dt;
      f.x += (Math.sin(time * 0.8 + f.drift) * 0.01 + wind) * dt;
      if (f.y > 1.02) Object.assign(f, this.spawn(-0.02));
      if (f.x < -0.02) f.x += 1.04;
      if (f.x > 1.02) f.x -= 1.04;
      const alpha = 0.45 + 0.35 * Math.sin(time * 2 + f.twinkle);
      ctx.fillStyle = `rgba(241, 245, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(f.x * width, f.y * height, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
