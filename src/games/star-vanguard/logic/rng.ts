/**
 * 결정적 난수(mulberry32). 상태를 GameState.rng에 두므로 같은 시드와 같은 입력이면
 * 항상 같은 게임이 재현된다(규칙 테스트용). 렌더링 연출용 난수와는 별개다.
 */
export function random(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 가중치 표에서 하나를 고른다. */
export function weightedPick<K extends string>(state: { rng: number }, weights: Partial<Record<K, number>>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random(state) * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}
