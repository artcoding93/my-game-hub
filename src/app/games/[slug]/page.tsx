import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GamePageLayout } from "@/components/GamePageLayout";
import type { GameMeta } from "@/data/types";
import { GameLoader } from "@/games/registry";
import { CATEGORY_LABELS, getAllGames, getGameBySlug, getGamePath } from "@/lib/games";

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

  return {
    title: game.title,
    description: game.description,
    keywords: game.keywords,
    alternates: { canonical: path },
    openGraph: {
      title: game.title,
      description: game.description,
      url: path,
      images: [{ url: game.thumbnail, alt: game.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: game.title,
      description: game.description,
      images: [game.thumbnail],
    },
  };
}

export default async function GamePage({ params }: PageProps<"/games/[slug]">) {
  const game = await getGameOrNotFound(params);

  return (
    <GamePageLayout
      header={
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
      }
      game={<GameLoader slug={game.slug} />}
      details={<GameDetails game={game} />}
    />
  );
}

function GameDetails({ game }: { game: GameMeta }) {
  return (
    <section aria-labelledby="how-to-play" className="flex flex-col gap-4">
      <h2 id="how-to-play" className="text-xl font-semibold">
        게임 방법
      </h2>
      <p className="text-zinc-700 dark:text-zinc-300">{game.description}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <ControlList title="키보드 (PC)" controls={game.controls.keyboard} />
        <ControlList title="터치 (모바일)" controls={game.controls.touch} />
      </div>
    </section>
  );
}

function ControlList({ title, controls }: { title: string; controls: GameMeta["controls"]["keyboard"] }) {
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
