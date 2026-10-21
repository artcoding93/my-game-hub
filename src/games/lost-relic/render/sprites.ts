/*
 * Lost Relic 픽셀아트 (자체 제작).
 * 문자 하나가 픽셀 하나이며 '.'은 투명이다. 외부 이미지 파일 없이 런타임에 텍스처로 변환하고, 화면에는 2배로 확대해 그린다.
 * 탐험가는 붉은 스카프와 챙 넓은 모자를 쓴 인물, 수호병은 빛나는 눈의 돌 병사, 석상은 태양 얼굴의 토템으로 새로 디자인했다.
 */

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

// ── 탐험가 (10×15, 오른쪽을 바라봄) ──

const EXPLORER: Palette = {
  H: "#a16207",
  h: "#713f12",
  S: "#fcd5a5",
  s: "#d6a36f",
  E: "#1c1917",
  W: "#dc2626",
  J: "#8b8b3a",
  j: "#5f5f22",
  B: "#7c2d12",
  P: "#57534e",
  b: "#292524",
};

const HEAD = ["...HHHH...", "..HHHHHH..", ".hhhhhhhhh", "..SSSSES..", "..SSSSSS..", "...sSSs..."];

export const PLAYER_FRAMES: Record<string, SpriteDef> = {
  idle: {
    art: [...HEAD, "..WWJJJJ..", ".JWWJJJJj.", ".JJjJJJjJ.", ".SJJJJJJS.", "..BBBBBB..", "..PPPPPP..", "..PP..PP..", "..PP..PP..", ".bbb..bbb."],
    palette: EXPLORER,
  },
  walk1: {
    art: [...HEAD, "..WWJJJJ..", ".JWWJJJJj.", "SJJjJJJjJ.", "..JJJJJJS.", "..BBBBBB..", "..PPPPPP..", ".PPP..PPP.", "PPP....PP.", "bb.....bbb"],
    palette: EXPLORER,
  },
  walk2: {
    art: [...HEAD, "..WWJJJJ..", ".JWWJJJJj.", ".JJjJJJjJ.", ".SJJJJJJS.", "..BBBBBB..", "..PPPPPP..", "...PPPP...", "...PPPP...", "...bbbbb.."],
    palette: EXPLORER,
  },
  jump: {
    art: [...HEAD, "S.WWJJJJ.S", "JJWWJJJJjJ", "..JjJJJjJ.", "..JJJJJJ..", "..BBBBBB..", "..PPPPPP..", ".PPP.PPP..", ".bb..PPP..", ".....bbb.."],
    palette: EXPLORER,
  },
  fall: {
    art: [...HEAD, "S.WWJJJJ.S", "JJWWJJJJjJ", "..JjJJJjJ.", "..JJJJJJ..", "..BBBBBB..", "..PPPPPP..", ".PP...PP..", ".PP...PP..", "bbb...bbb."],
    palette: EXPLORER,
  },
  interact: {
    art: [...HEAD, "..WWJJJJ..", ".JWWJJJJJS", ".JJjJJJJJS", ".SJJJJJ...", "..BBBBBB..", "..PPPPPP..", "..PP..PP..", ".PP...PP..", ".bb...bbb."],
    palette: EXPLORER,
  },
  // 사다리: 뒷모습, 팔과 다리를 번갈아 올린다.
  climb1: {
    art: ["...HHHH...", "..HHHHHH..", ".hhhhhhhh.", "S.HHHHHH..", "S..ssss...", "J..WWWW...", "JJJWWWWJJ.", ".JjJJJJjJS", ".JJJJJJJ.S", "..JJJJJJ..", "..BBBBBB..", "..PPPPPP..", "..PP..PP..", "..PP..bb..", ".bbb......"],
    palette: EXPLORER,
  },
  climb2: {
    art: ["...HHHH...", "..HHHHHH..", ".hhhhhhhh.", "..HHHHHH.S", "...ssss..S", "...WWWW..J", ".JJWWWWJJJ", "SJjJJJJjJ.", "S.JJJJJJJ.", "..JJJJJJ..", "..BBBBBB..", "..PPPPPP..", "..PP..PP..", "..bb..PP..", "......bbb."],
    palette: EXPLORER,
  },
  hurt: {
    art: [".....HHHH.", "....HHHHHH", "...hhhhhhh", "..SSSESS..", "..SSSSSS..", "S..sSSs..S", "J.WWJJJJ.J", "JJWWJJJJjJ", "..JjJJJjJ.", "..JJJJJJ..", "..BBBBBB..", "..PPPPPP..", ".PP...PP..", "PP.....PP.", "bb.....bb."],
    palette: EXPLORER,
  },
};

