import { bossCycle, bossHp, difficulty, GAME_CONFIG } from "../config";
import type { CurvePath, Enemy, EnemyKind } from "../types";
import { bossEntryPath, ENTRY_STYLES, entryPath } from "./paths";
import { random } from "./rng";

/*
 * 웨이브 구성. 5웨이브를 한 회차로 보고, 1~4번째는 일반 편대, 5번째는 Command Core 보스전이다.
 * 6웨이브부터는 같은 틀을 변형(유형 강화·방어형 추가·진입 방식 변경)해 반복한다.
 */

export interface RowSpec {
  kind: EnemyKind;
  count: number;
}

const { width: W, formation, entry } = GAME_CONFIG;

const TEMPLATES: RowSpec[][] = [
  // Wave 1: 기본 드론만, 조작 익히기
  [
    { kind: "scout", count: 6 },
    { kind: "scout", count: 8 },
  ],
  // Wave 2: Interceptor 등장
  [
    { kind: "interceptor", count: 4 },
    { kind: "scout", count: 8 },
    { kind: "scout", count: 8 },
  ],
  // Wave 3: Armored Sentinel 등장
  [
    { kind: "sentinel", count: 4 },
    { kind: "interceptor", count: 6 },
    { kind: "scout", count: 8 },
  ],
  // Wave 4: 복합 편대
  [
    { kind: "sentinel", count: 4 },
    { kind: "interceptor", count: 6 },
    { kind: "scout", count: 8 },
    { kind: "scout", count: 8 },
  ],
];

function bossEscortRows(cycle: number): RowSpec[] {
  if (cycle <= 1) {
    return [
      { kind: "sentinel", count: 2 },
      { kind: "scout", count: 6 },
    ];
  }
  if (cycle === 2) {
    return [
      { kind: "sentinel", count: 4 },
      { kind: "interceptor", count: 6 },
    ];
  }
  return [
    { kind: "sentinel", count: 4 },
    { kind: "interceptor", count: 6 },
    { kind: "scout", count: 8 },
  ];
}

export function isBossWave(wave: number) {
  return wave % 5 === 0;
}

/** 웨이브의 행 구성 (보스는 포함하지 않는다) */
export function waveRows(wave: number, rand: () => number): RowSpec[] {
  const cycle = bossCycle(wave);
  if (isBossWave(wave)) return bossEscortRows(cycle);

  let rows = TEMPLATES[(wave - 1) % 5].map((row) => ({ ...row }));
  if (cycle >= 2) {
    // 회차가 오를수록 기본 드론 행 일부가 Interceptor로 바뀌고, 맨 위에 Sentinel 행이 붙는다.
    const upgradeChance = Math.min(0.25 * (cycle - 1), 0.5);
    rows = rows.map((row) => (row.kind === "scout" && rand() < upgradeChance ? { ...row, kind: "interceptor" } : row));
    if (rows.length < 4) rows.unshift({ kind: "sentinel", count: Math.min(2 * (cycle - 1), 4) });
  }
  return rows;
}

const columnGap = (kind: EnemyKind) => (kind === "sentinel" ? 26 : formation.columnGap);

/** 웨이브의 모든 적을 만든다. 처음에는 모두 화면 밖에서 진입 순서를 기다린다(waiting). */
export function buildWave(state: { rng: number; nextId: number; time: number }, wave: number): Enemy[] {
  const rand = () => random(state);
  const speed = difficulty(wave).speed;
  const boss = isBossWave(wave);
  const rows = waveRows(wave, rand);
  const enemies: Enemy[] = [];
  const start = state.time + entry.startDelay;
  // 진입 방식은 웨이브마다 시작점이 달라진다.
  const styleOffset = wave + Math.floor(rand() * ENTRY_STYLES.length);

  const make = (kind: EnemyKind, slot: { x: number; y: number }, column: number, spawnAt: number, path: CurvePath): Enemy => {
    const hp = kind === "core" ? bossHp(wave) : GAME_CONFIG.enemies[kind].hp;
    return {
      id: state.nextId++,
      kind,
      hp,
      maxHp: hp,
      slot,
      column,
      x: path.from.x,
      y: path.from.y,
      mode: "waiting",
      spawnAt,
      path,
      pendingShots: [],
      hitAt: -Infinity,
      nextFireAt: 0,
      pattern: 0,
    };
  };

  let top: number = formation.top;
  let groupStart = start;
  if (boss) {
    const slot = { x: W / 2, y: 40 };
    enemies.push(make("core", slot, 0, start, bossEntryPath(slot, 2.6 / speed)));
    top = 70;
    groupStart += 1.2;
  }

  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * formation.rowGap;
    const gap = columnGap(row.kind);
    const slots = Array.from({ length: row.count }, (_, i) => ({ x: W / 2 + (i - (row.count - 1) / 2) * gap, y }));

    // 6대 이상인 행은 좌우 절반으로 나눠 양쪽에서 동시에 들어온다. 그 외에는 한쪽에서 들어온다.
    const halves: { side: -1 | 1; members: number[] }[] =
      row.count >= 6
        ? [
            { side: -1, members: slots.map((_, i) => i).filter((i) => i < row.count / 2) },
            { side: 1, members: slots.map((_, i) => i).filter((i) => i >= row.count / 2).reverse() },
          ]
        : [{ side: rowIndex % 2 === 0 ? -1 : 1, members: slots.map((_, i) => i) }];

    halves.forEach((half, halfIndex) => {
      const style = ENTRY_STYLES[(styleOffset + rowIndex + halfIndex * 2) % ENTRY_STYLES.length];
      half.members.forEach((column, order) => {
        const duration = (entry.duration + (rand() - 0.5) * 2 * entry.durationJitter) / speed;
        const spawnAt = groupStart + order * entry.memberGap + rand() * 0.08;
        const slot = slots[column];
        enemies.push(make(row.kind, slot, column, spawnAt, entryPath(style, slot, half.side, duration)));
      });
    });
    groupStart += entry.groupGap;
  });

  return enemies;
}
