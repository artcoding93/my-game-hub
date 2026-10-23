import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FIELDS, TANK, WORLD_H, WORLD_W } from "../config";
import { FIELD_IDS } from "../types";
import { carveCrater, createValidLayout, generateLayout, supportY, validateLayout } from "./terrain";

describe("지형 파괴 (높이맵)", () => {
  test("평지에 원형 구덩이가 생긴다 (가운데가 가장 깊다)", () => {
    const terrain = new Float32Array(WORLD_W).fill(400);
    carveCrater(terrain, 480, 400, 30);
    assert.ok(Math.abs(terrain[480] - 430) < 0.6);
    assert.ok(terrain[470] > 400 && terrain[470] < terrain[480]);
    assert.equal(terrain[440], 400);
    assert.equal(terrain[520], 400);
  });

  test("원 위쪽에 남은 흙은 깎인 만큼 아래로 내려앉는다 (공중에 뜬 흙 없음)", () => {
    const terrain = new Float32Array(WORLD_W).fill(300);
    carveCrater(terrain, 480, 400, 30); // 땅속 깊은 곳 폭발
    assert.ok(Math.abs(terrain[480] - 360) < 0.6, `${terrain[480]}`);
  });

  test("바닥까지 깎이면 낭떠러지(WORLD_H)가 된다", () => {
    const terrain = new Float32Array(WORLD_W).fill(WORLD_H - 10);
    carveCrater(terrain, 300, WORLD_H - 10, 30);
    assert.equal(terrain[300], WORLD_H);
  });

  test("지지면: 궤도 아래 가장 높은 지면, 모두 사라지면 WORLD_H", () => {
    const terrain = new Float32Array(WORLD_W).fill(400);
    assert.equal(supportY(terrain, 200), 400);
    for (let x = 200 - TANK.footHalfWidth; x <= 200 + TANK.footHalfWidth; x++) terrain[x] = 450;
    terrain[200 + TANK.footHalfWidth] = 420;
    assert.equal(supportY(terrain, 200), 420);
    for (let x = 190; x <= 210; x++) terrain[x] = WORLD_H;
    assert.equal(supportY(terrain, 200), WORLD_H);
  });
});

describe("전장 3종", () => {
  const seeds = Array.from({ length: 12 }, (_, i) => i * 977 + 5);

  for (const field of FIELD_IDS) {
    test(`${field}: 탱크 아래 안정적인 지지면, 충분한 거리, 양쪽 모두 공격 가능한 탄도`, () => {
      for (const seed of seeds) {
        const layout = createValidLayout(field, { rng: seed });
        assert.ok(validateLayout(field, layout), `seed ${seed}`);
        for (const x of [layout.playerX, layout.aiX]) {
          const under = layout.terrain.slice(x - TANK.footHalfWidth, x + TANK.footHalfWidth + 1);
          assert.ok(Math.max(...under) - Math.min(...under) < 1, "평평한 발판");
          assert.ok(supportY(layout.terrain, x) < WORLD_H - 40);
        }
        assert.ok(layout.aiX - layout.playerX >= 520);
      }
    });
  }

  test("전장마다 실제 지형 모양이 다르다", () => {
    const stats = (field: (typeof FIELD_IDS)[number]) => {
      let relief = 0;
      let centerTop = 0;
      let roughness = 0;
      for (const seed of seeds) {
        const t = generateLayout(field, { rng: seed }).terrain;
        relief += Math.max(...t) - Math.min(...t);
        centerTop += Math.min(...t.slice(400, 560));
        let r = 0;
        for (let x = 2; x < WORLD_W; x++) r += Math.abs(t[x] - 2 * t[x - 1] + t[x - 2]);
        roughness += r;
      }
      return { relief: relief / seeds.length, centerTop: centerTop / seeds.length, roughness: roughness / seeds.length };
    };
    const green = stats("greenHills");
    const desert = stats("desertCanyon");
    const frozen = stats("frozenRidge");
    assert.ok(green.relief < 120, `Green Hills 고저차 ${green.relief}`);
    assert.ok(desert.centerTop < 260 && desert.centerTop < green.centerTop - 60, "Desert Canyon 가운데 높은 언덕");
    assert.ok(frozen.relief > green.relief + 60, "Frozen Ridge 고저차가 크다");
    assert.ok(frozen.roughness > green.roughness * 2, "Frozen Ridge가 더 들쭉날쭉하다");
  });

  test("전장마다 바람 범위가 다르다 (Green < Desert < Frozen)", () => {
    assert.ok(FIELDS.greenHills.windMax < FIELDS.desertCanyon.windMax);
    assert.ok(FIELDS.desertCanyon.windMax < FIELDS.frozenRidge.windMax);
    assert.ok(FIELDS.frozenRidge.windMinAbs > FIELDS.greenHills.windMinAbs);
  });
});
