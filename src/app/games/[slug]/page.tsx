import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { GamePageLayout } from "@/components/GamePageLayout";
import type { GameControl, GameMeta } from "@/data/types";
import { GameLoader } from "@/games/registry";
import { CATEGORY_LABELS, getAllGames, getGameBySlug, getGamePath } from "@/lib/games";
import { siteConfig } from "@/lib/site";

// Cache Components 환경에서는 `dynamicParams = false`를 쓸 수 없으므로,
// 목록에 없는 slug는 페이지에서 notFound()로 처리한다.
export function generateStaticParams() {
  return getAllGames()
    .filter((game) => game.status === "available")
    .map((game) => ({ slug: game.slug }));
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
  if (!game) return {};

  const path = getGamePath(game.slug);
  const title = `${game.title} - 무료 온라인 ${CATEGORY_LABELS[game.category]} 게임`;

  return {
    title,
    description: game.description,
    keywords: game.keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title,
      description: game.description,
      url: path,
      images: [{ url: game.thumbnail, alt: `${game.title} 게임 화면` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: game.description,
      images: [game.thumbnail],
    },
  };
}

/** 검색엔진용 구조화 데이터 (schema.org VideoGame) */
function GameJsonLd({ game }: { game: GameMeta }) {
  const url = `${siteConfig.url}${getGamePath(game.slug)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: game.description,
    url,
    image: `${siteConfig.url}${game.thumbnail}`,
    genre: CATEGORY_LABELS[game.category],
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any",
    inLanguage: "ko",
    datePublished: game.releasedAt,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: 0, priceCurrency: "KRW" },
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
        <nav aria-label="breadcrumb" className="text-sm text-zinc-500">
          <Link href="/" className="hover:text-foreground">
            홈
          </Link>{" "}
          / <span>{CATEGORY_LABELS[game.category]}</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{game.title}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{game.summary}</p>
      </header>

      {/* 이 영역 안에는 광고를 넣지 않는다. */}
      <section aria-label="게임 플레이 영역" className="w-full">
        <GameLoader slug={game.slug} />
      </section>

      <GameDetails game={game} />
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
