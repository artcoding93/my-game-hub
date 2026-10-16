import { GAME_CONFIG } from "../config";
import type { CurvePath, EnemyKind, Vec } from "../types";

/*
 * 적의 비행 경로(3차 베지어 곡선).
 * 진입·급강하 곡선은 이 게임을 위해 새로 설계한 것으로, 특정 원작의 경로를 옮긴 것이 아니다.
 */

const { width: W, height: H } = GAME_CONFIG;

export function bezier(a: Vec, b: Vec, c: Vec, d: Vec, u: number): Vec {
  const v = 1 - u;
  const k0 = v * v * v;
  const k1 = 3 * v * v * u;
  const k2 = 3 * v * u * u;
  const k3 = u * u * u;
  return {
    x: k0 * a.x + k1 * b.x + k2 * c.x + k3 * d.x,
    y: k0 * a.y + k1 * b.y + k2 * c.y + k3 * d.y,
  };
}

export function easedProgress(path: CurvePath): number {
  const u = Math.min(1, path.elapsed / path.duration);
  return path.ease === "out" ? 1 - (1 - u) * (1 - u) : u;
}

/** 진입 방식. 웨이브·그룹마다 돌아가며 쓴다. */
export const ENTRY_STYLES = ["arc", "weave", "hook", "drop"] as const;
export type EntryStyle = (typeof ENTRY_STYLES)[number];

/**
 * 화면 밖에서 편대 자리(slot)까지의 진입 경로. side가 -1이면 왼쪽에서, 1이면 오른쪽에서 들어온다.
 * 끝점은 null로 두어 흔들리는 편대 자리를 실시간으로 따라가게 한다.
 * 플레이어와 겹치지 않도록 진입 곡선은 화면 아래쪽 1/3까지 내려가지 않는다.
 */
export function entryPath(style: EntryStyle, slot: Vec, side: -1 | 1, duration: number): CurvePath {
  // 왼쪽 기준으로 정의하고 오른쪽은 좌우 반전한다.
  const mx = (x: number) => (side < 0 ? x : W - x);
  const base = { to: null, duration, elapsed: 0, ease: "out" as const };
  switch (style) {
    case "arc":
      // 옆에서 낮게 들어와 반대편으로 크게 휘었다가 위로 올라가 자리 잡기
      return { ...base, from: { x: mx(-16), y: 170 }, c1: { x: mx(W * 0.9), y: 205 }, c2: { x: slot.x, y: slot.y + 90 } };
    case "weave":
      // 위에서 내려오며 좌우로 한 번 크게 흔들기
      return { ...base, from: { x: mx(W * 0.3), y: -16 }, c1: { x: mx(W * 1.05), y: 120 }, c2: { x: mx(-W * 0.05), y: slot.y + 70 } };
    case "hook":
      // 화면 위쪽을 가로지른 뒤 아래로 꺾였다가 갈고리처럼 올라오기
      return { ...base, from: { x: mx(-16), y: 18 }, c1: { x: mx(W * 0.7), y: 0 }, c2: { x: mx(W * 0.45), y: 200 } };
    case "drop":
    default:
      // 자리 바로 위에서 S자로 떨어지기
      return {
        ...base,
        from: { x: slot.x + side * 30, y: -16 },
        c1: { x: slot.x - side * 55, y: 140 },
        c2: { x: slot.x + side * 45, y: slot.y + 55 },
      };
  }
}

/** 보스 진입: 화면 위 중앙에서 천천히 내려온다. */
export function bossEntryPath(slot: Vec, duration: number): CurvePath {
  return {
    from: { x: W / 2, y: -30 },
    c1: { x: W / 2, y: 40 },
    c2: { x: slot.x, y: slot.y + 30 },
    to: null,
    duration,
    elapsed: 0,
    ease: "out",
  };
}

/**
 * 급강하 경로. 편대에서 바깥쪽으로 살짝 빠졌다가 플레이어 위치(targetX)를 향해 휘어 내려가고,
 * 화면 아래로 빠져나간다. 유형마다 곡선 모양과 속도가 다르다.
 */
export function divePath(kind: EnemyKind, from: Vec, targetX: number, duration: number): CurvePath {
  const side = from.x < W / 2 ? -1 : 1;
  const tx = Math.min(Math.max(targetX, 16), W - 16);
  // 화면 아래로 빠져나가는 지점이 옆으로 너무 멀어지지 않게 한다.
  const exitX = (x: number) => Math.min(Math.max(x, -30), W + 30);
  const base = { from: { ...from }, duration, elapsed: 0, ease: "linear" as const };
  switch (kind) {
    case "interceptor":
      // 빠르게 튀어나가 플레이어 쪽으로 꺾은 뒤 바닥 근처에서 옆으로 휘두르는 갈고리
      return {
        ...base,
        c1: { x: from.x + side * 64, y: from.y + 26 },
        c2: { x: tx + side * 20, y: H * 0.5 },
        to: { x: exitX(tx - side * 100), y: H + 20 },
      };
    case "sentinel":
      // 느리게 거의 수직으로 내려오며 여러 번 사격
      return {
        ...base,
        c1: { x: from.x, y: from.y + 70 },
        c2: { x: tx, y: H * 0.4 },
        to: { x: tx + side * 24, y: H + 20 },
      };
    case "scout":
    default:
      // 살짝 떠올랐다가 완만한 곡선으로 내려가기
      return {
        ...base,
        c1: { x: from.x + side * 36, y: from.y - 18 },
        c2: { x: tx - side * 70, y: H * 0.62 },
        to: { x: tx + side * 30, y: H + 20 },
      };
  }
}

/** 화면 아래로 빠져나간 적이 위에서 다시 나타나 편대 자리로 돌아가는 경로 */
export function returnPath(slot: Vec, duration: number): CurvePath {
  return {
    from: { x: slot.x, y: -20 },
    c1: { x: slot.x, y: 20 },
    c2: { x: slot.x, y: slot.y - 30 },
    to: null,
    duration,
    elapsed: 0,
    ease: "out",
  };
}
