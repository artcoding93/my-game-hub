import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/AdSlot";
import { GameCard } from "@/components/GameCard";
import { getAllGames } from "@/lib/games";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

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
      <section aria-labelledby="intro-heading" className="flex flex-col gap-4">
        <h1 id="intro-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          {siteConfig.name}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg dark:text-zinc-400">
          {siteConfig.name}는 설치 없이 브라우저에서 바로 즐기는 2D 미니게임 모음입니다. 스네이크처럼
          누구나 아는 고전 아케이드 게임을 시작으로, 짧은 시간에 가볍게 즐길 수 있는 게임을 하나씩
          늘려 가고 있습니다.
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
          {games.map((game) => (
            <li key={game.slug} className="flex">
              <GameCard game={game} />
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
