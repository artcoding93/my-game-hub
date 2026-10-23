import type { Surface, TrackId } from "./types";

/*
 * 트랙 데이터 (자체 디자인). 모양·배치는 여기서만 바꾼다. 바꾼 뒤에는 npm run test:turbo-kart로
 * 도로가 겹치지 않는지, 지름길·장애물·상자가 도로 위에 있는지, AI 4대가 모든 난이도에서 완주하는지 확인한다.
 *
 * - points: 닫힌 코스 중심선의 제어점 (Catmull-Rom으로 부드럽게 잇는다). points[0]이 출발·결승선이고 points[1] 쪽으로 달린다.
 * - at: 출발선에서 코스를 따라 잰 위치 (0~1, 한 바퀴 비율)
 * - lateral: 도로 가운데에서 좌우 위치 (-1 = 왼쪽 끝, 1 = 오른쪽 끝, 진행 방향 기준)
 * - tier: 이 장애물이 나오는 가장 쉬운 난이도 (easy면 모든 난이도, normal이면 보통·어려움, hard면 어려움만)
 * - 지름길(shortcut): 메인 코스 위 두 지점을 잇는 정식 샛길. 체크포인트 순서는 지름길에서도 그대로 이어진다.
 */

export type Tier = "easy" | "normal" | "hard";

export interface TrackDef {
  id: TrackId;
  name: string;
  nameKo: string;
  description: string;
  world: { w: number; h: number };
  points: [number, number][];
  halfWidth: number;
  /** 도로 폭이 좁아지는 구간 (다리·협곡) */
  narrows: { from: number; to: number; halfWidth: number; kind: "bridge" | "canyon" }[];
  /** 도로 밖 감속 구간(풀·모래·눈) 폭. 그 밖은 벽(울타리·절벽) */
  shoulder: number;
  shortcut: {
    points: [number, number][];
    halfWidth: number;
    surface: Surface;
    label: string;
    /** 지름길 위 장애물 (at = 지름길 길이 비율) */
    obstacles?: { at: number; lateral: number; r: number; kind: string; tier: Tier }[];
  };
  itemRows: number[];
  obstacles: { at: number; lateral: number; r: number; kind: string; tier: Tier }[];
  movers: { at: number; r: number; kind: string; amplitude: number; period: number; tier: Tier }[];
  /** 미끄러운 구간: 길이(px)는 보통 난이도 기준, 쉬움 ×0.5, 어려움 ×1.5 */
  slippery: { at: number; length: number; surface: "sand" | "ice" }[];
  palette: {
    ground: string;
    groundDark: string;
    shoulder: string;
    road: string;
    roadEdge: string;
    curbA: string;
    curbB: string;
    wall: string;
  };
  /** 장식 (충돌 없음, 도로 밖에만 그린다) */
  decor: { kind: "tree" | "pine" | "rock" | "cactus" | "dune" | "snowTree" | "flower"; count: number }[];
  /** 장식용 호수·얼음 호수 (도로 밖) */
  lakes: { x: number; y: number; rx: number; ry: number; color: string }[];
}

