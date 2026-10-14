import { siteConfig } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-zinc-500">
        {/* TODO: AdSense 심사 전 개인정보처리방침·문의 페이지 링크 추가 */}
        <p>{siteConfig.name} · 브라우저에서 바로 즐기는 무료 미니게임</p>
      </div>
    </footer>
  );
}
