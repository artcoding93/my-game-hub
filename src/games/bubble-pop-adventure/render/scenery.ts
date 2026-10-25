import { MAP_COLS, MAP_ROWS, TILE, WORLD_H, WORLD_W } from "../config";
import { tileAt, type Level } from "../logic/level";
import type { StageTheme } from "../stages";

/*
 * 스테이지 배경(512×256)과 지형 타일. 모두 코드로 그린 오리지널 픽셀 아트이며 처음 한 번만 그려 둔다.
 * 움직이는 부분(반딧불·컨베이어·풍차·별 반짝임·시계 톱니·진자)은 렌더러가 매 프레임 덧그린다.
 */

function canvas(w = WORLD_W, h = WORLD_H) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 위에서 아래로 색 띠 (경계는 체크무늬 디더로 섞는다) */
function bands(ctx: CanvasRenderingContext2D, colors: string[], h = WORLD_H) {
  const band = h / colors.length;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, Math.floor(i * band), WORLD_W, Math.ceil(band) + 1);
    if (i > 0) {
      const y = Math.floor(i * band);
      ctx.fillStyle = colors[i - 1];
      for (let x = 0; x < WORLD_W; x += 2) ctx.fillRect(x + ((y / 2) % 2), y, 1, 1);
      for (let x = 1; x < WORLD_W; x += 4) ctx.fillRect(x, y + 1, 1, 1);
    }
  });
}

export function pixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

function sparkleStars(ctx: CanvasRenderingContext2D, r: () => number, n: number, maxY: number, colors: string[]) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.floor(r() * WORLD_W), Math.floor(r() * maxY), 1, 1);
  }
}

/** 달빛 정원: 보라빛 밤하늘, 큰 보름달, 아치형 덩굴 문과 산울타리, 빛나는 꽃 */
function garden() {
  const { c, ctx } = canvas();
  const r = rng(5);
  bands(ctx, ["#120f33", "#1a1646", "#241d58", "#2f2669", "#3a2f78", "#463a86"]);
  sparkleStars(ctx, r, 80, 150, ["#fff6c8", "#d8d0ff", "#ffffff"]);
  // 보름달 (무늬)
  pixelCircle(ctx, 256, 70, 34, "#fff1c2");
  pixelCircle(ctx, 256, 70, 31, "#fff7dc");
  pixelCircle(ctx, 244, 60, 6, "#f3e2b0");
  pixelCircle(ctx, 268, 82, 8, "#f3e2b0");
  pixelCircle(ctx, 266, 56, 3, "#f3e2b0");
  // 달빛 후광
  ctx.fillStyle = "rgba(255,240,200,0.06)";
  for (let k = 0; k < 3; k++) pixelCircle(ctx, 256, 70, 44 + k * 10, "rgba(255,240,200,0.05)");
  // 먼 숲 실루엣
  ctx.fillStyle = "#231c4e";
  for (let x = 0; x < WORLD_W; x++) ctx.fillRect(x, Math.floor(168 + Math.sin(x / 23) * 8 + Math.sin(x / 7) * 3), 1, WORLD_H);
  // 덩굴 아치
  for (const ax of [64, 448]) {
    ctx.fillStyle = "#2c5a48";
    for (let a = 0; a <= Math.PI; a += 0.02) ctx.fillRect(Math.round(ax + Math.cos(a) * 36), Math.round(196 - Math.sin(a) * 42), 4, 4);
    ctx.fillRect(ax - 38, 196, 4, 60);
    ctx.fillRect(ax + 34, 196, 4, 60);
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI;
      ctx.fillStyle = ["#ff9ad6", "#fff3a0", "#a6e3ff"][k % 3];
      ctx.fillRect(Math.round(ax + Math.cos(a) * 36) + 1, Math.round(196 - Math.sin(a) * 42) - 1, 2, 2);
    }
  }
  // 산울타리
  ctx.fillStyle = "#1f4a3a";
  for (let x = 0; x < WORLD_W; x += 12) pixelCircle(ctx, x, 214 + Math.floor(r() * 4), 10, "#1f4a3a");
  ctx.fillRect(0, 216, WORLD_W, 40);
  // 빛나는 꽃
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * WORLD_W);
    const y = 206 + Math.floor(r() * 30);
    ctx.fillStyle = "#3c7a5a";
    ctx.fillRect(x, y, 1, 5);
    ctx.fillStyle = ["#ff9ad6", "#fff3a0", "#a6e3ff", "#c6a6ff"][i % 4];
    ctx.fillRect(x - 1, y - 1, 3, 2);
    ctx.fillRect(x, y - 2, 1, 1);
  }
  return c;
}

