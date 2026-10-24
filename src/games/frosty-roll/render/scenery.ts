import { MAP_COLS, MAP_ROWS, TILE, WORLD_H, WORLD_W } from "../config";
import { tileAt, type Level } from "../logic/level";
import type { StageTheme } from "../stages";

/*
 * 스테이지 배경(512×256)과 지형 타일. 모두 코드로 그린 오리지널 픽셀 아트이며 처음 한 번만 그려 둔다.
 * 움직이는 부분(눈발·바람·수정 반짝임·톱니·시곗바늘)은 렌더러가 매 프레임 덧그린다.
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

/** 위에서 아래로 색 띠 (경계는 체크무늬 디더로 섞어 16비트 느낌) */
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

function pixelCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

function village() {
  const { c, ctx } = canvas();
  const r = rng(3);
  bands(ctx, ["#14204a", "#1b2a5e", "#243a76", "#30508e", "#4565a8", "#5f7dbe"]);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = r() < 0.3 ? "#fff6c8" : "#cfdcff";
    ctx.fillRect(Math.floor(r() * WORLD_W), Math.floor(r() * 120), 1, 1);
  }
  pixelCircle(ctx, 430, 46, 16, "#fff3cf");
  pixelCircle(ctx, 436, 42, 13, "#24396f");
  // 먼 언덕
  // 언덕은 밤빛으로 어둡게 (흰 북극여우·눈덩이가 배경에 묻히지 않도록)
  ctx.fillStyle = "#3a5190";
  for (let x = 0; x < WORLD_W; x++) ctx.fillRect(x, Math.floor(170 + Math.sin(x / 40) * 10 + Math.sin(x / 13) * 3), 1, WORLD_H);
  ctx.fillStyle = "#4c64a3";
  for (let x = 0; x < WORLD_W; x++) ctx.fillRect(x, Math.floor(196 + Math.sin(x / 55 + 2) * 8), 1, WORLD_H);
  // 집들 (지붕에 눈, 따뜻한 창문)
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 58 + Math.floor(r() * 14);
    const w = 30 + Math.floor(r() * 12);
    const h = 26 + Math.floor(r() * 16);
    const base = 214;
    ctx.fillStyle = "#1f2d58";
    ctx.fillRect(x, base - h, w, h);
    ctx.fillStyle = "#9fb4e0";
    for (let k = 0; k <= w / 2 + 2; k++) ctx.fillRect(x - 2 + k, base - h - k * 0.6, w + 4 - k * 2, 1);
    ctx.fillStyle = "#ffd36a";
    ctx.fillRect(x + 6, base - h + 10, 6, 6);
    if (w > 34) ctx.fillRect(x + w - 12, base - h + 10, 6, 6);
    ctx.fillStyle = "#ffa94a";
    ctx.fillRect(x + 6, base - h + 13, 6, 1);
    // 굴뚝 연기
    ctx.fillStyle = "#8091c4";
    ctx.fillRect(x + w - 8, base - h - 14, 4, 6);
  }
  // 전나무
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(r() * WORLD_W);
    const h = 18 + Math.floor(r() * 12);
    for (let k = 0; k < h; k++) {
      ctx.fillStyle = k % 6 < 2 ? "#e9f2ff" : "#1d4a58";
      const w = Math.floor((k / h) * 9);
      ctx.fillRect(x - w, 226 - h + k, w * 2 + 1, 1);
    }
  }
  return c;
}

function factory() {
  const { c, ctx } = canvas();
  bands(ctx, ["#13283a", "#17304a", "#1c3a52", "#21445c"]);
  // 벽 패널
  ctx.fillStyle = "#1a3448";
  for (let x = 0; x < WORLD_W; x += 64) ctx.fillRect(x, 0, 2, WORLD_H);
  for (let y = 0; y < WORLD_H; y += 48) ctx.fillRect(0, y, WORLD_W, 1);
  // 창문 (밖에 눈 내림)
  for (const x of [56, 248, 440]) {
    ctx.fillStyle = "#0e1d2b";
    ctx.fillRect(x - 2, 30, 36, 44);
    ctx.fillStyle = "#6fa8d8";
    ctx.fillRect(x, 32, 32, 40);
    ctx.fillStyle = "#a8d2f2";
    ctx.fillRect(x, 60, 32, 12);
    ctx.fillStyle = "#0e1d2b";
    ctx.fillRect(x + 15, 32, 2, 40);
    ctx.fillRect(x, 50, 32, 2);
  }
  // 파이프
  ctx.fillStyle = "#2f5a70";
  ctx.fillRect(0, 96, WORLD_W, 6);
  ctx.fillStyle = "#3f7088";
  ctx.fillRect(0, 96, WORLD_W, 2);
  for (let x = 30; x < WORLD_W; x += 90) {
    ctx.fillStyle = "#2a4f63";
    ctx.fillRect(x, 102, 6, 90);
  }
  // 바닥 쪽 장난감 상자
  const colors = ["#c8505a", "#4f9ad8", "#e8c24a", "#6ac08a"];
  for (let i = 0; i < 10; i++) {
    const x = 16 + i * 50;
    ctx.fillStyle = colors[i % 4];
    ctx.fillRect(x, 212, 22, 18);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillRect(x, 212, 22, 3);
    ctx.fillStyle = "#13283a";
    ctx.fillRect(x + 10, 212, 2, 18);
  }
  return c;
}