// ── 상자 (12×9) ──

const CHEST: Palette = { o: "#3f1d0b", w: "#92400e", W: "#b45309", g: "#facc15", G: "#a16207", k: "#1c1917" };

export const CHEST_CLOSED: SpriteDef = {
  art: [
    "............",
    "..oooooooo..",
    ".owWWWWWWwo.",
    ".owWWggWWwo.",
    "oGGGGkkGGGGo",
    "owwwwggwwwwo",
    "owWWWWWWWWwo",
    "owWWWWWWWWwo",
    "oGGGGGGGGGGo",
  ],
  palette: CHEST,
};

export const CHEST_HALF: SpriteDef = {
  art: [
    "..oooooooo..",
    ".owWWWWWWwo.",
    "oGGGGGGGGGGo",
    "oy........yo",
    "oGGGGkkGGGGo",
    "owwwwggwwwwo",
    "owWWWWWWWWwo",
    "owWWWWWWWWwo",
    "oGGGGGGGGGGo",
  ],
  palette: { ...CHEST, y: "#fef08a" },
};

export const CHEST_OPEN: SpriteDef = {
  art: [
    ".oooooooooo.",
    ".owWWWWWWwo.",
    ".oGGGGGGGGo.",
    "oo........oo",
    "okyyyyyyyyko",
    "owwwwwwwwwwo",
    "owWWWWWWWWwo",
    "owWWWWWWWWwo",
    "oGGGGGGGGGGo",
  ],
  palette: { ...CHEST, y: "#3f1d0b" },
};

/** 봉인 상자: 사슬과 푸른 문양 */
export const CHEST_SEALED: SpriteDef = {
  art: [
    "............",
    "..oooooooo..",
    ".owWWcWWWwo.",
    ".owWcCcWWwo.",
    "ossssCCsssso",
    "owwwcCcwwwwo",
    "owWWWcWWWWwo",
    "osssssssssso",
    "oGGGGGGGGGGo",
  ],
  palette: { ...CHEST, s: "#94a3b8", c: "#38bdf8", C: "#e0f2fe" },
};

// ── 환경 오브젝트 ──

export const JAR: SpriteDef = {
  art: ["..oooo..", "...oo...", "..oOOo..", ".oOOOOo.", "oOrOOrOo", "oOOOOOOo", "oOrrrrOo", ".oOOOOo.", "..oooo.."],
  palette: { o: "#7c2d12", O: "#c2410c", r: "#fdba74" },
};

export const JAR_EMPTY: SpriteDef = {
  art: ["........", "..o..o..", "..oOOo..", ".oOOOOo.", "oOrOOrOo", "oOOOOOOo", "oOrrrrOo", ".oOOOOo.", "..oooo.."],
  palette: { o: "#57301a", O: "#8a4a2a", r: "#b07850" },
};

export const TABLET: SpriteDef = {
  art: [
    "..gggggg..",
    ".gGGGGGGg.",
    "gGGyGGyGGg",
    "gGyyGGyyGg",
    "gGGGGGGGGg",
    "gGyGyyGyGg",
    "gGGGGGGGGg",
    "gGyyGyyGGg",
    "gGGGGGGGGg",
    "gGGyGGyGGg",
    "gGGGGGGGGg",
    "dddddddddd",
  ],
  palette: { g: "#44403c", G: "#78716c", y: "#fbbf24", d: "#292524" },
};

function doorArt(metal: string, light: string, dark: string): SpriteDef {
  const art: string[] = [];
  for (let y = 0; y < 30; y++) {
    if (y === 0 || y === 29) art.push("dddddddddd");
    else if (y === 3 || y === 26) art.push("dMMMMMMMMd");
    else if (y === 14) art.push("dwwwMMwwwd");
    else if (y === 15) art.push("dwwwkkwwwd");
    else if (y === 16) art.push("dwwwwkwwwd");
    else art.push(y % 6 === 0 ? "dWwwWwwWwd" : "dwwwwwwwwd");
  }
  return { art, palette: { d: dark, M: metal, w: "#5b3417", W: "#7a4a24", k: "#0c0a09", L: light } };
}

