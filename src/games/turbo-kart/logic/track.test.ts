import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DIFFICULTY, ITEM_FX, KART, RACE } from "../config";
import { TRACKS } from "../tracks";
import { DIFFICULTIES, TRACK_IDS } from "../types";
import { createRace } from "./game";
import { buildTrack, deltaS, layoutFor, pointAt, roadAt, surfaceAt } from "./track";

const all = TRACK_IDS.map((id) => buildTrack(id));

describe("트랙 3종", () => {
  test("모두 닫힌 순환 코스이고 모양(길이·굽은 정도)이 서로 다르다", () => {
    const signature = all.map((t) => {
      const first = t.main[0];
      const last = t.main[t.main.length - 1];
      assert.ok(Math.hypot(first.x - last.x, first.y - last.y) < 12, `${t.def.id} 닫힘`);
      let turning = 0;
      for (let i = 0; i < t.main.length; i += 4) {
        const a = t.main[i];
        const b = t.main[(i + 4) % t.main.length];
        turning += Math.abs(Math.atan2(a.tx * b.ty - a.ty * b.tx, a.tx * b.tx + a.ty * b.ty));
      }
      return { length: Math.round(t.length), turning };
    });
    assert.equal(new Set(signature.map((s) => s.length)).size, 3);
    // Frost(헤어핀) > Desert(S자) > Green(완만) 순으로 많이 꺾인다
    assert.ok(signature[2].turning > signature[1].turning && signature[1].turning > signature[0].turning, JSON.stringify(signature));
  });

  test("도로가 자기 자신과 겹치지 않는다 (벽 사이 여유)", () => {
    for (const t of all) {
      for (let i = 0; i < t.main.length; i += 3) {
        for (let j = i + 3; j < t.main.length; j += 3) {
          const a = t.main[i];
          const b = t.main[j];
          if (Math.abs(deltaS(a.s, b.s, t.length)) < 500) continue;
          const gap = Math.hypot(a.x - b.x, a.y - b.y) - (a.half + a.shoulder + b.half + b.shoulder);
          assert.ok(gap > 20, `${t.def.id}: (${Math.round(a.x)},${Math.round(a.y)})`);
        }
      }
    }
  });

  test("도로 폭은 카트 4대가 겨룰 수 있을 만큼 넓다 (좁은 다리·협곡도 카트 3대 폭 이상)", () => {
    for (const t of all) for (const p of t.main) assert.ok(p.half * 2 >= KART.radius * 2 * 3.5, `${t.def.id} ${p.half}`);
  });

  test("출발선·체크포인트 12개, 출발 격자 4칸이 모두 도로 위", () => {
    for (const t of all) {
      assert.equal(t.checkpoints.length, RACE.checkpoints);
      assert.equal(t.checkpoints[0], 0);
      const race = createRace({ track: t.def.id, difficulty: "normal", seed: 1 });
      for (const k of race.state.karts) {
        const road = roadAt(t, k.x, k.y)!;
        assert.ok(road.d < road.half - KART.radius, `${t.def.id} ${k.id}`);
      }
    }
  });

  test("정식 지름길: 메인 코스 두 지점을 잇고, 건너뛰는 구간보다 짧다", () => {
    for (const t of all) {
      const skipped = (t.shortcutTo - t.shortcutFrom + t.length) % t.length;
      const length = (t.shortcut.length - 1) * 8;
      assert.ok(length < skipped * 0.9, `${t.def.id}: ${length} vs ${skipped}`);
      for (const end of [t.shortcut[0], t.shortcut[t.shortcut.length - 1]]) {
        const road = roadAt(t, end.x, end.y)!;
        assert.ok(road.d <= road.half, "입구·출구가 메인 도로와 이어진다");
      }
      // 지름길 위 진행 거리는 입구 → 출구로 고르게 늘어난다
      for (let i = 1; i < t.shortcut.length; i++) assert.ok(deltaS(t.shortcut[i - 1].s, t.shortcut[i].s, t.length) >= 0);
    }
  });

  test("미끄러운 노면: Green 모래, Desert 모래, Frost 얼음 (지름길 노면 포함)", () => {
    assert.equal(TRACKS.greenValley.shortcut.surface, "dirt");
    assert.equal(TRACKS.frostCircuit.shortcut.surface, "ice");
    for (const t of all) {
      for (const zone of t.def.slippery) {
        const p = pointAt(t, zone.at * t.length);
        assert.equal(surfaceAt(t, roadAt(t, p.x, p.y), "normal"), zone.surface);
      }
    }
  });
});

