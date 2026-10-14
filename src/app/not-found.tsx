import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="text-zinc-600 dark:text-zinc-400">요청한 게임이 없거나 아직 준비 중입니다.</p>
      <Link href="/" className="rounded-full bg-foreground px-5 py-2 text-background">
        게임 목록으로
      </Link>
    </div>
  );
}