export const DOOR_BRONZE = doorArt("#c2703d", "#f0a868", "#2a1608");
export const DOOR_SILVER = doorArt("#cbd5e1", "#f8fafc", "#1e293b");

export const EXIT_DOOR: SpriteDef = (() => {
  const art: string[] = [];
  for (let y = 0; y < 30; y++) {
    if (y < 2) art.push("ssssssssss");
    else if (y >= 10 && y <= 15) {
      const sun = ["ssSyyyySss", "sSyYYYYySs", "sSyYooYySs", "sSyYooYySs", "sSyYYYYySs", "ssSyyyySss"][y - 10];
      art.push(sun);
    } else art.push(y % 7 === 0 ? "sssssSssss" : "sSSSSsSSSs");
  }
  return { art, palette: { s: "#292524", S: "#57534e", y: "#a16207", Y: "#facc15", o: "#22d3ee" } };
})();

export const HATCH_SLAB: SpriteDef = {
  art: ["gGGGGGGGGg", "gGGgGGGGGg", "gGGGgGGGGg", "gGGGGgGGGg", "gGGGGGGgGg", "gGGGGGGGgg", "gGGGGGGGGg", "gGGGGGGGGg", "ggggggggg.", "dddddddddd"],
  palette: { g: "#57534e", G: "#8a8580", d: "#1c1917" },
};

export const HATCH_GRATE: SpriteDef = {
  art: ["iiiiiiiiii", "i.i.ii.i.i", "iiiiiiiiii", "i.i.ii.i.i", "iiiiiiiiii", "i.i.ii.i.i", "iiiiiiiiii", "i.i.ii.i.i", "iiiiiiiiii", "IIIIIIIIII"],
  palette: { i: "#64748b", I: "#334155" },
};

export const STONE_GATE: SpriteDef = {
  art: ["SSSSSSSSSS", "SsssssssSS", "SsyyyyysSS", "SsyYYYysSS", "SsyyyyysSS", "SssssssssS", "SSSSSSSSSS", "SsSsSsSsSs", "SSSSSSSSSS", "dddddddddd"],
  palette: { S: "#57534e", s: "#78716c", y: "#a16207", Y: "#fde047", d: "#1c1917" },
};

export const CRACKED_WALL: SpriteDef = (() => {
  const art = [
    "gGGGGgGGGG",
    "gGGGGgGkGG",
    "gGGGGgGkGG",
    "ggggggkggg",
    "GGgGGkGGgG",
    "GGgGkGGGgG",
    "GGgkGGGGgG",
    "gggkgggggg",
    "gGGGkGgGGG",
    "gGGGGkgGGG",
    "gGGGGkgGGG",
    "ggggggkggg",
    "GGgGGGkGgG",
    "GGgGGkGGgG",
    "GGgGkGGGgG",
    "ggggkggggg",
    "gGGkGGgGGG",
    "gGkGGGgGGG",
    "gGkGGGgGGG",
    "gggkgggggg",
    "GGgGkGGGgG",
    "GGgGGkGGgG",
    "GGgGGkGGgG",
    "ggggggkggg",
    "gGGGGGkGGG",
    "gGGGGkGgGG",
    "gGGGGkGgGG",
    "gggggkgggg",
    "GGgGGGGGgG",
    "gggggggggg",
  ];
  return { art, palette: { g: "#3f3a36", G: "#6b6560", k: "#0c0a09" } };
})();

export const RUBBLE: SpriteDef = {
  art: ["....gG....", "..gGGgG...", ".gGGgGGgG.", "gGgGGGgGGg"],
  palette: { g: "#3f3a36", G: "#6b6560" },
};

export const LOOSE_BRICK: SpriteDef = {
  art: ["..........", "..........", "gggggggg..", "gGGGGGGGg.", "gGyGGGGGg.", "gGGGGGGGg.", "ggggggggg.", "..........", "..........", ".........."],
  palette: { g: "#44403c", G: "#8a8580", y: "#fde68a" },
};

