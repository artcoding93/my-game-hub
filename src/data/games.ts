import type { GameMeta } from "./types";

/**
 * 사이트에 노출되는 게임 목록.
 * 메인 페이지 목록, 개별 게임 페이지, 메타데이터, sitemap이 모두 이 배열을 기준으로 생성된다.
 */
export const games: GameMeta[] = [
  {
    slug: "snake-classic",
    title: "Snake Classic",
    summary: "먹이를 먹고 꼬리를 늘려 가는 고전 스네이크 게임",
    description:
      "브라우저에서 바로 즐기는 고전 스네이크 게임. 방향키나 스와이프로 뱀을 조종해 먹이를 먹고, 벽과 자기 몸에 부딪히지 않도록 최대한 길게 살아남으세요.",
    keywords: ["스네이크 게임", "snake game", "뱀 게임", "고전 게임", "브라우저 게임", "무료 게임"],
    category: "arcade",
    status: "available",
    thumbnail: "/games/snake-classic/thumbnail.svg",
    aspectRatio: "1 / 1",
    controls: {
      keyboard: [
        { input: "← ↑ → ↓ / W A S D", action: "방향 전환 (대기 중이면 바로 시작)" },
        { input: "Enter / Space", action: "시작 · 일시정지 · 재시작" },
        { input: "P", action: "일시정지 / 재개" },
      ],
      touch: [
        { input: "스와이프", action: "방향 전환" },
        { input: "보드 탭", action: "시작 · 일시정지 · 재시작" },
        { input: "하단 버튼", action: "Start / Pause / Restart" },
      ],
    },
    releasedAt: "2026-10-14",
  },
];