/** 장난감 공장: 따뜻한 벽, 선반 위 블록 장난감, 아래쪽 컨베이어(렌더러가 움직임) */
function factory() {
  const { c, ctx } = canvas();
  const r = rng(8);
  bands(ctx, ["#5a2f3c", "#6a3846", "#7a4250", "#894c58", "#93545f"]);
  // 벽지 줄무늬
  ctx.fillStyle = "rgba(255,220,180,0.06)";
  for (let x = 0; x < WORLD_W; x += 24) ctx.fillRect(x, 0, 10, WORLD_H);
  // 선반과 블록 장난감 (발판과 헷갈리지 않도록 발판 줄 사이 높이에, 흐리게)
  const colors = ["#c25a62", "#4a78c0", "#c4a840", "#5a9a68", "#9a68c8"];
  for (const y of [44, 108]) {
    ctx.fillStyle = "#4a2530";
    ctx.fillRect(24, y, WORLD_W - 48, 4);
    ctx.fillStyle = "#b47a5a";
    ctx.fillRect(24, y, WORLD_W - 48, 1);
    for (let x = 30; x < WORLD_W - 40; x += 20 + Math.floor(r() * 16)) {
      const h = 8 + Math.floor(r() * 3) * 4;
      const col = colors[Math.floor(r() * colors.length)];
      ctx.fillStyle = col;
      ctx.fillRect(x, y - h, 10, h);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x, y - h, 10, 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + 4, y - h + 4, 2, 2);
    }
  }
  // 매달린 전등
  for (const x of [128, 256, 384]) {
    ctx.fillStyle = "#3a1e26";
    ctx.fillRect(x, 0, 1, 20);
    ctx.fillStyle = "#ffcf5a";
    ctx.fillRect(x - 5, 20, 11, 5);
    ctx.fillStyle = "rgba(255,207,90,0.1)";
    ctx.fillRect(x - 18, 25, 37, 30);
  }
  // 컨베이어 받침 (띠는 렌더러가 그린다)
  ctx.fillStyle = "#3a1e26";
  ctx.fillRect(0, 222, WORLD_W, 18);
  return c;
}

/** 바람의 탑: 맑은 하늘과 구름, 아치 창문의 흰 탑 벽, 풍차 날개(렌더러가 돌림) */
function tower() {
  const { c, ctx } = canvas();
  const r = rng(13);
  bands(ctx, ["#5aa7e8", "#6db4ee", "#82c1f2", "#98cdf5", "#b0daf8"]);
  // 구름
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(r() * WORLD_W);
    const y = 20 + Math.floor(r() * 150);
    for (let k = 0; k < 4; k++) pixelCircle(ctx, x + k * 9, y - (k % 2) * 4, 7, "#f4faff");
  }
  // 탑 기둥 (양쪽)
  for (const x0 of [0, WORLD_W - 96]) {
    ctx.fillStyle = "#e8eef6";
    ctx.fillRect(x0, 0, 96, WORLD_H);
    for (let y = 0; y < WORLD_H; y += 10) {
      ctx.fillStyle = "#cfd9e6";
      ctx.fillRect(x0, y, 96, 1);
      for (let x = x0 + ((y / 10) % 2 ? 0 : 12); x < x0 + 96; x += 24) ctx.fillRect(x, y, 1, 10);
    }
    // 아치 창
    for (const wy of [60, 160]) {
      ctx.fillStyle = "#6db4ee";
      ctx.fillRect(x0 + 34, wy, 28, 34);
      pixelCircle(ctx, x0 + 48, wy, 14, "#6db4ee");
      ctx.fillStyle = "#3a6fa8";
      ctx.fillRect(x0 + 32, wy + 34, 32, 3);
    }
  }
  // 깃발 줄
  for (let x = 96; x < WORLD_W - 96; x += 16) {
    ctx.fillStyle = ["#ff6b6b", "#ffd93d", "#4d96ff", "#6bcb77"][(x / 16) % 4];
    ctx.fillRect(x, 14 + Math.round(Math.sin(x / 40) * 4), 6, 6);
  }
  return c;
}