export const BRICK_HOLE: SpriteDef = {
  art: ["..........", "..........", "kkkkkkkk..", "kKKKKKKKk.", "kKKKKKKKk.", "kKKKKKKKk.", "kkkkkkkkk.", "..........", "..........", ".........."],
  palette: { k: "#0c0a09", K: "#1c1917" },
};

/** 태양 얼굴 토템 석상 (9×18) */
export const STATUE: SpriteDef = {
  art: [
    "...yyy...",
    "..yYYYy..",
    ".yYgggYy.",
    "yYgGGGgYy",
    "yYgEGEgYy",
    "yYgGGGgYy",
    ".yYgmgYy.",
    "..ygggy..",
    "..gGGGg..",
    ".gGGGGGg.",
    ".gGgGgGg.",
    ".gGGGGGg.",
    ".gGgGgGg.",
    ".gGGGGGg.",
    ".gGGGGGg.",
    "ggggggggg",
    "gGGGGGGGg",
    "ddddddddd",
  ],
  palette: { y: "#a16207", Y: "#eab308", g: "#57534e", G: "#8a8580", E: "#22d3ee", m: "#1c1917", d: "#1c1917" },
};

export const PLATE: SpriteDef = {
  art: [".gggggggg.", "gGcGGGGcGg", "dddddddddd"],
  palette: { g: "#57534e", G: "#78716c", c: "#38bdf8", d: "#1c1917" },
};

export const PLATE_ON: SpriteDef = {
  art: [".yyyyyyyy.", "yYcYYYYcYy", "dddddddddd"],
  palette: { y: "#a16207", Y: "#facc15", c: "#e0f2fe", d: "#1c1917" },
};

export const ALTAR: SpriteDef = {
  art: [
    "..pppppppppp..",
    ".pPPPPPPPPPPp.",
    "pppppppppppppp",
    "...sSSSSSSs...",
    "...sSyyyySs...",
    "...sSySSySs...",
    "...sSyyyySs...",
    "...sSSSSSSs...",
    "...sSSSSSSs...",
    "..ssssssssss..",
    ".sSSSSSSSSSSs.",
    "dddddddddddddd",
  ],
  palette: { p: "#7e22ce", P: "#c084fc", s: "#44403c", S: "#78716c", y: "#facc15", d: "#1c1917" },
};

export const COIN_FRAMES: SpriteDef[] = [
  { art: [".yyyy.", "yYYYYy", "yYooYy", "yYooYy", "yYYYYy", ".yyyy."], palette: { y: "#b45309", Y: "#fbbf24", o: "#fef3c7" } },
  { art: ["..yy..", ".yYYy.", ".yoYy.", ".yoYy.", ".yYYy.", "..yy.."], palette: { y: "#b45309", Y: "#fbbf24", o: "#fef3c7" } },
  { art: ["..y...", "..Y...", "..o...", "..o...", "..Y...", "..y..."], palette: { y: "#b45309", Y: "#fbbf24", o: "#fef3c7" } },
];

// ── 함정 ──

export const SPIKES: SpriteDef = {
  art: ["..w....w..", ".wW...wW..", ".wW..wWW..", "wWWw.wWWw.", "wWWwwWWWww", "dddddddddd"],
  palette: { w: "#a8a29e", W: "#e7e5e4", d: "#44403c" },
};

export const SPIKE_HOLES: SpriteDef = {
  art: ["..........", "..........", "..........", "..........", ".k..k..k..", "dddddddddd"],
  palette: { k: "#0c0a09", d: "#44403c" },
};

export const CRUMBLE: SpriteDef = {
  art: ["gGGGgGGGGg", "gGkGGGgGGg", "ggGkGGkGgg", "dgggkggggd", "..dddddd.."],
  palette: { g: "#57534e", G: "#8a8580", k: "#1c1917", d: "#292524" },
};

/** 천장에서 내려오는 돌 블록 (15×14) */
export const CRUSHER: SpriteDef = {
  art: [
    "ggggggggggggggg",
    "gGGGGGGGGGGGGGg",
    "gGsssssssssssGg",
    "gGsGGGGGGGGGsGg",
    "gGsGrrGGGrrGsGg",
    "gGsGrRGGGRrGsGg",
    "gGsGGGGGGGGGsGg",
    "gGsGGgggggGGsGg",
    "gGsGgGGGGGgGsGg",
    "gGsssssssssssGg",
    "gGGGGGGGGGGGGGg",
    "ggggggggggggggg",
    "w.w.w.w.w.w.w.w",
    "W.W.W.W.W.W.W.W",
  ],
  palette: { g: "#3f3a36", G: "#78716c", s: "#57534e", r: "#7f1d1d", R: "#ef4444", w: "#a8a29e", W: "#e7e5e4" },
};

