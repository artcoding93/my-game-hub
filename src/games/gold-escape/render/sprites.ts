/*
 * Gold Escape 픽셀아트 (16×16, 자체 제작).
 * 문자 하나가 픽셀 하나이며, '.'은 투명이다. 같은 캐릭터 모양에 팔레트만 바꿔
 * 플레이어와 경비원을 만든다. 외부 이미지 파일 없이 런타임에 텍스처로 변환한다.
 */

export type PixelArt = readonly string[];
export type Palette = Record<string, string>;

// ── 지형 ──
export const BRICK: PixelArt = [
  "RRRRRRRmRRRRRRRm",
  "RRRRRRRmRRRRRRRm",
  "RRRRRRRmRRRRRRRm",
  "rrrrrrrmrrrrrrrm",
  "mmmmmmmmmmmmmmmm",
  "RRRmRRRRRRRmRRRR",
  "RRRmRRRRRRRmRRRR",
  "RRRmRRRRRRRmRRRR",
  "rrrmrrrrrrrmrrrr",
  "mmmmmmmmmmmmmmmm",
  "RRRRRRRmRRRRRRRm",
  "RRRRRRRmRRRRRRRm",
  "RRRRRRRmRRRRRRRm",
  "rrrrrrrmrrrrrrrm",
  "mmmmmmmmmmmmmmmm",
  "RRRmRRRRRRRmRRRR",
];
export const BRICK_PALETTE: Palette = { R: "#c2410c", r: "#7c2d12", m: "#2a1206" };

export const SOLID: PixelArt = [
  "wwwwwwwwwwwwwwws",
  "wSSSSSSSSSSSSSSs",
  "wSoSSSSSSSSSSoSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSSSSSSSSSSSSSSs",
  "wSoSSSSSSSSSSoSs",
  "wSSSSSSSSSSSSSSs",
  "ssssssssssssssss",
];
export const SOLID_PALETTE: Palette = { w: "#94a3b8", S: "#64748b", s: "#1e293b", o: "#0f172a" };

const LADDER_RAIL = "..Yy........Yy..";
const LADDER_RUNG = "..YYYYYYYYYYYY..";
const LADDER_SHADE = "..yyyyyyyyyyyy..";
export const LADDER: PixelArt = [
  LADDER_RAIL, LADDER_RUNG, LADDER_SHADE, LADDER_RAIL, LADDER_RAIL, LADDER_RAIL,
  LADDER_RUNG, LADDER_SHADE, LADDER_RAIL, LADDER_RAIL, LADDER_RAIL,
  LADDER_RUNG, LADDER_SHADE, LADDER_RAIL, LADDER_RAIL, LADDER_RAIL,
];
export const LADDER_PALETTE: Palette = { Y: "#e0b26b", y: "#8a6233" };
export const ESCAPE_LADDER_PALETTE: Palette = { Y: "#4ade80", y: "#15803d" };

export const ROPE: PixelArt = [
  "................",
  "................",
  "WwWwWwWwWwWwWwWw",
  "wWwWwWwWwWwWwWwW",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
export const ROPE_PALETTE: Palette = { W: "#e5e7eb", w: "#9ca3af" };

export const GOLD: PixelArt = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "....LLLLLLLL....",
  "...LGGGGGGGGg...",
  "..LGGGGLGGGGGg..",
  ".LGGGGGGGGGGGGg.",
  ".gGGGGGGGGGGGGg.",
  ".gggggggggggggg.",
  "................",
  "................",
];
export const GOLD_PALETTE: Palette = { L: "#fef08a", G: "#facc15", g: "#a16207" };

