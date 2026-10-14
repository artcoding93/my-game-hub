/**
 * 게임 메타데이터 타입.
 * 새 게임을 추가할 때는 `GAME_SLUGS`에 slug를 먼저 추가하면
 * 데이터(`games.ts`)와 컴포넌트 레지스트리(`src/games/registry.tsx`)에서
 * 누락된 항목이 타입 에러로 드러난다.
 */
export const GAME_SLUGS = ["snake-classic"] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export type GameCategory = "arcade" | "puzzle" | "action" | "casual";

export type GameStatus = "available" | "coming-soon";

export interface GameControl {
  /** 예: "← ↑ → ↓", "스와이프", "Space" */
  input: string;
  /** 해당 입력이 하는 동작 */
  action: string;
}

export interface GameMeta {
  slug: GameSlug;
  title: string;
  /** 카드에 표시되는 한 줄 소개 */
  summary: string;
  /** SEO meta description (권장 120~160자) */
  description: string;
  keywords: string[];
  /** 게임 페이지 "게임 소개" 본문 (문단 단위) */
  about: string[];
  /** 게임 페이지 "게임 규칙" 목록 */
  rules: string[];
  /** 게임 페이지 "공략 팁" 목록 (선택) */
  tips?: string[];
  category: GameCategory;
  status: GameStatus;
  /** `public/` 기준 경로. 예: `/games/snake-classic/thumbnail.svg` */
  thumbnail: string;
  /** 게임 캔버스 가로:세로 비율 (CSS aspect-ratio 값) */
  aspectRatio: string;
  controls: {
    keyboard: GameControl[];
    touch: GameControl[];
  };
  /** ISO 날짜 (YYYY-MM-DD) */
  releasedAt: string;
}
