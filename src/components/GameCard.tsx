import Image from "next/image";
import Link from "next/link";
import type { GameMeta } from "@/data/types";
import { CATEGORY_LABELS, getGamePath } from "@/lib/games";

export function GameCard({ game }: { game: GameMeta }) {
  const isAvailable = game.status === "available";

  const content = (
    <>
      <div className="relative aspect-video overflow-hidden rounded-t-xl bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={game.thumbnail}
          alt={`${game.title} 미리보기`}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {!isAvailable && (
          <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white">
            준비 중
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {CATEGORY_LABELS[game.category]}
        </span>
        <h3 className="text-lg font-semibold">{game.title}</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{game.summary}</p>
      </div>
    </>
  );

  const cardClass =
    "group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950";

  if (!isAvailable) {
    return (
      <article className={`${cardClass} opacity-60`}>
        {content}
      </article>
    );
  }

  return (
    <article className={`${cardClass} transition-shadow hover:shadow-md`}>
      <Link href={getGamePath(game.slug)} className="flex flex-1 flex-col">
        {content}
      </Link>
    </article>
  );
}