/** 별빛 미로: 짙은 우주, 성운, 별자리 선 */
function maze() {
  const { c, ctx } = canvas();
  const r = rng(29);
  bands(ctx, ["#07051a", "#0c0826", "#120c32", "#170f3c", "#1d1346"]);
  // 성운
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * WORLD_W);
    const y = Math.floor(r() * WORLD_H);
    for (let k = 0; k < 4; k++) pixelCircle(ctx, x + k * 8, y + Math.round(Math.sin(k) * 6), 18 - k * 2, ["rgba(140,80,220,0.08)", "rgba(80,160,255,0.07)"][i % 2]);
  }
  sparkleStars(ctx, r, 140, WORLD_H, ["#ffffff", "#bfe4ff", "#ffe8a0", "#d0b8ff"]);
  // 별자리 (점과 선)
  const constellations = [
    [[60, 40], [90, 60], [120, 50], [140, 80]],
    [[360, 30], [390, 50], [420, 40], [440, 70], [410, 90]],
    [[230, 170], [260, 150], [290, 175], [270, 200]],
  ];
  for (const pts of constellations) {
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= steps; k += 2) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / steps), Math.round(y0 + ((y1 - y0) * k) / steps), 1, 1);
    }
    for (const [x, y] of pts) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }
  return c;
}

/** 시계탑: 따뜻한 갈색 내부, 둥근 달 창, 톱니와 진자(렌더러가 움직임) */
function clock() {
  const { c, ctx } = canvas();
  const r = rng(31);
  bands(ctx, ["#2a1a22", "#33202a", "#3c2630", "#452c36", "#4e323c"]);
  // 나무 판자 벽
  for (let x = 0; x < WORLD_W; x += 32) {
    ctx.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,200,150,0.04)";
    ctx.fillRect(x, 0, 31, WORLD_H);
  }
  // 둥근 달 창 (스테인드글라스)
  pixelCircle(ctx, 256, 92, 46, "#1c1230");
  pixelCircle(ctx, 256, 92, 42, "#283a78");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.fillStyle = "#1c1230";
    for (let d = 0; d < 42; d++) ctx.fillRect(Math.round(256 + Math.cos(a) * d), Math.round(92 + Math.sin(a) * d), 2, 2);
  }
  pixelCircle(ctx, 256, 92, 12, "#fff3c4");
  pixelCircle(ctx, 261, 88, 10, "#283a78");
  sparkleStars(ctx, r, 10, 40, ["#ffffff"]);
  return c;
}

const BUILDERS: Record<StageTheme, () => HTMLCanvasElement> = { garden, factory, tower, maze, clock };

/** 배경을 살짝 어둡게 덮어 캐릭터·방울·발판이 또렷하게 보이게 한다 (밝은 배경일수록 진하게) */
const DIM: Record<StageTheme, number> = { garden: 0.12, factory: 0.25, tower: 0.4, maze: 0, clock: 0.15 };

