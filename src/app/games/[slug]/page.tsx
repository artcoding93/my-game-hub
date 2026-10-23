import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { GameCard } from "@/components/GameCard";
import { GamePageLayout } from "@/components/GamePageLayout";
import type { GameControl, GameMeta } from "@/data/types";
import { GameLoader } from "@/games/registry";
import { CATEGORY_LABELS, getGameBySlug } from "@/lib/games";
import { getGameLastModified, getGameSeo, getIndexableGames } from "@/lib/seo";
import { absoluteUrl, INDEXABLE, siteConfig, socialMetadata } from "@/lib/site";

// Cache Components 환경에서는 `dynamicParams = false`를 쓸 수 없으므로,
// 목록에 없는 slug는 페이지에서 notFound()로 처리한다.
// 새 게임은 src/data/games.ts에 available로 추가하면 여기와 sitemap(src/lib/seo.ts)에 함께 반영된다.
export function generateStaticParams() {
  return getIndexableGames().map((game) => ({ slug: game.slug }));
}

async function getGameOrNotFound(params: Promise<{ slug: string }>): Promise<GameMeta> {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  if (!game || game.status !== "available") notFound();
  return game;
}

export async function generateMetadata({ params }: PageProps<"/games/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameBySlug(slug);
  // 준비 중인 게임은 페이지가 404이므로 색인용 메타데이터를 만들지 않는다.
  if (!game || game.status !== "available") return {};

  const { title, fullTitle, description, path } = getGameSeo(game);

  return {
    title,
    description,
    keywords: game.keywords,
    alternates: { canonical: path },
    robots: INDEXABLE,
    ...socialMetadata({
      title: fullTitle,
      description,
      path,
      images: [{ url: game.thumbnail, alt: `${game.title} 게임 화면` }],
    }),
  };
}

