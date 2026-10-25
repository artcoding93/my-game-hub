import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BUBBLE, GRAVITY, MAP_COLS, MAP_ROWS, PLAYER, TILE } from "../config";
import { STAGES } from "../stages";
import { NO_INPUT } from "../types";
import { stepPlayerOnly } from "./game";
import { tileAt } from "./level";
import { DT, playing } from "./testUtils";

/*
 * 지도 검증: 플레이어 시작 위치에서 실제 이동·점프 물리(stepPlayerOnly)로 갈 수 있는 모든 발 디딤 위치를 넓이 우선 탐색하고,
 * 모든 발판(2칸 이상)과 적이 시작하는 발판에 갈 수 있는지 확인한다.
 * 움직이는 발판은 빼고 검사한다(움직이는 발판 없이도 모든 고정 발판에 갈 수 있어야 한다).
 */

interface Segment {
  row: number;
  c0: number;
  c1: number;
}

function surfaces(stageIndex: number): Segment[] {
  const s = playing(stageIndex);
  const out: Segment[] = [];
  for (let row = 1; row < MAP_ROWS; row++) {
    let start = -1;
    for (let col = 0; col <= MAP_COLS; col++) {
      const standable = col < MAP_COLS && tileAt(s.level, col, row) !== "empty" && tileAt(s.level, col, row - 1) === "empty";
      if (standable && start < 0) start = col;
      if (!standable && start >= 0) {
        out.push({ row, c0: start, c1: col - 1 });
        start = -1;
      }
    }
  }
  return out;
}

function explore(stageIndex: number) {
  const base = playing(stageIndex);
  const key = (x: number, y: number) => `${Math.round(x / 2)},${Math.round(y)}`;
  const start = { x: base.player.x, y: base.player.y };
  const seen = new Map<string, { x: number; y: number }>([[key(start.x, start.y), start]]);
  const queue = [start];
  const holds = [0.08, 0.2, 0.4, 0.7, 1.1];
  while (queue.length > 0) {
    const from = queue.shift()!;
    for (const move of [-1, 0, 1] as const) {
      for (const jump of [false, true]) {
        for (const hold of jump ? holds : holds.slice(1)) {
          if (!jump && move === 0) continue;
          const s = playing(stageIndex);
          s.platforms = [];
          const p = s.player;
          p.x = from.x;
          p.y = from.y;
          p.grounded = true;
          let left = false;
          for (let i = 0; i < 160; i++) {
            const t = i * DT;
            stepPlayerOnly(s, { ...NO_INPUT, move: t < hold ? move : 0, jump: jump && i === 0, jumpHeld: jump }, DT);
            if (!p.grounded) left = true;
            if (p.grounded && (left || t >= hold) && Math.abs(p.vx) < 1 && t >= hold) break;
          }
          if (!p.grounded) continue;
          const k = key(p.x, p.y);
          if (!seen.has(k)) {
            seen.set(k, { x: p.x, y: p.y });
            queue.push({ x: p.x, y: p.y });
          }
        }
      }
    }
  }
  return [...seen.values()];
}

describe("모든 발판과 적에게 갈 수 있다 (실제 점프 물리)", () => {
  for (const [i, stage] of STAGES.entries()) {
    test(stage.name, () => {
      const spots = explore(i);
      const s = playing(i);
      const w = s.player.w;
      const reached = (seg: Segment) =>
        spots.some((p) => Math.abs(p.y + s.player.h - seg.row * TILE) < 0.5 && p.x + w / 2 >= seg.c0 * TILE - 2 && p.x + w / 2 <= (seg.c1 + 1) * TILE + 2);
      const segs = surfaces(i);
      const missing = segs.filter((seg) => seg.c1 > seg.c0 && !reached(seg));
      assert.deepEqual(missing, [], `${stage.name}: 갈 수 없는 발판`);
      for (const sp of s.level.spawns) {
        if (sp.kind === "whirlwing" || sp.kind === "boss") continue;
        const seg = segs.find((g) => g.row * TILE === sp.y && sp.x >= g.c0 * TILE && sp.x <= (g.c1 + 1) * TILE);
        assert.ok(seg, `${sp.kind} 시작 위치 아래 발판 없음`);
        assert.ok(reached(seg), `${sp.kind}가 있는 발판에 갈 수 없음 (행 ${seg.row})`);
      }
    });
  }
});

describe("천장에 모인 방울에 손이 닿는다", () => {
  // 방울이 모이는 지점(gather) 바로 위 천장 아래에 머문 방울을, 어느 발판에서든 제자리·짧은 점프로 터뜨릴 수 있어야 한다
  const rise = (PLAYER.jumpVelocity * PLAYER.jumpVelocity) / (2 * GRAVITY);
  for (const [i, stage] of STAGES.entries()) {
    test(stage.name, () => {
      const spots = explore(i);
      const s = playing(i);
      for (const gx of stage.gather) {
        const col = Math.floor(gx / TILE);
        let row = 1;
        while (tileAt(s.level, col, row) === "solid") row++;
        const bubbleBottom = row * TILE + BUBBLE.captiveSize;
        const ok = spots.some((p) => Math.abs(p.x + s.player.w / 2 - gx) <= TILE * 1.5 && p.y - rise < bubbleBottom - 2);
        assert.ok(ok, `${stage.name}: 모이는 지점 x=${gx}의 방울에 닿을 수 없음`);
      }
    });
  }
});
