import type { MetadataRoute } from "next";
import { getAllGames, getGamePath } from "@/lib/games";
import { absoluteUrl, SITE_URL } from "@/lib/site";

/**
 * 홈·게임 외 공개 페이지. 새 공개 페이지를 만들면 여기에 추가한다.
 * (404 등 색인 대상이 아닌 페이지는 넣지 않는다.)
 */
const PUBLIC_PAGES: { path: `/${string}`; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }[] = [
  { path: "/about", changeFrequency: "yearly", priority: 0.5 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

/**
 * /sitemap.xml
 * 모든 URL은 공식 도메인(https://www.artcoding-game.app)으로 통일한다.
 * 게임 페이지는 src/data/games.ts에서 공개(available) 상태인 게임만 자동으로 포함된다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pageEntries = PUBLIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency,
    priority,
  }));

  const gameEntries = getAllGames()
    .filter((game) => game.status === "available")
    .map((game) => ({
      url: absoluteUrl(getGamePath(game.slug)),
      lastModified: game.releasedAt,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));

  // 홈은 페이지의 canonical 출력("https://www.artcoding-game.app", 끝에 / 없음)과 똑같이 맞춘다.
  const home = { url: SITE_URL, changeFrequency: "weekly" as const, priority: 1 };
  return [home, ...gameEntries, ...pageEntries];
}
