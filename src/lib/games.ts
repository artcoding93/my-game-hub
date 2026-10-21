import { games } from "@/data/games";
import { GAME_SLUGS, type GameCategory, type GameMeta, type GameSlug } from "@/data/types";

export function getAllGames(): GameMeta[] {
  return games;
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