describe("난이도별 배치 (AI 물리는 같고 장애물·아이템만 다르다)", () => {
  for (const t of all) {
    test(`${t.def.id}: 정적 장애물 쉬움 4~6 · 보통 8~10 · 어려움 12~15, 움직이는 장애물 0 · 1~2 · 3~4`, () => {
      const ranges = { easy: [4, 6, 0, 0], normal: [8, 10, 1, 2], hard: [12, 15, 3, 4] } as const;
      for (const d of DIFFICULTIES) {
        const { obstacles, movers } = layoutFor(t, d);
        const [lo, hi, mlo, mhi] = ranges[d];
        assert.ok(obstacles.length >= lo && obstacles.length <= hi, `${d}: ${obstacles.length}`);
        assert.ok(movers.length >= mlo && movers.length <= mhi, `${d}: ${movers.length}`);
      }
    });

    test(`${t.def.id}: 아이템 상자 구간 3곳, 상자 수 쉬움 > 보통 > 어려움, 미끄러운 구간 쉬움 < 보통 < 어려움`, () => {
      assert.equal(t.def.itemRows.length, 3);
      const boxes = DIFFICULTIES.map((d) => layoutFor(t, d).boxes.length);
      assert.ok(boxes[0] > boxes[1] && boxes[1] > boxes[2], boxes.join(","));
      const scale = DIFFICULTIES.map((d) => DIFFICULTY[d].slipperyScale);
      assert.ok(scale[0] < scale[1] && scale[1] < scale[2]);
      for (const box of layoutFor(t, "easy").boxes) {
        const road = roadAt(t, box.x, box.y)!;
        assert.ok(road.d < road.half, "상자는 도로 위");
      }
    });

    test(`${t.def.id}: 어려움에서도 코스 모든 곳에 카트가 지나갈 빈 폭이 있다`, () => {
      const { obstacles } = layoutFor(t, "hard");
      for (let s = 0; s < t.length; s += 16) {
        const c = pointAt(t, s);
        const road = roadAt(t, c.x, c.y)!;
        const lim = road.limit - KART.radius;
        let run = 0;
        let best = 0;
        for (let l = -lim; l <= lim; l += 2) {
          const x = c.x - c.ty * l;
          const y = c.y + c.tx * l;
          run = obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + KART.radius + 4) ? 0 : run + 2;
          best = Math.max(best, run);
        }
        assert.ok(best >= 60, `${t.def.id} s=${Math.round(s)}: ${best}`);
      }
    });

    test(`${t.def.id}: 장애물이 지름길 입구·출구, 아이템 상자 줄, 출발선에 붙어 있지 않다`, () => {
      for (const o of [...t.def.obstacles, ...t.def.movers]) {
        const s = o.at * t.length;
        for (const j of [t.shortcutFrom, t.shortcutTo]) assert.ok(Math.abs(deltaS(s, j, t.length)) > 150, `${o.kind}@${o.at} 분기점`);
        for (const r of t.def.itemRows) assert.ok(Math.abs(deltaS(s, r * t.length, t.length)) > 100, `${o.kind}@${o.at} 상자 줄`);
        assert.ok(Math.abs(deltaS(s, 0, t.length)) > 120, `${o.kind}@${o.at} 출발선`);
      }
      assert.ok(ITEM_FX.boxRespawn > 0);
    });
  }
});