export const TRACKS: Record<TrackId, TrackDef> = {
  greenValley: {
    id: "greenValley",
    name: "Green Valley",
    nameKo: "그린 밸리",
    description: "초원과 숲, 호수를 도는 넓은 코스. 긴 직선과 완만한 커브로 드리프트를 익히기 좋다.",
    world: { w: 2800, h: 1900 },
    points: [
      [700, 1560],
      [1400, 1570],
      [2100, 1540],
      [2500, 1380],
      [2620, 1050],
      [2520, 700],
      [2250, 420],
      [1850, 330],
      [1500, 420],
      [1270, 780],
      [960, 850],
      [700, 600],
      [430, 420],
      [230, 650],
      [210, 1100],
      [350, 1420],
    ],
    halfWidth: 82,
    narrows: [],
    shoulder: 46,
    // 호숫가 흙길: 커브 안쪽 오목한 구간을 가로질러 간다
    shortcut: {
      points: [
        [1500, 420],
        [1180, 400],
        [880, 430],
        [700, 600],
      ],
      halfWidth: 46,
      surface: "dirt",
      label: "호숫가 흙길",
    },
    itemRows: [0.17, 0.5, 0.79],
    obstacles: [
      { at: 0.09, lateral: 0.55, r: 18, kind: "rock", tier: "easy" },
      { at: 0.27, lateral: -0.55, r: 20, kind: "tree", tier: "easy" },
      { at: 0.42, lateral: 0.6, r: 18, kind: "rock", tier: "easy" },
      { at: 0.62, lateral: -0.5, r: 20, kind: "tree", tier: "easy" },
      { at: 0.88, lateral: 0.55, r: 18, kind: "cone", tier: "easy" },
      { at: 0.13, lateral: -0.45, r: 16, kind: "cone", tier: "normal" },
      { at: 0.33, lateral: 0.45, r: 18, kind: "rock", tier: "normal" },
      { at: 0.6, lateral: 0.5, r: 18, kind: "rock", tier: "normal" },
      { at: 0.645, lateral: -0.55, r: 20, kind: "tree", tier: "normal" },
      { at: 0.04, lateral: -0.6, r: 16, kind: "cone", tier: "hard" },
      { at: 0.22, lateral: 0.1, r: 16, kind: "cone", tier: "hard" },
      { at: 0.38, lateral: -0.35, r: 18, kind: "rock", tier: "hard" },
      { at: 0.44, lateral: -0.3, r: 18, kind: "rock", tier: "hard" },
      { at: 0.94, lateral: -0.4, r: 16, kind: "cone", tier: "hard" },
    ],
    movers: [
      { at: 0.31, r: 15, kind: "log", amplitude: 0.7, period: 3.2, tier: "normal" },
      { at: 0.84, r: 15, kind: "log", amplitude: 0.7, period: 3.6, tier: "normal" },
      { at: 0.6, r: 15, kind: "log", amplitude: 0.7, period: 2.8, tier: "hard" },
      { at: 0.97, r: 15, kind: "log", amplitude: 0.6, period: 3, tier: "hard" },
    ],
    slippery: [{ at: 0.47, length: 160, surface: "sand" }],
    palette: {
      ground: "#4ade80",
      groundDark: "#22c55e",
      shoulder: "#86efac",
      road: "#52525b",
      roadEdge: "#f4f4f5",
      curbA: "#ef4444",
      curbB: "#fafafa",
      wall: "#166534",
    },
    decor: [
      { kind: "tree", count: 70 },
      { kind: "flower", count: 60 },
      { kind: "rock", count: 12 },
    ],
    lakes: [
      { x: 1600, y: 1000, rx: 520, ry: 240, color: "#38bdf8" },
      { x: 1050, y: 1180, rx: 160, ry: 110, color: "#38bdf8" },
    ],
  },

  desertCanyon: {
    id: "desertCanyon",
    name: "Desert Canyon",
    nameKo: "데저트 캐니언",
    description: "연속 S자 커브와 좁은 다리가 있는 협곡 코스. 코너링 실력과 위험한 지름길 선택이 승부를 가른다.",
    world: { w: 2900, h: 2100 },
    points: [
      [520, 1820],
      [1200, 1860],
      [1850, 1800],
      [2400, 1820],
      [2700, 1560],
      [2560, 1250],
      [2150, 1180],
      [1850, 960],
      [2150, 740],
      [2560, 660],
      [2640, 360],
      [2250, 200],
      [1650, 240],
      [1200, 330],
      [900, 560],
      [1180, 800],
      [1150, 1050],
      [800, 1120],
      [480, 1080],
      [300, 1350],
    ],
    halfWidth: 74,
    narrows: [
      { from: 0.05, to: 0.13, halfWidth: 50, kind: "bridge" },
      { from: 0.6, to: 0.66, halfWidth: 56, kind: "canyon" },
    ],
    shoulder: 40,
    // 절벽 끝 좁은 바위길: S자 두 개를 건너뛰지만 폭이 좁고 바위가 있다
    shortcut: {
      points: [
        [2560, 1250],
        [2690, 1060],
        [2700, 860],
        [2560, 660],
      ],
      halfWidth: 34,
      surface: "road",
      label: "절벽 바위길",
      obstacles: [{ at: 0.5, lateral: 0.55, r: 15, kind: "rock", tier: "easy" }],
    },
    itemRows: [0.2, 0.47, 0.77],
    obstacles: [
      { at: 0.17, lateral: 0.55, r: 20, kind: "rock", tier: "easy" },
      { at: 0.28, lateral: -0.5, r: 18, kind: "cactus", tier: "easy" },
      { at: 0.43, lateral: 0.55, r: 20, kind: "rock", tier: "easy" },
      { at: 0.55, lateral: -0.55, r: 18, kind: "cactus", tier: "easy" },
      { at: 0.86, lateral: 0.5, r: 20, kind: "rock", tier: "easy" },
      { at: 0.24, lateral: -0.45, r: 18, kind: "sandpile", tier: "normal" },
      { at: 0.37, lateral: 0.3, r: 18, kind: "rock", tier: "normal" },
      { at: 0.71, lateral: -0.45, r: 18, kind: "sandpile", tier: "normal" },
      { at: 0.02, lateral: 0.55, r: 16, kind: "rock", tier: "hard" },
      { at: 0.27, lateral: 0.45, r: 18, kind: "rock", tier: "hard" },
      { at: 0.53, lateral: 0.35, r: 18, kind: "sandpile", tier: "hard" },
      { at: 0.69, lateral: 0.5, r: 16, kind: "cactus", tier: "hard" },
      { at: 0.81, lateral: -0.3, r: 18, kind: "rock", tier: "hard" },
    ],
    movers: [
      { at: 0.35, r: 15, kind: "tumbleweed", amplitude: 0.75, period: 3, tier: "normal" },
      { at: 0.75, r: 15, kind: "tumbleweed", amplitude: 0.75, period: 3.4, tier: "normal" },
      { at: 0.53, r: 16, kind: "boulder", amplitude: 0.7, period: 4, tier: "hard" },
      { at: 0.89, r: 16, kind: "boulder", amplitude: 0.7, period: 3.6, tier: "hard" },
    ],
    slippery: [
      { at: 0.4, length: 180, surface: "sand" },
      { at: 0.83, length: 160, surface: "sand" },
    ],
    palette: {
      ground: "#fbbf24",
      groundDark: "#d97706",
      shoulder: "#fcd34d",
      road: "#78716c",
      roadEdge: "#fef3c7",
      curbA: "#ea580c",
      curbB: "#fff7ed",
      wall: "#92400e",
    },
    decor: [
      { kind: "cactus", count: 45 },
      { kind: "dune", count: 30 },
      { kind: "rock", count: 40 },
    ],
    lakes: [{ x: 1560, y: 1460, rx: 260, ry: 120, color: "#0ea5e9" }],
  },

  frostCircuit: {
    id: "frostCircuit",
    name: "Frost Circuit",
    nameKo: "프로스트 서킷",
    description: "헤어핀 커브가 이어지는 설원 코스. 얼음 노면에서 미끄러지지 않도록 드리프트로 공략한다.",
    world: { w: 2900, h: 2100 },
    points: [
      [560, 1800],
      [1450, 1830],
      [2250, 1790],
      [2620, 1580],
      [2450, 1330],
      [1900, 1300],
      [1450, 1270],
      [1300, 1120],
      [1500, 980],
      [2100, 980],
      [2560, 900],
      [2660, 620],
      [2380, 400],
      [1900, 380],
      [1450, 280],
      [1000, 300],
      [700, 520],
      [1080, 800],
      [720, 1080],
      [380, 1150],
      [300, 1480],
    ],
    halfWidth: 76,
    narrows: [],
    shoulder: 44,
    // 얼어붙은 호수를 가로지르는 얼음길: 헤어핀 하나를 건너뛰지만 얼음 위라 드리프트가 필요하다
    shortcut: {
      points: [
        [700, 520],
        [630, 700],
        [640, 900],
        [720, 1080],
      ],
      halfWidth: 44,
      surface: "ice",
      label: "얼음 호수 지름길",
    },
    itemRows: [0.16, 0.48, 0.75],
    obstacles: [
      { at: 0.1, lateral: 0.55, r: 18, kind: "snowman", tier: "easy" },
      { at: 0.29, lateral: -0.5, r: 18, kind: "iceblock", tier: "easy" },
      { at: 0.44, lateral: 0.55, r: 18, kind: "snowman", tier: "easy" },
      { at: 0.6, lateral: -0.55, r: 18, kind: "iceblock", tier: "easy" },
      { at: 0.92, lateral: 0.5, r: 18, kind: "snowman", tier: "easy" },
      { at: 0.06, lateral: -0.5, r: 16, kind: "iceblock", tier: "normal" },
      { at: 0.35, lateral: 0.4, r: 18, kind: "snowman", tier: "normal" },
      { at: 0.53, lateral: -0.4, r: 16, kind: "iceblock", tier: "normal" },
      { at: 0.81, lateral: 0.45, r: 18, kind: "snowman", tier: "normal" },
      { at: 0.2, lateral: 0.45, r: 16, kind: "iceblock", tier: "hard" },
      { at: 0.39, lateral: -0.35, r: 18, kind: "snowman", tier: "hard" },
      { at: 0.66, lateral: 0.4, r: 16, kind: "iceblock", tier: "hard" },
      { at: 0.71, lateral: -0.4, r: 18, kind: "snowman", tier: "hard" },
      { at: 0.95, lateral: -0.45, r: 16, kind: "iceblock", tier: "hard" },
    ],
    movers: [
      { at: 0.24, r: 15, kind: "iceSlide", amplitude: 0.75, period: 3.2, tier: "normal" },
      { at: 0.84, r: 15, kind: "iceSlide", amplitude: 0.75, period: 3.8, tier: "normal" },
      { at: 0.57, r: 15, kind: "iceSlide", amplitude: 0.7, period: 3, tier: "hard" },
      { at: 0.03, r: 15, kind: "iceSlide", amplitude: 0.65, period: 3.4, tier: "hard" },
    ],
    slippery: [
      { at: 0.33, length: 200, surface: "ice" },
      { at: 0.64, length: 220, surface: "ice" },
    ],
    palette: {
      ground: "#e2e8f0",
      groundDark: "#cbd5e1",
      shoulder: "#f8fafc",
      road: "#475569",
      roadEdge: "#e0f2fe",
      curbA: "#2563eb",
      curbB: "#f8fafc",
      wall: "#64748b",
    },
    decor: [
      { kind: "pine", count: 55 },
      { kind: "snowTree", count: 35 },
      { kind: "rock", count: 15 },
    ],
    lakes: [{ x: 640, y: 800, rx: 120, ry: 250, color: "#bae6fd" }],
  },
};
