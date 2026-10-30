import type { Color } from "../types";

/*
 * 크리스털 그림 (자체 제작, 외부 에셋 없음).
 * 다섯 색 모두 같은 크기·비율의 팔각 쿠션 컷 보석이다. 바깥 8개 반사면은 왼쪽 위 빛을 기준으로 면마다 다른 단색으로 칠해
 * 날카로운 입체감을 내고, 가운데 면(table)에는 색마다 다른 무늬를 넣어 색을 구분하기 어려워도 알아볼 수 있게 한다.
 *   1 Ruby 마름모 · 2 Emerald 계단 사각 · 3 Sapphire 원 · 4 Topaz 별 · 5 Amethyst 삼각형
 * 선명도: 블러·shadowBlur·반투명 겹치기를 쓰지 않고 불투명한 면과 외곽선만 그린다.
 * 한 번 그린 크리스털은 크기·색·상태별로 캔버스에 저장해 매 프레임 다시 그리지 않는다.
 */

export interface CrystalStyle {
  name: string;
  main: string;
  dark: string;
  light: string;
  /** 파편·빛 색 */
  glow: string;
}

export const CRYSTALS: Record<Color, CrystalStyle> = {
  1: { name: "Ruby", main: "#f2264b", dark: "#7a0722", light: "#ffb3c2", glow: "#ff8fa6" },
  2: { name: "Emerald", main: "#16c46a", dark: "#04562c", light: "#b4ffd6", glow: "#7dffb9" },
  3: { name: "Sapphire", main: "#2f7bff", dark: "#0f2a85", light: "#bcd6ff", glow: "#8cbaff" },
  4: { name: "Topaz", main: "#ffbf1f", dark: "#8a4f00", light: "#fff1b0", glow: "#ffe27a" },
  5: { name: "Amethyst", main: "#a94dff", dark: "#45127f", light: "#e7c9ff", glow: "#d9a3ff" },
};

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** 두 색을 t(0~1)로 섞은 불투명 색 */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${c(ar, br)}, ${c(ag, bg)}, ${c(ab, bb)})`;
}

/** 팔각 쿠션 외곽선 (단위 좌표 -1~1, 위 변부터 시계 방향). 모든 색이 같은 모양이다 */
const OUTER = octagon(0.94, 0.4);
const TABLE = octagon(0.5, 0.21);
/** 빛 방향 (왼쪽 위) */
const LIGHT: [number, number] = [-0.62, -0.78];

function octagon(a: number, c: number): [number, number][] {
  return [[-a + c, -a], [a - c, -a], [a, -a + c], [a, a - c], [a - c, a], [-a + c, a], [-a, a - c], [-a, -a + c]];
}

/** 바깥 반사면 i의 밝기 -1(어두움)~1(밝음): 면의 바깥 방향과 빛 방향의 내적 */
function facetLight(i: number): number {
  const [x1, y1] = OUTER[i];
  const [x2, y2] = OUTER[(i + 1) % 8];
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(mx, my);
  return (mx * LIGHT[0] + my * LIGHT[1]) / len;
}

/** 크리스털 하나를 (cx, cy)를 중심으로 지름 size 안에 그린다. white: 터지기 직전 반짝임 */
export function paintCrystal(ctx: CanvasRenderingContext2D, color: Color, cx: number, cy: number, size: number, white = false) {
  const base = CRYSTALS[color];
  const style = white ? { ...base, main: mix(base.main, "#ffffff", 0.75), dark: mix(base.dark, "#ffffff", 0.55), light: "#ffffff" } : base;
  const r = size / 2;
  const P = (p: [number, number], s = 1): [number, number] => [cx + p[0] * r * s, cy + p[1] * r * s];
  const poly = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  };
  // 면 밝기 → 색. white(터지기 직전)는 밝은·보통·어두운 세 단계만 쓴다
  const shade = (l: number) => {
    if (white) return l > 0.3 ? "#ffffff" : l > -0.3 ? style.main : style.dark;
    return l > 0 ? mix(base.main, base.light, Math.min(l * 0.85, 0.85)) : mix(base.main, base.dark, Math.min(-l * 0.8, 0.8));
  };
  const outline = white ? base.main : mix(base.dark, "#000000", 0.45);

  ctx.save();
  ctx.lineJoin = "miter";

  // 1. 바깥 반사면 8개: 면마다 단색
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    poly([P(OUTER[i]), P(OUTER[j]), P(TABLE[j]), P(TABLE[i])]);
    ctx.fillStyle = shade(facetLight(i));
    ctx.fill();
  }

  // 2. 가운데 면: 위쪽이 조금 밝은 단색 두 조각 (대각선으로 나눔)
  const table = TABLE.map((p) => P(p));
  poly(table);
  ctx.fillStyle = white ? style.main : mix(base.main, base.light, 0.12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(...table[3]);
  ctx.lineTo(...table[4]);
  ctx.lineTo(...table[5]);
  ctx.lineTo(...table[6]);
  ctx.lineTo(...table[7]);
  ctx.closePath();
  ctx.fillStyle = white ? style.main : mix(base.main, base.dark, 0.18);
  ctx.fill();

  // 3. 색마다 다른 가운데 무늬
  paintMotif(ctx, color, cx, cy, r, white ? style.light : base.light, white ? style.dark : mix(base.dark, base.main, 0.25));

  // 4. 면 사이 경계선 (얇고 불투명)
  ctx.strokeStyle = white ? style.dark : mix(base.dark, base.main, 0.35);
  ctx.lineWidth = Math.max(0.75, size / 40);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    ctx.moveTo(...P(OUTER[i]));
    ctx.lineTo(...P(TABLE[i]));
  }
  ctx.stroke();
  poly(table);
  ctx.stroke();

  // 5. 왼쪽 위 모서리의 밝은 테두리(베벨)와 외곽선
  ctx.strokeStyle = style.light;
  ctx.lineWidth = Math.max(1, size / 26);
  ctx.beginPath();
  ctx.moveTo(...P(OUTER[5], 0.9));
  for (const i of [6, 7, 0, 1]) ctx.lineTo(...P(OUTER[i], 0.9));
  ctx.stroke();
  poly(OUTER.map((p) => P(p)));
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.5, size / 15);
  ctx.stroke();

  // 6. 반사광: 왼쪽 위 면의 날카로운 흰 줄과 작은 점
  ctx.fillStyle = "#ffffff";
  poly([P([-0.62, -0.52]), P([-0.4, -0.74]), P([-0.28, -0.66]), P([-0.52, -0.42])]);
  ctx.fill();
  const dot = Math.max(1, r * 0.11);
  ctx.fillRect(Math.round(cx + r * 0.34), Math.round(cy - r * 0.62), dot, dot);
  ctx.restore();
}

function paintMotif(ctx: CanvasRenderingContext2D, color: Color, cx: number, cy: number, r: number, light: string, dark: string) {
  const s = r * 0.3;
  ctx.lineWidth = Math.max(1, r / 11);
  ctx.strokeStyle = light;
  ctx.fillStyle = dark;
  ctx.beginPath();
  switch (color) {
    case 1:
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy);
      ctx.lineTo(cx, cy + s);
      ctx.lineTo(cx - s, cy);
      ctx.closePath();
      break;
    case 2:
      ctx.rect(cx - s * 0.85, cy - s * 0.6, s * 1.7, s * 1.2);
      ctx.moveTo(cx - s * 0.45, cy);
      ctx.lineTo(cx + s * 0.45, cy);
      break;
    case 3:
      ctx.arc(cx, cy, s * 0.82, 0, Math.PI * 2);
      break;
    case 4:
      for (let i = 0; i < 8; i++) {
        const radius = i % 2 === 0 ? s * 1.05 : s * 0.36;
        const a = -Math.PI / 2 + (i * Math.PI) / 4;
        const x = cx + Math.cos(a) * radius;
        const y = cy + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 5:
      ctx.moveTo(cx, cy - s * 0.95);
      ctx.lineTo(cx + s * 0.95, cy + s * 0.7);
      ctx.lineTo(cx - s * 0.95, cy + s * 0.7);
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.stroke();
}

/** 작은 4갈래 별빛 (반짝임·파편용). 선명하도록 블러 없이 채운 다각형으로 그린다 */
export function paintSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color = "#ffffff") {
  const w = size * 0.22;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - size, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
  ctx.fill();
}

/** 크기·색·반짝임별로 그려 둔 크리스털 캔버스 */
export class CrystalCache {
  private cache = new Map<string, HTMLCanvasElement>();

  get(color: Color, size: number, dpr: number, white = false): HTMLCanvasElement {
    const key = `${color}:${size}:${dpr}:${white ? 1 : 0}`;
    let canvas = this.cache.get(key);
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = Math.ceil(size * dpr);
      canvas.height = Math.ceil(size * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      paintCrystal(ctx, color, size / 2, size / 2, size - 2, white);
      this.cache.set(key, canvas);
    }
    return canvas;
  }
}
