import type { Color } from "../types";

/*
 * 크리스털 그림 (자체 제작, 외부 에셋 없음). 다섯 색마다 모양이 달라 색을 구분하기 어려워도 알아볼 수 있다.
 *   1 Ruby 마름모 · 2 Emerald 팔각형 · 3 Sapphire 원 · 4 Topaz 별 · 5 Amethyst 삼각형
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
  1: { name: "Ruby", main: "#ff3d64", dark: "#8f0f33", light: "#ffc2cf", glow: "#ff8fa6" },
  2: { name: "Emerald", main: "#25d97a", dark: "#07693a", light: "#bfffdc", glow: "#7dffb9" },
  3: { name: "Sapphire", main: "#3f8cff", dark: "#17318f", light: "#c6dcff", glow: "#8cbaff" },
  4: { name: "Topaz", main: "#ffc533", dark: "#9a5d00", light: "#fff3bd", glow: "#ffe27a" },
  5: { name: "Amethyst", main: "#b95cff", dark: "#521a96", light: "#ecd2ff", glow: "#d9a3ff" },
};

/** 단위 좌표(-1~1)의 외곽선 꼭짓점. 원은 null */
function outline(color: Color): [number, number][] | null {
  switch (color) {
    case 1:
      return [[0, -0.92], [0.82, 0], [0, 0.92], [-0.82, 0]];
    case 2: {
      const a = 0.82;
      const c = 0.36;
      return [[-a + c, -a], [a - c, -a], [a, -a + c], [a, a - c], [a - c, a], [-a + c, a], [-a, a - c], [-a, -a + c]];
    }
    case 3:
      return null;
    case 4: {
      const pts: [number, number][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.95 : 0.46;
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push([Math.cos(angle) * r, Math.sin(angle) * r + 0.06]);
      }
      return pts;
    }
    case 5:
      return [[0, -0.86], [0.9, 0.74], [-0.9, 0.74]];
  }
}

function tracePath(ctx: CanvasRenderingContext2D, color: Color, cx: number, cy: number, r: number) {
  ctx.beginPath();
  const pts = outline(color);
  if (!pts) {
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    return;
  }
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(cx + x * r, cy + y * r) : ctx.lineTo(cx + x * r, cy + y * r)));
  ctx.closePath();
}

/** 크리스털 하나를 (cx, cy)를 중심으로 지름 size 안에 그린다. white: 터지기 직전 반짝임 */
export function paintCrystal(ctx: CanvasRenderingContext2D, color: Color, cx: number, cy: number, size: number, white = false) {
  const style = CRYSTALS[color];
  const r = size / 2;
  ctx.save();
  // 몸체: 위 왼쪽이 밝은 대각선 그라데이션
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, white ? "#ffffff" : style.light);
  grad.addColorStop(0.45, white ? "#ffffff" : style.main);
  grad.addColorStop(1, white ? style.light : style.dark);
  tracePath(ctx, color, cx, cy, r);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size / 14);
  ctx.strokeStyle = white ? style.main : style.dark;
  ctx.lineJoin = "round";
  ctx.stroke();

  // 깎은 면: 안쪽 작은 같은 모양 + 꼭짓점으로 가는 선
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, size / 24);
  ctx.strokeStyle = style.light;
  tracePath(ctx, color, cx, cy, r * 0.48);
  ctx.stroke();
  const pts = outline(color);
  if (pts) {
    ctx.beginPath();
    for (const [x, y] of pts) {
      ctx.moveTo(cx + x * r * 0.48, cy + y * r * 0.48);
      ctx.lineTo(cx + x * r * 0.92, cy + y * r * 0.92);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(cx + Math.cos(a) * r * 0.41, cy + Math.sin(a) * r * 0.41);
      ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
    }
    ctx.stroke();
  }

  // 반사광
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy - r * 0.34, r * 0.16, r * 0.09, -0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.fillRect(cx + r * 0.22, cy - r * 0.5, Math.max(1, r * 0.08), Math.max(1, r * 0.08));
  ctx.restore();
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
