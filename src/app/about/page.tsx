import type { Metadata } from "next";
import Link from "next/link";
import { ContentPage } from "@/components/ContentPage";
import { TodoMark } from "@/components/TodoMark";
import { getAllGames, getGamePath } from "@/lib/games";
import { operatorConfig, siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "사이트 소개",
  description: `${siteConfig.name}는 설치 없이 브라우저에서 바로 즐기는 무료 2D 미니게임 사이트입니다. 사이트의 목적과 제공 게임, 운영 원칙을 소개합니다.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const games = getAllGames().filter((game) => game.status === "available");

  return (
    <ContentPage title="사이트 소개">
      <p>
        {siteConfig.name}는 설치나 회원가입 없이 웹 브라우저에서 바로 즐길 수 있는 2D 미니게임을
        모아 둔 사이트입니다. 잠깐 쉬는 시간에 가볍게 즐길 수 있는 게임을 PC와 모바일 어디서나 같은
        방식으로 플레이할 수 있게 만드는 것을 목표로 합니다.
      </p>

      <h2>제공하는 게임</h2>
      <ul>
        {games.map((game) => (
          <li key={game.slug}>
            <Link href={getGamePath(game.slug)}>{game.title}</Link> — {game.summary}
          </li>
        ))}
      </ul>
      <p>새로운 게임은 준비되는 대로 계속 추가할 예정입니다.</p>

      <h2>운영 원칙</h2>
      <ul>
        <li>모든 게임은 무료이며 회원가입을 요구하지 않습니다.</li>
        <li>
          게임 기록(최고 점수 등)은 서버에 보내지 않고 이용자의 브라우저에만 저장합니다. 자세한 내용은{" "}
          <Link href="/privacy">개인정보처리방침</Link>을 확인해 주세요.
        </li>
        <li>키보드와 터치 조작을 모두 지원하고, 다양한 화면 크기에서 플레이할 수 있도록 만듭니다.</li>
        <li>사이트 운영을 위해 앞으로 광고가 게재될 수 있으며, 광고가 게임 조작을 방해하지 않도록 배치합니다.</li>
      </ul>

      <h2>운영자</h2>
      <p>
        {siteConfig.name}는 <TodoMark label="운영자 이름 또는 상호" value={operatorConfig.name} />이(가)
        운영합니다. 오류 제보나 게임 제안은 <Link href="/contact">문의하기</Link> 페이지를 이용해 주세요.
      </p>
    </ContentPage>
  );
}