function canyon() {
  const { c, ctx } = canvas();
  const r = rng(11);
  bands(ctx, ["#8fb9e2", "#a3c7ea", "#b8d6f0", "#cfe4f6", "#e2eef9"]);
  // 구름
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(r() * WORLD_W);
    const y = 20 + Math.floor(r() * 50);
    for (let k = 0; k < 4; k++) pixelCircle(ctx, x + k * 9, y - (k % 2) * 4, 7, "#f4f9ff");
  }
  // 협곡 절벽 (먼·중간·가까운 층)
  const layers: [string, string, number, number][] = [
    ["#b7b1d6", "#a8a2cc", 120, 0.7],
    ["#9a92c4", "#8a82b6", 150, 1],
    ["#7d74ac", "#6e659c", 186, 1.3],
  ];
  layers.forEach(([color, strata, base, amp], li) => {
    for (let x = 0; x < WORLD_W; x++) {
      const edge = Math.abs(x - WORLD_W / 2) / (WORLD_W / 2);
      const h = base - (1 - edge) * 50 * amp + Math.sin(x / (17 + li * 6)) * 6;
      ctx.fillStyle = color;
      ctx.fillRect(x, Math.floor(h - edge * 70), 1, WORLD_H);
      ctx.fillStyle = strata;
      for (let y = Math.floor(h - edge * 70) + 6; y < WORLD_H; y += 11) ctx.fillRect(x, y + Math.floor(Math.sin(x / 9) * 2), 1, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, Math.floor(h - edge * 70), 1, 2);
    }
  });
  return c;
}

function cave() {
  const { c, ctx } = canvas();
  const r = rng(19);
  bands(ctx, ["#0d0a1e", "#120e28", "#181232", "#1e163e", "#241a48"]);
  // 종유석
  for (let x = 0; x < WORLD_W; x += 6 + Math.floor(r() * 10)) {
    const h = 6 + Math.floor(r() * 26);
    for (let k = 0; k < h; k++) {
      ctx.fillStyle = k > h - 3 ? "#3a2f6a" : "#2a2152";
      const w = Math.max(0, Math.floor((1 - k / h) * 3));
      ctx.fillRect(x - w, k, w * 2 + 1, 1);
    }
  }
  // 수정 군락
  const crystal = (x: number, y: number, h: number, color: string) => {
    for (let k = 0; k < h; k++) {
      const w = Math.floor(Math.min(k, h - k) / 2);
      ctx.fillStyle = color;
      ctx.fillRect(x - w, y - k, w * 2 + 1, 1);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x - w, y - k, 1, 1);
    }
  };
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(r() * WORLD_W);
    const y = 120 + Math.floor(r() * 110);
    const color = ["#5a3fd0", "#7a5cff", "#9a6cf0", "#3f8fe0"][i % 4];
    crystal(x, y, 14 + Math.floor(r() * 18), color);
    crystal(x + 7, y + 2, 9 + Math.floor(r() * 8), color);
  }
  return c;
}

