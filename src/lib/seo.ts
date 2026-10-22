import type { GameMeta } from "@/data/types";
import { CATEGORY_LABELS, getAllGames, getGamePath } from "@/lib/games";
import { absoluteUrl, SITE_URL, siteConfig } from "@/lib/site";

/**
 * 검색엔진용 값(색인 대상 게임, title·description·canonical, sitemap 항목)을 한곳에서 계산한다.
 * 게임 페이지(generateStaticParams·generateMetadata), sitemap.xml, 홈 description, SEO 테스트가 모두 이 모듈을 쓰므로
 * 새 게임은 src/data/games.ts에 "available"로 추가하기만 하면 페이지·메타데이터·sitemap에 함께 반영된다.
 * (React·Next.js 런타임에 의존하지 않는다: Node 테스트에서 바로 실행할 수 있어야 한다.)
 */

/** 실제로 존재하고 색인 가능한 게임. coming-soon 게임은 페이지가 404이므로 sitemap에도 넣지 않는다. */
export function getIndexableGames(): GameMeta[] {
  return getAllGames().filter((game) => game.status === "available");
}

/** 게임 내용을 마지막으로 바꾼 날. updatedAt이 없으면 출시일. sitemap lastmod와 JSON-LD dateModified에 쓴다. */
export function getGameLastModified(game: GameMeta): string {
  return game.updatedAt ?? game.releasedAt;
}

/** 게임 목록이 마지막으로 바뀐 날(가장 최근에 추가·수정된 게임 기준). 홈·소개처럼 게임 목록을 보여 주는 페이지의 lastmod. */
export function getGameListLastModified(): string {
  return getIndexableGames()
    .map(getGameLastModified)
    .reduce((latest, date) => (date > latest ? date : latest));
}

export interface GameSeo {
  /** 페이지 metadata의 title (layout 템플릿이 " | 사이트 이름"을 붙인다) */
  title: string;
  /** OG·Twitter에 쓰는 사이트 이름까지 포함한 전체 제목 (실제 <title>과 같다) */
  fullTitle: string;
  description: string;
  /** canonical 경로 (metadataBase 기준) */
  path: `/${string}`;
  /** 공식 도메인 기준 절대 URL */
  url: string;
}

export function getGameSeo(game: GameMeta): GameSeo {
  const title = game.seoTitle ?? `${game.title} - 무료 온라인 ${CATEGORY_LABELS[game.category]} 게임`;
  const path = getGamePath(game.slug);
  return {
    title,
    fullTitle: `${title} | ${siteConfig.name}`,
    description: game.description,
    path,
    url: absoluteUrl(path),
  };
}

/** 홈 meta description에 넣는 게임 이름 수. 너무 길어지지 않도록 최근 게임부터 이만큼만 쓴다. */
const HOME_DESCRIPTION_GAME_COUNT = 5;

/** 홈 meta description. 공개된 게임 목록에서 자동으로 만든다(최근 출시 순, 부제 ": ..."는 뺀다). */
export function getHomeDescription(): string {
  const names = [...getIndexableGames()]
    .sort((a, b) => (a.releasedAt === b.releasedAt ? 0 : a.releasedAt < b.releasedAt ? 1 : -1))
    .slice(0, HOME_DESCRIPTION_GAME_COUNT)
    .map((game) => game.title.split(":")[0].trim());
  return `${siteConfig.name}에서 ${names.join(", ")} 등 다양한 레트로 아케이드 게임을 무료로 즐겨보세요. PC와 모바일에서 설치 없이 바로 플레이할 수 있습니다.`;
}

type ChangeFrequency = "weekly" | "monthly" | "yearly";

/**
 * 홈·게임 외 공개 페이지. 새 공개 페이지를 만들면 여기에 추가한다(404 등 색인 대상이 아닌 페이지는 넣지 않는다).
 * listsGames: 게임 목록을 보여 주는 페이지면 true → 새 게임이 추가되면 lastmod가 함께 바뀐다.
 */
export const PUBLIC_PAGES: { path: `/${string}`; changeFrequency: ChangeFrequency; priority: number; listsGames?: boolean }[] = [
  { path: "/about", changeFrequency: "monthly", priority: 0.5, listsGames: true },
  { path: "/contact", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
];

export interface SitemapEntry {
  url: string;
  lastModified?: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

/**
 * sitemap.xml 항목. 각 페이지의 canonical URL과 똑같은 대표 URL만 넣는다.
 * 홈은 canonical 출력("https://www.artcoding-game.app", 끝에 / 없음)과 맞추기 위해 SITE_URL을 그대로 쓴다.
 */
export function getSitemapEntries(): SitemapEntry[] {
  const listLastModified = getGameListLastModified();

  const home: SitemapEntry = { url: SITE_URL, lastModified: listLastModified, changeFrequency: "weekly", priority: 1 };

  const games = getIndexableGames().map(
    (game): SitemapEntry => ({
      url: getGameSeo(game).url,
      lastModified: getGameLastModified(game),
      changeFrequency: "monthly",
      priority: 0.8,
    }),
  );

  const pages = PUBLIC_PAGES.map(
    ({ path, changeFrequency, priority, listsGames }): SitemapEntry => ({
      url: absoluteUrl(path),
      ...(listsGames ? { lastModified: listLastModified } : {}),
      changeFrequency,
      priority,
    }),
  );

  return [home, ...games, ...pages];
}