export const ROCK: SpriteDef = {
  art: ["..ggg..", ".gGGGg.", "gGGgGGg", "gGGGGGg", "gGgGGgg", ".gGGGg.", "..ggg.."],
  palette: { g: "#44403c", G: "#8a8580" },
};

// ── 적 ──

export const SNAKE_FRAMES: SpriteDef[] = [
  {
    art: ["......ggg.", ".....gGGEg", "g...gGGGGr", "GgggGGg...", ".GGGGg...."],
    palette: { g: "#166534", G: "#4ade80", E: "#fde047", r: "#ef4444" },
  },
  {
    art: ["......ggg.", "g....gGGEg", "Gg..gGGGG.", ".GggGGg..r", "..GGGg...."],
    palette: { g: "#166534", G: "#4ade80", E: "#fde047", r: "#ef4444" },
  },
];

export const BAT_FRAMES: SpriteDef[] = [
  { art: ["p.......p", "pp.ppp.pp", "ppPPrPPpp", ".pPPPPPp.", "...p.p..."], palette: { p: "#4c1d95", P: "#7c3aed", r: "#f43f5e" } },
  { art: [".........", "...ppp...", ".ppPrPpp.", "ppPPPPPpp", "p..p.p..p"], palette: { p: "#4c1d95", P: "#7c3aed", r: "#f43f5e" } },
];

/** 고대 수호병: 빛나는 눈의 돌 병사와 돌창 (12×18, 오른쪽을 바라봄) */
const GUARD: Palette = { g: "#2a2522", G: "#9a8f84", L: "#d4a72c", e: "#f97316", E: "#fde047", s: "#b45309", S: "#fde047" };
const GUARD_TOP = [
  "...gggg....S",
  "..gGGGGg...S",
  "..gGGEeg...s",
  "..gGGGGg...s",
  "...gGGg....s",
  ".ggLLLLgg..s",
  "gGGLGGLGGggs",
  "gGgLLLLgGG.s",
  "gGgGGGGg...s",
  ".ggGGGGg...s",
  "..gLLLLg...s",
  "..gGGGGg....",
];

export const GUARDIAN_FRAMES: SpriteDef[] = [
  { art: [...GUARD_TOP, "..gG..Gg....", "..gG..Gg....", "..gG..Gg....", ".ggG..Ggg...", ".gGG..GGg...", ".ggg..ggg..."], palette: GUARD },
  { art: [...GUARD_TOP, "..gGGGGg....", "...gGGg.....", "...gGGg.....", "...gGGg.....", "..ggGGgg....", "..gggggg...."], palette: GUARD },
];

export const ALERT_MARK: SpriteDef = {
  art: [".rr.", ".rr.", ".rr.", ".rr.", "....", ".rr."],
  palette: { r: "#ef4444" },
};

/** 작은 반짝임 입자 */
export const SPARK: SpriteDef = { art: [".w.", "wWw", ".w."], palette: { w: "#fde68a", W: "#ffffff" } };
export const DUST: SpriteDef = { art: ["dd", "dd"], palette: { d: "#a8a29e" } };
export const FLAME_FRAMES: SpriteDef[] = [
  { art: ["..y..", ".yY..", ".yYy.", "oyYyo", "oYWYo", ".oYo.", "..o.."], palette: { y: "#facc15", Y: "#fde68a", W: "#ffffff", o: "#ea580c" } },
  { art: ["...y.", "..Yy.", ".yYy.", "oyYyo", "oYWYo", ".oYo.", "..o.."], palette: { y: "#facc15", Y: "#fde68a", W: "#ffffff", o: "#ea580c" } },
  { art: [".y...", ".yY..", ".yYy.", "oyYYo", "oYWYo", ".oYo.", "..o.."], palette: { y: "#facc15", Y: "#fde68a", W: "#ffffff", o: "#ea580c" } },
];
