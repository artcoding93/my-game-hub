/**
 * localStorage 안전 래퍼.
 * 시크릿 모드·저장소 차단·SSR 환경에서는 접근 자체가 예외를 던질 수 있으므로
 * 실패 시 조용히 기본값을 쓰고 게임은 계속 동작하게 한다.
 */
export function readStoredNumber(key: string, fallback = 0): number {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // 저장 실패는 무시한다 (최고 점수만 유지되지 않음).
  }
}
