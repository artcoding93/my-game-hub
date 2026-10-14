import type { ReactNode } from "react";

interface ContentPageProps {
  title: string;
  /** 제목 아래 보조 문구 (예: 시행일) */
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * About·Contact·Privacy·Terms 같은 텍스트 중심 페이지의 공통 레이아웃.
 * 본문 요소(h2, p, ul, a 등)에 일관된 문서 스타일을 적용한다.
 */
export function ContentPage({ title, subtitle, children }: ContentPageProps) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-8 lg:py-12">
      <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>}
      </header>
      <div className="flex flex-col gap-4 leading-7 text-zinc-700 dark:text-zinc-300 [&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-2 dark:[&_a]:text-emerald-400 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-zinc-200 [&_td]:p-2 [&_td]:align-top dark:[&_td]:border-zinc-800 [&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:p-2 [&_th]:text-left dark:[&_th]:border-zinc-800 dark:[&_th]:bg-zinc-900 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
