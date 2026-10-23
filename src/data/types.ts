/**
 * 게임 메타데이터 타입.
 * 새 게임을 추가할 때는 `GAME_SLUGS`에 slug를 먼저 추가하면
 * 데이터(`games.ts`)와 컴포넌트 레지스트리(`src/games/registry.tsx`)에서
 * 누락된 항목이 타입 에러로 드러난다.
 */
export const GAME_SLUGS = ["snake-classic", "gold-escape", "star-vanguard", "lost-relic", "winter-blocks", "cannon-rivals", "turbo-kart"] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export type GameCategory = "arcade" | "puzzle" | "action" | "adventure" | "casual";

export type GameStatus = "available" | "coming-soon";

export interface GameControl {
  /** 예: "← ↑ → ↓", "스와이프", "Space" */
  input: string;
  /** 해당 입력이 하는 동작 */
  action: string;
}

export interface GameMeta {
  slug: GameSlug;
  /**
   * 예전·짧은 주소용 slug. `/games/<alias>`로 들어오면 `/games/<slug>`로 영구 리디렉션(308)한다.
   * (없는 주소는 404 + noindex가 되어 검색엔진이 색인하지 않으므로, 외부에 알려진 주소는 여기에 등록한다.)
   */
  aliases?: string[];
  title: string;
  /**
   * 검색 결과 제목을 직접 지정할 때만 쓴다. 사이트 이름은 쓰지 않는다(" | {사이트 이름}"이 자동으로 붙는다).
   * 없으면 "{title} - 무료 온라인 {장르} 게임 | {사이트 이름}" 형식으로 만든다.
   */
  seoTitle?: string;
  /** 카드에 표시되는 한 줄 소개 */
  summary: string;
  /** SEO meta description (권장 120~160자) */
  description: string;
  keywords: string[];
  /** 게임 페이지 "게임 소개" 본문 (문단 단위) */
  about: string[];
  /** 게임 페이지 "주요 특징" 목록 (짧은 문장 3~4개) */
  features: string[];
  /** 게임 페이지 "게임 목표" 문단 (승리·클리어 조건 또는 무엇을 노리는 게임인지) */
  goal: string;
  /** 게임 페이지 "게임 규칙" 목록 (점수와 난이도는 아래 별도 항목에 쓴다) */
  rules: string[];
  /** 게임 페이지 "점수 획득 방식" 목록 (실제 config 값과 일치해야 한다) */
  scoring: string[];
  /** 게임 페이지 난이도·스테이지 항목 */
  difficulty: {
    /** 섹션 제목. 예: "스테이지와 난이도", "6단계 난이도" */
    title: string;
    items: string[];
  };
  /** 게임 페이지 "공략 팁" 목록 (선택) */
  tips?: string[];
  /**
   * 게임별 추가 설명 섹션 (선택). 예: 전장 소개, 아이템 설명, AI 난이도.
   * 게임 규칙 뒤·공략 팁 앞에 제목(h2)과 항목(이름 + 설명) 목록으로 HTML 텍스트로 나온다.
   */
  sections?: { id: string; title: string; intro?: string; items: { name: string; body: string }[] }[];
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
  /**
   * 게임이나 페이지 설명을 크게 고친 날 (YYYY-MM-DD, 선택). sitemap lastmod로 알려 검색엔진이 다시 크롤링하게 한다.
   * 없으면 releasedAt을 쓴다. 실제로 내용이 바뀐 날만 적는다(매번 바꾸면 검색엔진이 lastmod를 신뢰하지 않는다).
   */
  updatedAt?: string;
}
