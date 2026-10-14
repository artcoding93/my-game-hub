import type { MetadataRoute } from "next";
import { getAllGames, getGamePath } from "@/lib/games";
import { siteConfig } from "@/lib/site";

const STATIC_PAGES: { path: string; priority: number }[] = [
  { path: "/about", priority: 0.5 },
  { path: "/contact", priority: 0.3 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const gameEntries = getAllGames()
    .filter((game) => game.status === "available")
    .map((game) => ({
      url: `${siteConfig.url}${getGamePath(game.slug)}`,
      lastModified: game.releasedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));

  const staticEntries = STATIC_PAGES.map(({ path, priority }) => ({
    url: `${siteConfig.url}${path}`,
    changeFrequency: "yearly" as const,
    priority,
  }));

  return [
    { url: siteConfig.url, changeFrequency: "weekly", priority: 1 },
    ...gameEntries,
    ...staticEntries,
  ];
}
