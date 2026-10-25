/** 시드 난수 (mulberry32). 상태는 GameState.rng 숫자 하나로 저장해 같은 시드·입력이면 같은 게임이 된다. */
export function nextRandom(state: { rng: number }): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomRange(state: { rng: number }, min: number, max: number) {
  return min + (max - min) * nextRandom(state);
}
