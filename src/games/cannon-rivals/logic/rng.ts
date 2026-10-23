/**
 * 결정적 난수(mulberry32). 상태를 GameState.rng에 두므로 같은 시드·같은 입력이면 같은 전투가 재현된다.
 * 규칙(지형 생성·바람·AI 오차·아이템 지급)에만 쓰고, 폭발 파편 같은 연출은 renderer에서 Math.random()을 쓴다.
 */
export function random(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state: { rng: number }, min: number, max: number): number {
  return min + random(state) * (max - min);
}

export function randomInt(state: { rng: number }, min: number, max: number): number {
  return Math.floor(randomRange(state, min, max + 1));
}

/** 표준정규분포 (Box–Muller) */
export function gaussian(state: { rng: number }): number {
  const u = Math.max(random(state), 1e-9);
  const v = random(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function weightedPick<K extends string>(state: { rng: number }, weights: Partial<Record<K, number>>): K {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random(state) * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}
