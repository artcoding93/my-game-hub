/*
 * Star Vanguard 픽셀아트 (자체 제작).
 * 문자 하나가 픽셀 하나이며 '.'은 투명이다. 외부 이미지 파일 없이 런타임에 텍스처로 변환한다.
 * 적은 모두 곤충형이 아닌 기하학적 드론(마름모·화살촉·육각형·팔각형)으로 디자인했다.
 */

import type { EnemyKind, PowerUpKind } from "../types";

export type PixelArt = readonly string[];
export type Palette = Record<string, string>;

export interface SpriteDef {
  art: PixelArt;
  palette: Palette;
}

/** 모든 행의 길이가 같은지 확인한다(그림 오타 방지). */
export function assertPixelArt(name: string, art: PixelArt) {
  const width = art[0]?.length ?? 0;
  for (const row of art) {
    if (row.length !== width) throw new Error(`Pixel art "${name}" has rows of different widths`);
  }
}

// ── 플레이어: 날렵한 삼각형 계열 요격기 "Vanguard" ──
export const PLAYER: SpriteDef = {
  art: [
    ".......W.......",
    ".......W.......",
    "......WCW......",
    "......CCC......",
    ".....BCWCB.....",
    ".....BCCCB.....",
    "....BBBCBBB....",
    "...PBBBCBBBP...",
    "..PPbBBBBBbPP..",
    ".PPb.BBBBB.bPP.",
    "PPb..BbBbB..bPP",
    "Pb...Bb.bB...bP",
    "P....O...O....P",
  ],
  palette: { W: "#f0f9ff", C: "#67e8f9", B: "#3b82f6", b: "#1e3a8a", P: "#a855f7", O: "#fb923c" },
};

// ── 적 ──
const SCOUT: SpriteDef = {
  // 마름모 몸체와 십자 코어
  art: [
    ".....B.....",
    "....BbB....",
    "...BbcbB...",
    "..Bbc.cbB..",
    ".Bbc.W.cbB.",
    "BbcWWWWWcbB",
    ".Bbc.W.cbB.",
    "..Bbc.cbB..",
    "...BbcbB...",
    "....BbB....",
    ".....B.....",
  ],
  palette: { B: "#38bdf8", b: "#0c4a6e", c: "#22d3ee", W: "#e0f2fe" },
};

const INTERCEPTOR: SpriteDef = {
  // 아래(플레이어 쪽)를 향한 화살촉
  art: [
    "M...........M",
    "Mm.........mM",
    ".Mm.......mM.",
    ".MMm.....mMM.",
    "..MMmpppmMM..",
    "..MMpWWWpMM..",
    "...MpWWWpM...",
    "....MpppM....",
    ".....MmM.....",
    "......M......",
  ],
  palette: { M: "#d946ef", m: "#701a75", p: "#a78bfa", W: "#fdf4ff" },
};

const SENTINEL: SpriteDef = {
  // 두꺼운 장갑판을 두른 육각형 포대
  art: [
    "....OOOOOOO....",
    "...OoooooooO...",
    "..OoOOOOOOOoO..",
    ".OoOYYYYYYYOoO.",
    "OoOYdddddddYOoO",
    "OoOYddRRRddYOoO",
    "OoOYdRRWRRdYOoO",
    "OoOYddRRRddYOoO",
    "OoOYdddddddYOoO",
    ".OoOYYYYYYYOoO.",
    "..OoOOOOOOOoO..",
    "...OoooooooO...",
    "....OdOdOdO....",
  ],
  palette: { O: "#fb923c", o: "#9a3412", Y: "#fde047", d: "#2a0f05", R: "#ef4444", W: "#fff7ed" },
};

export const ENEMY_SPRITES: Record<Exclude<EnemyKind, "core">, SpriteDef> = {
  scout: SCOUT,
  interceptor: INTERCEPTOR,
  sentinel: SENTINEL,
};

// ── Command Core (보스): 팔각형 선체 + 회전하는 고리 + 맥동하는 코어. 좌표 계산으로 그린다. ──
const BOSS_SIZE = 33;
const BOSS_C = (BOSS_SIZE - 1) / 2;

/** 팔각형 거리(중심에서 팔각형 테두리까지의 "반지름") */
function octagonRadius(dx: number, dy: number) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return Math.max(ax, ay, (ax + ay) * 0.75);
}

