import Link from "next/link";
import { navLinks, siteConfig } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-background/90 backdrop-blur dark:border-zinc-800">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          🎮 {siteConfig.name}
        </Link>
        <nav aria-label="주요 메뉴">
          <ul className="flex items-center gap-1 text-sm text-zinc-600 sm:gap-2 dark:text-zinc-400">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-md px-2 py-2 hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-900"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
