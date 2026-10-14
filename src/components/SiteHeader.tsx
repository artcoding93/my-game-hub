import Link from "next/link";
import { siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-background/90 backdrop-blur dark:border-zinc-800">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🎮 {siteConfig.name}
        </Link>
        <nav aria-label="주요 메뉴" className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/#games" className="hover:text-foreground">
            전체 게임
          </Link>
        </nav>
      </div>
    </header>
  );
}
