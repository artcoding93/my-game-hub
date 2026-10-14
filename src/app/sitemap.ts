import type { MetadataRoute } from "next";
import { getAllGames, getGamePath } from "@/lib/games";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const gameEntries = getAllGames()
    .filter((game) => game.status === "available")
    .map((game) => ({
      url: `${siteConfig.url}${getGamePath(game.slug)}`,
      lastModified: game.releasedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));

  return [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    ...gameEntries,
  ];
}
