import { games } from "@/data/games";
import { GAME_SLUGS, type GameCategory, type GameMeta, type GameSlug } from "@/data/types";

export function getAllGames(): GameMeta[] {
  return games;
}

/** 홈 목록에 보이는 게임 (prototype 제외, coming-soon은 "준비 중" 카드로 보인다) */
export function getListedGames(): GameMeta[] {
  return games.filter((game) => game.status !== "prototype");
}

/**
 * 게임 페이지를 열 수 있는지. prototype은 Vercel Production이 아닐 때(로컬 dev·build, Preview)만 열린다.
 * VERCEL_ENV는 Vercel이 빌드·런타임에 넣는 시스템 환경 변수("production" | "preview" | "development").
 */
export function isPlayable(game: GameMeta, vercelEnv = process.env.VERCEL_ENV): boolean {
  if (game.status === "available") return true;
  return game.status === "prototype" && vercelEnv !== "production";
}

export function getGameBySlug(slug: string): GameMeta | undefined {
  return games.find((game) => game.slug === slug);
}

export function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(value);
}

export function getGamePath(slug: GameSlug): `/games/${GameSlug}` {
  return `/games/${slug}`;
}

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  arcade: "아케이드",
  puzzle: "퍼즐",
  action: "액션",
  adventure: "어드벤처",
  casual: "캐주얼",
};