function tower() {
  const { c, ctx } = canvas();
  const r = rng(23);
  ctx.fillStyle = "#2c2a40";
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // 벽돌
  for (let y = 0; y < WORLD_H; y += 8) {
    for (let x = (y / 8) % 2 ? -8 : 0; x < WORLD_W; x += 16) {
      ctx.fillStyle = r() < 0.5 ? "#34324c" : "#302e46";
      ctx.fillRect(x + 1, y + 1, 15, 7);
    }
  }
  // 아치 창 (밖은 눈 내리는 밤)
  for (const x of [40, 440]) {
    ctx.fillStyle = "#1a2450";
    ctx.fillRect(x, 50, 32, 70);
    pixelCircle(ctx, x + 16, 50, 16, "#1a2450");
    ctx.fillStyle = "#c8963c";
    ctx.fillRect(x - 2, 120, 36, 3);
  }
  // 큰 시계판 (바늘은 렌더러가 그린다)
  pixelCircle(ctx, 256, 104, 74, "#8a6a2c");
  pixelCircle(ctx, 256, 104, 70, "#c8963c");
  pixelCircle(ctx, 256, 104, 64, "#efe6cc");
  pixelCircle(ctx, 256, 104, 60, "#f6efdb");
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const len = i % 5 === 0 ? 8 : 3;
    for (let k = 0; k < len; k++) {
      ctx.fillStyle = i % 5 === 0 ? "#3a2a1a" : "#a89878";
      ctx.fillRect(Math.round(256 + Math.cos(a) * (58 - k)), Math.round(104 + Math.sin(a) * (58 - k)), 1, 1);
    }
  }
  pixelCircle(ctx, 256, 104, 4, "#3a2a1a");
  return c;
}

const BUILDERS: Record<StageTheme, () => HTMLCanvasElement> = { village, factory, canyon, cave, tower };

/** 배경을 살짝 어둡게 덮어 캐릭터·눈덩이·발판이 또렷하게 보이게 한다 (밝은 배경일수록 진하게) */
const DIM: Record<StageTheme, number> = { village: 0.2, factory: 0.15, canyon: 0.42, cave: 0, tower: 0.2 };

export function buildBackground(theme: StageTheme) {
  const c = BUILDERS[theme]();
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = `rgba(10,16,44,${DIM[theme]})`;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

interface TileStyle {
  solid: string;
  solidHi: string;
  solidLo: string;
  plat: string;
  platHi: string;
  platLo: string;
  snow: boolean;
  accent: string;
}

export const TILE_STYLES: Record<StageTheme, TileStyle> = {
  village: { solid: "#5b6b8c", solidHi: "#7d8db0", solidLo: "#3e4b68", plat: "#9a6a3a", platHi: "#c08a52", platLo: "#6a4422", snow: true, accent: "#ffffff" },
  factory: { solid: "#4f6a86", solidHi: "#7d9ab8", solidLo: "#334a62", plat: "#3a78b8", platHi: "#6aa6e0", platLo: "#22507e", snow: true, accent: "#ffd23f" },
  canyon: { solid: "#7b6fa8", solidHi: "#9d92c6", solidLo: "#5a4f86", plat: "#8fb8e0", platHi: "#c4e0f8", platLo: "#5f88b6", snow: true, accent: "#ffffff" },
  cave: { solid: "#3a2f63", solidHi: "#54468a", solidLo: "#251d44", plat: "#7a5cff", platHi: "#c6b2ff", platLo: "#4c36b0", snow: false, accent: "#9f7cff" },
  tower: { solid: "#5a5870", solidHi: "#7a7894", solidLo: "#3c3a50", plat: "#c8963c", platHi: "#f0c766", platLo: "#8a6424", snow: true, accent: "#f0c766" },
};

/** 지형 타일 한 장 (16×16) */
export function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, kind: "solid" | "platform", style: TileStyle, openTop: boolean, seed: number) {
  if (kind === "solid") {
    ctx.fillStyle = style.solid;
    ctx.fillRect(x, y, TILE, TILE);
    // 벽돌 이음매
    ctx.fillStyle = style.solidLo;
    ctx.fillRect(x, y + 7, TILE, 1);
    ctx.fillRect(x, y + 15, TILE, 1);
    ctx.fillRect(x + (seed % 2 ? 4 : 11), y, 1, 7);
    ctx.fillRect(x + (seed % 2 ? 11 : 4), y + 8, 1, 7);
    ctx.fillStyle = style.solidHi;
    ctx.fillRect(x, y, TILE, 1);
    ctx.fillRect(x, y + 8, TILE, 1);
    if (style.accent && seed % 7 === 0) {
      ctx.fillStyle = style.accent;
      ctx.fillRect(x + 6, y + 3, 1, 1);
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
    if (style === TILE_STYLES.factory) {
      ctx.fillStyle = style.accent;
      for (let k = 0; k < TILE; k += 4) ctx.fillRect(x + k, y + 4, 2, 1);
    }
  }
  if (openTop && style.snow) {
    // 눈 덮개 (가장자리가 울퉁불퉁)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y - 1, TILE, 3);
    ctx.fillStyle = "#dcecff";
    ctx.fillRect(x, y + 2, TILE, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + (seed % 5) * 3, y + 2, 2, 2);
  }
  if (openTop && !style.snow) {
    ctx.fillStyle = style.platHi;
    ctx.fillRect(x, y, TILE, 1);
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