function generate(size: number, pick: (dx: number, dy: number) => string): PixelArt {
  const c = (size - 1) / 2;
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => pick(x - c, y - c)).join(""),
  );
}

export const BOSS_HULL: SpriteDef = {
  art: generate(BOSS_SIZE, (dx, dy) => {
    const r = octagonRadius(dx, dy);
    // 아래쪽 양옆의 포문
    if (Math.abs(Math.abs(dx) - 12) <= 1 && dy >= 8 && dy <= 13) return dy >= 12 ? "O" : "g";
    if (r > 11.5) return ".";
    if (r > 10.5) return "P";
    if (r > 9.5) return "p";
    // 선체 패널 줄무늬
    if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return "l";
    return "d";
  }),
  palette: { P: "#c084fc", p: "#6b21a8", d: "#1e1033", l: "#3b1d63", g: "#475569", O: "#fb923c" },
};

export const BOSS_RING: SpriteDef = {
  art: generate(BOSS_SIZE, (dx, dy) => {
    const r = octagonRadius(dx, dy);
    // 8방향 노드
    const angle = Math.atan2(dy, dx);
    const nearSpoke = Math.abs(Math.sin(angle * 4)) < 0.22;
    if (r >= 14 && r <= 16 && nearSpoke) return "N";
    if (r > 14.6 && r <= 15.6) return "M";
    return ".";
  }),
  palette: { M: "#e879f9", N: "#fdf4ff" },
};

export const BOSS_CORE: SpriteDef = {
  art: generate(13, (dx, dy) => {
    const d = Math.abs(dx) + Math.abs(dy);
    if (d <= 1) return "W";
    if (d <= 3) return "Y";
    if (d <= 5) return "O";
    if (d <= 6) return "o";
    return ".";
  }),
  palette: { W: "#ffffff", Y: "#fde047", O: "#fb923c", o: "#c2410c" },
};

export const BOSS_CENTER = BOSS_C;

// ── 탄환 ──
export const PLAYER_BULLET: SpriteDef = {
  art: ["WW", "CC", "CC", "CC", "BB", "BB"],
  palette: { W: "#ffffff", C: "#67e8f9", B: "#2563eb" },
};

export const ENEMY_BULLET: SpriteDef = {
  art: [".OO.", "OYYO", "OYYO", ".OO."],
  palette: { O: "#f97316", Y: "#fef08a" },
};

export const BOSS_BULLET: SpriteDef = {
  art: ["..M..", ".MWM.", "MWWWM", ".MWM.", "..M.."],
  palette: { M: "#e879f9", W: "#fdf4ff" },
};

/** 폭발 파편 (색은 파티클 tint로 입힌다) */
export const SPARK: SpriteDef = { art: ["WW", "WW"], palette: { W: "#ffffff" } };

export const FLAME: SpriteDef = {
  art: [".Y.", "YOY", ".O.", ".R."],
  palette: { Y: "#fef08a", O: "#fb923c", R: "#dc2626" },
};

// ── 파워업: 테두리 상자 + 글자 ──
const GLYPHS: Record<PowerUpKind, PixelArt> = {
  rapid: ["XXXX.", "X...X", "XXXX.", "X..X.", "X...X"],
  double: ["XXXX.", "X...X", "X...X", "X...X", "XXXX."],
  shield: [".XXXX", "X....", ".XXX.", "....X", "XXXX."],
  life: ["..X..", "..X..", "XXXXX", "..X..", "..X.."],
};

export const POWER_UP_COLORS: Record<PowerUpKind, string> = {
  rapid: "#fb923c",
  double: "#22d3ee",
  shield: "#4ade80",
  life: "#f472b6",
};

export function powerUpSprite(kind: PowerUpKind): SpriteDef {
  const glyph = GLYPHS[kind];
  const art = generate(11, (dx, dy) => {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax === 5 && ay === 5) return "."; // 둥근 모서리
    if (ax === 5 || ay === 5) return "F";
    if (ax <= 2 && ay <= 2) return glyph[dy + 2][dx + 2] === "X" ? "W" : "d";
    return "d";
  });
  return { art, palette: { F: POWER_UP_COLORS[kind], W: "#ffffff", d: "#0b1020" } };
}
