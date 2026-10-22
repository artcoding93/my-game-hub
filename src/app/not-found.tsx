import type { Metadata } from "next";
import Link from "next/link";

// 404 페이지에는 Next.js가 noindex를 자동으로 넣으므로 robots는 따로 지정하지 않는다.
export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        주소가 바뀌었거나 없는 페이지입니다. 게임 목록에서 원하는 게임을 찾아 보세요.
      </p>
      <Link href="/#games" className="rounded-full bg-foreground px-5 py-2 text-background">
        게임 목록으로
      </Link>
    </div>
  );
}
