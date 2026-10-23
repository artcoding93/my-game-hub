import { AIM_LIMITS, FIELDS, TANK, WORLD_H, WORLD_W } from "../config";
import type { FieldId, Side, Tank } from "../types";
import { simulateShot, type World } from "./physics";
import { random, randomRange } from "./rng";

/*
 * 파괴 가능한 지형 (높이맵).
 * terrain[x] = 그 열의 지면 y. y ≥ terrain[x]인 곳이 땅이고, WORLD_H는 "땅 없음(낭떠러지)"이다.
 * 동굴·돌출부는 높이맵으로 표현할 수 없으므로, 첫 버전의 전장은 모두 높이맵으로 그릴 수 있는 모양만 쓴다.
 * 화면도 이 배열을 그대로 그리므로 폭발로 깎인 모양과 충돌 데이터가 항상 같다.
 */

const MIN_Y = 120;
const MAX_Y = WORLD_H - 36;

const bump = (x: number, center: number, width: number) => Math.exp(-(((x - center) / width) ** 2));
/** 0..1 부드러운 계단 (가장자리가 둥근 고원용) */
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

type Rng = { rng: number };

/** 전장별 지형 모양. 같은 전장이라도 시드마다 높낮이가 조금씩 다르다. */
function shapeFor(field: FieldId, rng: Rng): (x: number) => number {
  const p1 = randomRange(rng, 0, Math.PI * 2);
  const p2 = randomRange(rng, 0, Math.PI * 2);
  const p3 = randomRange(rng, 0, Math.PI * 2);
  switch (field) {
    case "greenHills": {
      // 낮은 고저차(약 ±45px)의 완만한 언덕
      const w1 = randomRange(rng, 520, 700);
      const w2 = randomRange(rng, 230, 320);
      const hill = randomRange(rng, 30, 55);
      return (x) => 372 + 26 * Math.sin((x / w1) * Math.PI * 2 + p1) + 14 * Math.sin((x / w2) * Math.PI * 2 + p2) - hill * bump(x, 480, 150);
    }
    case "desertCanyon": {
      // 가운데 높은 바위 언덕(메사) + 양옆 협곡
      const mesaHalf = randomRange(rng, 55, 85);
      const mesaTop = randomRange(rng, 205, 245);
      const canyon = randomRange(rng, 55, 80);
      const base = (x: number) => 392 + 10 * Math.sin((x / 180) * Math.PI * 2 + p1) + 6 * Math.sin((x / 70) * Math.PI * 2 + p2);
      return (x) => {
        const d = Math.abs(x - 480);
        const mesa = 1 - smoothstep(mesaHalf, mesaHalf + 70, d);
        const y = base(x) + canyon * (bump(x, 300, 55) + bump(x, 660, 55));
        return y * (1 - mesa) + (mesaTop + 6 * Math.sin(x / 9 + p3)) * mesa;
      };
    }
    case "frozenRidge": {
      // 들쭉날쭉한 설산: 여러 사인파 + 뾰족한 봉우리
      const peaks = [0, 1, 2].map(() => ({ x: randomRange(rng, 300, 660), h: randomRange(rng, 70, 130), w: randomRange(rng, 35, 70) }));
      return (x) => {
        let y = 345 + 42 * Math.sin((x / 410) * Math.PI * 2 + p1) + 24 * Math.sin((x / 160) * Math.PI * 2 + p2) + 9 * Math.sin((x / 47) * Math.PI * 2 + p3);
        for (const peak of peaks) y -= peak.h * Math.max(0, 1 - Math.abs(x - peak.x) / peak.w) ** 1.4;
        return y;
      };
    }
  }
}

export interface Layout {
  terrain: Float32Array;
  playerX: number;
  aiX: number;
}

/** 지형과 탱크 시작 위치를 만든다. 탱크 아래는 평평하게 다져 안정적인 지지면을 만든다. */
export function generateLayout(field: FieldId, rng: Rng): Layout {
  const config = FIELDS[field];
  const shape = shapeFor(field, rng);
  const terrain = new Float32Array(WORLD_W);
  for (let x = 0; x < WORLD_W; x++) terrain[x] = Math.min(MAX_Y, Math.max(MIN_Y, shape(x)));
  const playerX = Math.round(randomRange(rng, config.playerX[0], config.playerX[1]));
  const aiX = Math.round(randomRange(rng, config.aiX[0], config.aiX[1]));
  for (const x of [playerX, aiX]) flattenPad(terrain, x);
  return { terrain, playerX, aiX };
}

