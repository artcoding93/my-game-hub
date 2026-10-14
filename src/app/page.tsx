import { AdSlot } from "@/components/AdSlot";
import { GameCard } from "@/components/GameCard";
import { getAllGames } from "@/lib/games";
import { siteConfig } from "@/lib/site";

export default function Home() {
  const games = getAllGames();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 lg:py-12">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{siteConfig.name}</h1>
        <p className="max-w-2xl text-base text-zinc-600 sm:text-lg dark:text-zinc-400">
          {siteConfig.description} 회원가입 없이 PC와 모바일에서 바로 플레이하세요.
        </p>
      </section>

      <AdSlot placement="home-top" variant="banner" />

      <section id="games" aria-labelledby="games-heading" className="flex scroll-mt-20 flex-col gap-4">
        <h2 id="games-heading" className="text-xl font-semibold">
          전체 게임 <span className="text-zinc-500">({games.length})</span>
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <li key={game.slug} className="flex">
              <GameCard game={game} />
            </li>
          ))}
        </ul>
      </section>

      <AdSlot placement="home-bottom" variant="banner" />
    </div>
  );
}