export const EXIT_ARROW: PixelArt = [
  ".......EE.......",
  "......EEEE......",
  ".....EEEEEE.....",
  "....EEEEEEEE....",
  "...EEEEEEEEEE...",
  ".......EE.......",
  ".......EE.......",
  ".......EE.......",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
export const EXIT_PALETTE: Palette = { E: "#4ade80" };

// ── 캐릭터 (H: 머리, E: 눈, B: 몸, L: 다리) ──
const HEAD = [
  "......HHHH......",
  ".....HHHHHH.....",
  ".....HEHHEH.....",
  ".....HHHHHH.....",
  "......HHHH......",
];
const HEAD_BACK = [
  "......HHHH......",
  ".....HHHHHH.....",
  ".....HHHHHH.....",
  ".....HHHHHH.....",
  "......HHHH......",
];

export const CHARACTER_FRAMES = {
  stand: [
    ...HEAD,
    "....BBBBBBBB....",
    "...BBBBBBBBBB...",
    "...B.BBBBBB.B...",
    "...H.BBBBBB.H...",
    "......BBBB......",
    ".....LLLLLL.....",
    ".....LL..LL.....",
    ".....LL..LL.....",
    ".....LL..LL.....",
    "....LLL..LLL....",
    "................",
  ],
  run1: [
    ...HEAD,
    "....BBBBBBB.....",
    "...BBBBBBBBBBH..",
    "..HB.BBBBBB.....",
    "......BBBB......",
    "......BBBB......",
    ".....LLLLLL.....",
    "....LL....LL....",
    "...LL......LL...",
    "..LL........L...",
    "..L.........LL..",
    "................",
  ],
  run2: [
    ...HEAD,
    ".....BBBBBB.....",
    "....BBBBBBBB....",
    "....HBBBBBBH....",
    "......BBBB......",
    "......BBBB......",
    ".....LLLLLL.....",
    "......LLLL......",
    ".....LL.LL......",
    "....LL...LL.....",
    "....LL....LL....",
    "................",
  ],
  climb: [
    "...H..HHHH......",
    "...B.HHHHHH.....",
    "...BBHHHHHH.....",
    "....BHHHHHH.....",
    "......HHHH......",
    ".....BBBBBB.....",
    ".....BBBBBBBB...",
    ".....BBBBBB.B...",
    ".....BBBBBB.H...",
    "......BBBB......",
    ".....LLLLLL.....",
    ".....LL..LL.....",
    ".....LL...LL....",
    ".....LL...LL....",
    "....LLL.........",
    "................",
  ],
  hang1: [
    "................",
    "..H..........H..",
    "..BB..HHHH..BB..",
    "...BBHHHHHHBB...",
    ".....HEHHEH.....",
    ".....HHHHHH.....",
    "......HHHH......",
    ".....BBBBBB.....",
    ".....BBBBBB.....",
    "......BBBB......",
    ".....LLLLLL.....",
    ".....LL..LL.....",
    ".....LL..LL.....",
    ".....LL..LL.....",
    "....LLL..LLL....",
    "................",
  ],
  hang2: [
    "................",
    "..H..........H..",
    "..BB..HHHH..BB..",
    "...BBHHHHHHBB...",
    ".....HEHHEH.....",
    ".....HHHHHH.....",
    "......HHHH......",
    ".....BBBBBB.....",
    ".....BBBBBB.....",
    "......BBBB......",
    ".....LLLLLL.....",
    "....LL...LL.....",
    "...LL.....LL....",
    "..LL.......L....",
    "..L........LL...",
    "................",
  ],
  fall: [
    "..H..HHHH..H....",
    "..B.HHHHHH.B....",
    "..BBHEHHEHBB....",
    "...BHHHHHHB.....",
    "......HHHH......",
    ".....BBBBBB.....",
    "....BBBBBBBB....",
    ".....BBBBBB.....",
    "......BBBB......",
    ".....LLLLLL.....",
    "....LL....LL....",
    "...LL......LL...",
    "...L........L...",
    "................",
    "................",
    "................",
  ],
  climbBack: [
    ...HEAD_BACK,
    "...H.BBBBBB.H...",
    "...BBBBBBBBBB...",
    ".....BBBBBB.....",
    ".....BBBBBB.....",
    "......BBBB......",
    ".....LLLLLL.....",
    ".....LL..LL.....",
    "....LL....LL....",
    "....LL....LL....",
    "...LLL....LLL...",
    "................",
  ],
} satisfies Record<string, PixelArt>;

export type CharacterFrame = keyof typeof CHARACTER_FRAMES;

export const PLAYER_PALETTE: Palette = { H: "#ffd9a8", E: "#0b1020", B: "#22d3ee", L: "#2563eb" };
export const GUARD_PALETTE: Palette = { H: "#fda4af", E: "#3b0764", B: "#e11d48", L: "#7e22ce" };

/** 그림 데이터가 16×16인지 개발 중에 바로 알 수 있게 검사한다. */
export function assertPixelArt(name: string, art: PixelArt, size = 16) {
  if (art.length !== size || art.some((row) => row.length !== size)) {
    throw new Error(`픽셀아트 '${name}' 크기가 ${size}×${size}가 아닙니다.`);
  }
}