export function buildBackground(theme: StageTheme) {
  const c = BUILDERS[theme]();
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = `rgba(14,10,40,${DIM[theme]})`;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export interface TileStyle {
  solid: string;
  solidHi: string;
  solidLo: string;
  plat: string;
  platHi: string;
  platLo: string;
  /** 윗면 장식: 풀(꽃)·블록 돌기·리벳 등 */
  top: "grass" | "studs" | "cloth" | "glow" | "rivets";
  accent: string;
}

export const TILE_STYLES: Record<StageTheme, TileStyle> = {
  garden: { solid: "#4a4f7a", solidHi: "#6a70a0", solidLo: "#33375a", plat: "#b98a5a", platHi: "#e0b07a", platLo: "#7a5432", top: "grass", accent: "#ff9ad6" },
  factory: { solid: "#4d96ff", solidHi: "#8ab8ff", solidLo: "#2f62b8", plat: "#ffd93d", platHi: "#fff09a", platLo: "#c49a12", top: "studs", accent: "#ff6b6b" },
  tower: { solid: "#8d9db8", solidHi: "#c6d2e4", solidLo: "#5f6f8c", plat: "#c9875a", platHi: "#eab48a", platLo: "#8a5432", top: "cloth", accent: "#ff6b6b" },
  maze: { solid: "#2c2266", solidHi: "#5848b0", solidLo: "#1a1440", plat: "#7a6cff", platHi: "#d0c8ff", platLo: "#4a3cc0", top: "glow", accent: "#ffe8a0" },
  clock: { solid: "#7a5a3a", solidHi: "#a67c52", solidLo: "#4e3622", plat: "#d9a441", platHi: "#ffd87a", platLo: "#946a1e", top: "rivets", accent: "#ffd87a" },
};

/** 지형 타일 한 장 (16×16) */
export function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "solid" | "platform", style: TileStyle, openTop: boolean, seed: number) {
  if (kind === "solid") {
    ctx.fillStyle = style.solid;
    ctx.fillRect(x, y, TILE, TILE);
    if (style.top === "studs") {
      // 장난감 블록: 색이 번갈아 바뀌는 큰 블록
      ctx.fillStyle = ["#4d96ff", "#ff6b6b", "#6bcb77", "#c77dff"][seed % 4];
      ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillRect(x + 1, y + 1, TILE - 2, 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + 1, y + TILE - 3, TILE - 2, 2);
    } else {
      // 벽돌 이음매
      ctx.fillStyle = style.solidLo;
      ctx.fillRect(x, y + 7, TILE, 1);
      ctx.fillRect(x, y + 15, TILE, 1);
      ctx.fillRect(x + (seed % 2 ? 4 : 11), y, 1, 7);
      ctx.fillRect(x + (seed % 2 ? 11 : 4), y + 8, 1, 7);
      ctx.fillStyle = style.solidHi;
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillRect(x, y + 8, TILE, 1);
      if (seed % 7 === 0) {
        ctx.fillStyle = style.accent;
        ctx.fillRect(x + 6, y + 3, 1, 1);
      }
    }
  } else {
    // 발판: 위쪽 판 + 받침
    ctx.fillStyle = style.plat;
    ctx.fillRect(x, y, TILE, 7);
    ctx.fillStyle = style.platHi;
    ctx.fillRect(x, y, TILE, 2);
    ctx.fillStyle = style.platLo;
    ctx.fillRect(x, y + 6, TILE, 2);
    ctx.fillRect(x + 7, y + 2, 1, 4);
  }
  if (!openTop) return;
  switch (style.top) {
    case "grass":
      ctx.fillStyle = "#4fb06a";
      ctx.fillRect(x, y - 1, TILE, 3);
      ctx.fillStyle = "#7ad48a";
      ctx.fillRect(x, y - 1, TILE, 1);
      ctx.fillRect(x + (seed % 5) * 3, y - 2, 1, 1);
      if (seed % 3 === 0) {
        ctx.fillStyle = style.accent;
        ctx.fillRect(x + 8, y - 2, 2, 1);
      }
      break;
    case "studs":
      ctx.fillStyle = kind === "solid" ? "rgba(255,255,255,0.45)" : style.platHi;
      ctx.fillRect(x + 3, y - 2, 3, 2);
      ctx.fillRect(x + 10, y - 2, 3, 2);
      break;
    case "cloth":
      ctx.fillStyle = seed % 2 ? "#ff6b6b" : "#ffffff";
      ctx.fillRect(x, y, TILE, 2);
      break;
    case "glow":
      ctx.fillStyle = style.platHi;
      ctx.fillRect(x, y, TILE, 1);
      if (seed % 4 === 0) {
        ctx.fillStyle = style.accent;
        ctx.fillRect(x + 7, y - 2, 1, 3);
        ctx.fillRect(x + 6, y - 1, 3, 1);
      }
      break;
    case "rivets":
      ctx.fillStyle = style.platHi;
      ctx.fillRect(x, y, TILE, 1);
      ctx.fillStyle = "#5a3a1a";
      ctx.fillRect(x + 3, y + 3, 1, 1);
      ctx.fillRect(x + 12, y + 3, 1, 1);
      break;
  }
}

export function buildTiles(level: Level, theme: StageTheme) {
  const { c, ctx } = canvas();
  const style = TILE_STYLES[theme];
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const t = tileAt(level, col, row);
      if (t === "empty") continue;
      const openTop = row > 0 && tileAt(level, col, row - 1) === "empty";
      drawTile(ctx, col * TILE, row * TILE, t, style, openTop, (col * 7 + row * 13) % 11);
    }
  }
  return c;
}
