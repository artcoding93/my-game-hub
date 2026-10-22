import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { GameCard } from "@/components/GameCard";
import { getAllGames } from "@/lib/games";
import { absoluteUrl, INDEXABLE, siteConfig, socialMetadata } from "@/lib/site";

const HOME_TITLE = `${siteConfig.name} | ${siteConfig.tagline}`;
// 게임을 추가·공개하면 이 문장의 게임 목록도 함께 고친다.
const HOME_DESCRIPTION = `${siteConfig.name}에서 Snake Classic, Gold Escape, Star Vanguard, Lost Relic, Winter Blocks 등 다양한 레트로 아케이드 게임을 무료로 즐겨보세요. PC와 모바일에서 설치 없이 바로 플레이할 수 있습니다.`;

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  robots: INDEXABLE,
  ...socialMetadata({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
};

/** 검색엔진이 사이트 이름(ArtCoding Game / ArtCoding)을 알 수 있도록 하는 schema.org WebSite 구조화 데이터. 홈에만 둔다. */
function WebSiteJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: siteConfig.alternateName,
    url: absoluteUrl("/"),
    description: HOME_DESCRIPTION,
    inLanguage: "ko",
  };
  return (
    <script
      type="application/ld+json"
      // `<`를 이스케이프해 문자열 안의 </script> 주입을 막는다.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}

const FEATURES = [
  {
    title: "설치·가입 없이 무료",
    body: "링크를 열면 바로 시작합니다. 앱 설치나 회원가입, 결제가 필요 없습니다.",
  },
  {
    title: "PC와 모바일 모두 지원",
    body: "키보드로도, 터치와 스와이프로도 플레이할 수 있도록 화면과 조작을 맞췄습니다.",
  },
  {
    title: "기록은 내 브라우저에",
    body: "최고 점수는 서버가 아닌 사용 중인 브라우저에만 저장됩니다.",
  },
] as const;

export default function Home() {
  const games = getAllGames();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 lg:py-12">
      <WebSiteJsonLd />
      <section aria-labelledby="intro-heading" className="flex flex-col gap-4">
        <h1 id="intro-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          {siteConfig.name}
          <span className="mt-2 block text-lg font-medium text-zinc-600 sm:text-xl dark:text-zinc-400">
            {siteConfig.tagline}
          </span>
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg dark:text-zinc-400">
          {siteConfig.name}({siteConfig.alternateName})은 설치나 회원가입 없이 브라우저에서 바로 즐기는 무료 온라인 게임
          사이트입니다. 고전 스네이크를 다시 만든 Snake Classic, 금괴를 모아 탈출하는 퍼즐 플랫폼 게임 Gold
          Escape, 편대를 이룬 드론과 싸우는 우주 슈팅 Star Vanguard, 상자를 열고 비밀 통로를 찾는 탐험
          어드벤처 Lost Relic, 착지한 블록 위에 혹이 생기는 겨울 블록 퍼즐 Winter Blocks까지 1980년대 감성의 레트로
          아케이드 게임을 직접 만들어 소개합니다.
        </p>
        <p className="max-w-2xl text-sm leading-6 text-zinc-500">
          모든 게임은 PC에서는 키보드로, 스마트폰과 태블릿에서는 터치로 플레이할 수 있습니다.
        </p>
        <div>
          <Link
            href="/about"
            className="text-sm font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
          >
            사이트 소개 더 보기
          </Link>
        </div>
      </section>

      <section id="games" aria-labelledby="games-heading" className="flex scroll-mt-20 flex-col gap-4">
        <h2 id="games-heading" className="text-xl font-semibold">
          전체 게임 <span className="text-zinc-500">({games.length})</span>
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game, index) => (
            <li key={game.slug} className="flex">
              <GameCard game={game} eager={index < 3} />
            </li>
          ))}
        </ul>
      </section>

      <AdSlot placement="home-middle" variant="banner" />

      <section aria-labelledby="features-heading" className="flex flex-col gap-4">
        <h2 id="features-heading" className="text-xl font-semibold">
          {siteConfig.name}의 특징
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
