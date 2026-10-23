/**
 * 결정적 난수(mulberry32). 상태를 RaceState.rng에 두므로 같은 시드·같은 입력이면 같은 레이스가 재현된다.
 * 규칙(아이템 뽑기·AI 실수)에만 쓰고, 파티클 같은 연출은 renderer에서 Math.random()을 쓴다.
 */
export function random(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function weightedPick<K extends string>(state: { rng: number }, weights: Partial<Record<K, number>>): K | null {
  const entries = (Object.entries(weights) as [K, number][]).filter(([, weight]) => weight > 0);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random(state) * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}