/** x 둘레를 가운데 높이로 평평하게 다지고, 가장자리는 원래 지형과 부드럽게 잇는다. */
export function flattenPad(terrain: Float32Array, cx: number) {
  const pad = TANK.padHalfWidth;
  const blend = 14;
  const level = terrain[cx];
  for (let x = cx - pad - blend; x <= cx + pad + blend; x++) {
    if (x < 0 || x >= WORLD_W) continue;
    const d = Math.abs(x - cx);
    const t = d <= pad ? 1 : 1 - (d - pad) / blend;
    terrain[x] = terrain[x] * (1 - t) + level * t;
  }
}

/** 탱크가 올라설 높이: 궤도 아래 열 중 가장 높은 지면. 모두 낭떠러지면 WORLD_H. */
export function supportY(terrain: Float32Array, x: number, halfWidth: number = TANK.footHalfWidth): number {
  let top = WORLD_H;
  for (let xi = Math.floor(x - halfWidth); xi <= Math.ceil(x + halfWidth); xi++) {
    if (xi < 0 || xi >= WORLD_W) continue;
    if (terrain[xi] < top) top = terrain[xi];
  }
  return top;
}

/**
 * 원형 폭발로 지형을 깎는다. 원과 겹치는 만큼 열의 흙을 없애고, 원 위쪽에 남은 흙은 아래로 내려앉는다
 * (높이맵은 공중에 뜬 흙을 표현할 수 없기 때문). 바닥까지 깎이면 그 열은 낭떠러지가 된다.
 * 바뀐 열 범위를 돌려준다.
 */
export function carveCrater(terrain: Float32Array, cx: number, cy: number, radius: number): { from: number; to: number } {
  const from = Math.max(0, Math.floor(cx - radius));
  const to = Math.min(WORLD_W - 1, Math.ceil(cx + radius));
  for (let x = from; x <= to; x++) {
    const dx = x + 0.5 - cx;
    if (Math.abs(dx) > radius) continue;
    const dy = Math.sqrt(radius * radius - dx * dx);
    const top = Math.max(terrain[x], cy - dy);
    const bottom = Math.min(WORLD_H, cy + dy);
    const removed = Math.max(0, bottom - top);
    if (removed > 0) terrain[x] = Math.min(WORLD_H, terrain[x] + removed);
  }
  return { from, to };
}

function tankAt(side: Side, x: number, terrain: Float32Array): Tank {
  return {
    side,
    x,
    y: supportY(terrain, x),
    vy: 0,
    falling: false,
    fallStartY: 0,
    hp: TANK.maxHp,
    angle: 45,
    power: 60,
    facing: side === "player" ? 1 : -1,
    inventory: [],
    energy: 0,
    repairsUsed: 0,
    barrier: false,
    fell: false,
  };
}

export function createTank(side: Side, x: number, terrain: Float32Array): Tank {
  return tankAt(side, x, terrain);
}

/**
 * 직접 명중 탄도가 하나라도 있는지 탐색한다(같은 물리 엔진 사용, 지형은 바꾸지 않음).
 * 찾자마자 멈추므로 대부분 수십 번 안에 끝난다.
 */
export function hasDirectHit(terrain: Float32Array, shooter: Tank, target: Tank, wind: number): boolean {
  const tanks = { [shooter.side]: shooter, [target.side]: target } as Record<Side, Tank>;
  const world: World = { terrain, wind, tanks, crate: null };
  for (let angle = 15; angle <= AIM_LIMITS.maxAngle; angle += 5) {
    for (let power = 30; power <= AIM_LIMITS.maxPower; power += 2) {
      const { impact } = simulateShot(world, shooter.side, angle, power);
      if (impact.kind === "tank" && impact.target === target.side) return true;
    }
  }
  return false;
}

/** 양쪽 탱크 모두 무풍·최대 순풍·최대 역풍에서 상대를 직접 맞힐 탄도가 있는지 검증한다. */
export function validateLayout(field: FieldId, layout: Layout): boolean {
  const { windMax } = FIELDS[field];
  const player = tankAt("player", layout.playerX, layout.terrain);
  const ai = tankAt("ai", layout.aiX, layout.terrain);
  if (player.y >= WORLD_H || ai.y >= WORLD_H) return false;
  if (layout.aiX - layout.playerX < 520) return false;
  for (const wind of [0, windMax, -windMax]) {
    if (!hasDirectHit(layout.terrain, player, ai, wind)) return false;
    if (!hasDirectHit(layout.terrain, ai, player, wind)) return false;
  }
  return true;
}

/** 검증을 통과할 때까지 지형을 다시 만든다(최대 20회). 끝내 실패하면 마지막 지형의 가운데를 낮춰 쓴다. */
export function createValidLayout(field: FieldId, rng: Rng): Layout {
  let layout = generateLayout(field, rng);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (validateLayout(field, layout)) return layout;
    layout = generateLayout(field, rng);
  }
  for (let x = 260; x < 700; x++) layout.terrain[x] = Math.max(layout.terrain[x], 330 + 20 * Math.sin(x / 40 + random(rng)));
  return layout;
}