/** 검색엔진용 구조화 데이터 (schema.org VideoGame) */
function GameJsonLd({ game }: { game: GameMeta }) {
  const { url } = getGameSeo(game);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: game.description,
    url,
    image: absoluteUrl(game.thumbnail as `/${string}`),
    genre: CATEGORY_LABELS[game.category],
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any",
    inLanguage: "ko",
    datePublished: game.releasedAt,
    dateModified: getGameLastModified(game),
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
    isPartOf: { "@type": "WebSite", name: siteConfig.name, alternateName: siteConfig.alternateName, url: absoluteUrl("/") },
  };

  return (
    <script
      type="application/ld+json"
      // `<`를 이스케이프해 문자열 안의 </script> 주입을 막는다.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}

// 페이지 껍데기(레이아웃·광고 자리)는 URL과 무관하므로 App Shell로 즉시 표시하고,
// params를 읽는 부분만 Suspense 안에서 렌더링한다. (Partial Prefetching 권장 패턴)
// generateStaticParams로 지정한 게임은 빌드 시 전체 HTML이 미리 만들어지므로 SEO에는 영향이 없다.
export default function GamePage({ params }: PageProps<"/games/[slug]">) {
  return (
    <GamePageLayout>
      <Suspense fallback={<GameContentSkeleton />}>
        <GameContent params={params} />
      </Suspense>
    </GamePageLayout>
  );
}

async function GameContent({ params }: Pick<PageProps<"/games/[slug]">, "params">) {
  const game = await getGameOrNotFound(params);

  return (
    <>
      <GameJsonLd game={game} />
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <nav aria-label="breadcrumb" className="text-sm text-zinc-500">
            <Link href="/" className="hover:text-foreground">
              홈
            </Link>{" "}
            / <span>{CATEGORY_LABELS[game.category]}</span>
          </nav>
          <Link
            href="/#games"
            className="rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-foreground dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            ← 전체 게임
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{game.title}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{game.summary}</p>
      </header>

      {/* 이 영역 안에는 광고를 넣지 않는다. */}
      <section aria-label="게임 플레이 영역" className="w-full">
        <GameLoader slug={game.slug} />
      </section>

      <GameDetails game={game} />
      <OtherGames current={game} />
    </>
  );
}

function GameContentSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-10">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-8 w-56 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-72 max-w-full rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <div className="mx-auto aspect-square w-full max-w-[560px] rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

function DetailSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function GameDetails({ game }: { game: GameMeta }) {
  return (
    <div className="flex flex-col gap-8 border-t border-zinc-200 pt-8 leading-7 dark:border-zinc-800">
      <DetailSection id="about-game" title="게임 소개">
        {game.about.map((paragraph) => (
          <p key={paragraph} className="text-zinc-700 dark:text-zinc-300">
            {paragraph}
          </p>
        ))}
      </DetailSection>

      <DetailSection id="features" title="주요 특징">
        <ul className="list-disc space-y-1 pl-6 text-zinc-700 dark:text-zinc-300">
          {game.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection id="goal" title="게임 목표">
        <p className="text-zinc-700 dark:text-zinc-300">{game.goal}</p>
      </DetailSection>

      <DetailSection id="play-info" title="플레이 안내">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-zinc-700 dark:text-zinc-300">
          <dt className="font-medium text-foreground">이용 요금</dt>
          <dd>무료 · 회원가입이나 앱 설치 없이 이 페이지에서 바로 시작합니다.</dd>
          <dt className="font-medium text-foreground">PC</dt>
          <dd>Chrome, Edge, Safari, Firefox 등 최신 브라우저에서 키보드로 플레이합니다.</dd>
          <dt className="font-medium text-foreground">모바일</dt>
          <dd>스마트폰·태블릿 브라우저에서 터치로 플레이합니다. 자세한 방법은 아래 조작 방법을 참고하세요.</dd>
          <dt className="font-medium text-foreground">기록 저장</dt>
          <dd>점수와 설정은 서버가 아닌 사용 중인 브라우저에만 저장됩니다.</dd>
        </dl>
      </DetailSection>

      <DetailSection id="controls" title="조작 방법">
        <div className="grid gap-4 sm:grid-cols-2">
          <ControlList title="키보드 (PC)" controls={game.controls.keyboard} />
          <ControlList title="터치 (모바일)" controls={game.controls.touch} />
        </div>
      </DetailSection>

      <DetailSection id="rules" title="게임 규칙">
        <ol className="list-decimal space-y-1 pl-6 text-zinc-700 dark:text-zinc-300">
          {game.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </DetailSection>

      <DetailSection id="scoring" title="점수 획득 방식">
        <ul className="list-disc space-y-1 pl-6 text-zinc-700 dark:text-zinc-300">
          {game.scoring.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection id="difficulty" title={game.difficulty.title}>
        <ul className="list-disc space-y-1 pl-6 text-zinc-700 dark:text-zinc-300">
          {game.difficulty.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DetailSection>

      {game.sections?.map((section) => (
        <DetailSection key={section.id} id={section.id} title={section.title}>
          {section.intro && <p className="text-zinc-700 dark:text-zinc-300">{section.intro}</p>}
          <dl className="grid gap-3 text-zinc-700 sm:grid-cols-2 dark:text-zinc-300">
            {section.items.map((item) => (
              <div key={item.name} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <dt className="font-medium text-foreground">{item.name}</dt>
                <dd className="mt-1 text-sm leading-6">{item.body}</dd>
              </div>
            ))}
          </dl>
        </DetailSection>
      ))}

      {game.tips && game.tips.length > 0 && (
        <DetailSection id="tips" title="공략 팁">
          <ul className="list-disc space-y-1 pl-6 text-zinc-700 dark:text-zinc-300">
            {game.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </DetailSection>
      )}
    </div>
  );
}

function ControlList({ title, controls }: { title: string; controls: GameControl[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-2 font-medium">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {controls.map((control) => (
          <div key={control.input} className="contents">
            <dt className="font-mono text-zinc-500">{control.input}</dt>
            <dd>{control.action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** 다른 게임으로 이동할 수 있는 목록 */
function OtherGames({ current }: { current: GameMeta }) {
  const others = getIndexableGames().filter((game) => game.slug !== current.slug);
  if (others.length === 0) return null;

  return (
    <section aria-labelledby="other-games" className="flex flex-col gap-3 border-t border-zinc-200 pt-8 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <h2 id="other-games" className="text-xl font-semibold">
          다른 게임
        </h2>
        <Link href="/#games" className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
          전체 게임 보기
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {others.map((game) => (
          <li key={game.slug} className="flex">
            <GameCard game={game} />
          </li>
        ))}
      </ul>
    </section>
  );
}
