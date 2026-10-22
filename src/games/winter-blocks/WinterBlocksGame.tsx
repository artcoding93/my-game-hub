"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { SONGS, TRACK_IDS } from "./audio/songs";
import { LEVELS, RULE_SENTENCE } from "./config";
import type { HudState, WinterBlocksController } from "./controller";
import { BOARD_H, BOARD_W, drawBoard, drawCell, drawPreview, prepareCanvas, SnowField } from "./renderer";
import { useWinterBlocks } from "./useWinterBlocks";

const PREVIEW_W = 80;
const PREVIEW_H = 48;

/**
 * Winter Blocks 화면 (Canvas 2D, 게임 엔진 없음).
 * - 게임판·미리보기·배경 눈: 캔버스 (renderer.ts)
 * - 점수판·오버레이·설정·터치 버튼: React
 * - 규칙: logic/ (순수 TypeScript)
 */
export default function WinterBlocksGame() {
  const game = useWinterBlocks();
  const { controller, hud, audio } = game;
  const boardRef = useRef<HTMLCanvasElement>(null);
  const snowRef = useRef<HTMLCanvasElement>(null);
  const holdRef = useRef<HTMLCanvasElement>(null);
  const nextRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  // 게임 루프: requestAnimationFrame마다 고정 스텝으로 진행하고 캔버스를 그린다.
  useEffect(() => {
    const snow = new SnowField();
    let frame = 0;
    let last = performance.now();
    let elapsed = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      elapsed += dt;
      const events = controller.update(dt);
      for (const event of events) if (event.type === "wind") snow.blow(event.dir);

      const board = boardRef.current;
      const ctx = board && prepareCanvas(board, BOARD_W, BOARD_H);
      if (ctx) drawBoard(ctx, controller.state, controller.recent);

      const s = controller.state;
      const holdCtx = holdRef.current && prepareCanvas(holdRef.current, PREVIEW_W, PREVIEW_H);
      if (holdCtx) drawPreview(holdCtx, s.phase === "title" ? null : s.hold, PREVIEW_W, PREVIEW_H, s.holdUsed);
      nextRefs.current.forEach((canvas, i) => {
        const c = canvas && prepareCanvas(canvas, PREVIEW_W, PREVIEW_H);
        if (c) drawPreview(c, s.phase === "title" ? null : s.queue[i], PREVIEW_W, PREVIEW_H);
      });

      const field = snowRef.current;
      if (field) {
        const rect = field.getBoundingClientRect();
        const sctx = prepareCanvas(field, rect.width, rect.height);
        if (sctx) snow.draw(sctx, rect.width, rect.height, s.phase === "paused" ? 0 : dt, elapsed);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [controller]);

  return (
    <div
      className={`${arcadeFont.className} relative mx-auto flex w-full max-w-3xl flex-col gap-2 overflow-hidden rounded-2xl bg-linear-to-b from-[#0b1338] via-[#1b1550] to-[#2a1a5e] p-2 text-slate-100 shadow-[0_0_0_4px_#312e81,0_0_32px_rgba(129,140,248,0.3)] select-none sm:p-3`}
      onPointerDown={() => audio.unlock()}
    >
      {/* 게임판 밖 배경에서만 내리는 눈 (블록 식별을 방해하지 않음) */}
      <canvas ref={snowRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />

      <TopBar game={game} />
      <Notices hud={hud} />

      <div className="relative flex items-start justify-center gap-2 sm:gap-4">
        <aside className="flex w-14 shrink-0 flex-col gap-2 sm:w-24" aria-label="점수판">
          <Stat label="SCORE" value={hud.score.toLocaleString()} />
          <Stat label="LINES" value={String(hud.lines)} />
          <Stat label="LEVEL" value={String(hud.level)} sub={hud.levelName} />
          <Stat label="BEST" value={hud.highScore.toLocaleString()} />
          <Panel label="HOLD">
            <canvas ref={holdRef} aria-label={hud.hold ? `홀드: ${hud.hold}` : "홀드 비어 있음"} className="aspect-[5/3] w-full" />
          </Panel>
        </aside>

        <div className="relative aspect-[1/2] w-[min(calc(100vw-11rem),calc((100dvh-18rem)/2),20rem)] min-w-36 shrink-0 overflow-hidden rounded-lg border-2 border-indigo-300/40 shadow-[0_0_24px_rgba(165,180,252,0.25)] pointer-coarse:w-[min(calc(100vw-11rem),calc((100dvh-26rem)/2),20rem)]">
          <canvas ref={boardRef} className="h-full w-full touch-none" aria-label="Winter Blocks 게임판" />
          <Overlay game={game} />
        </div>

        <aside className="flex w-14 shrink-0 flex-col gap-2 sm:w-24" aria-label="다음 블록">
          <Panel label="NEXT">
            <div className="flex flex-col gap-1">
              {[0, 1, 2].map((i) => (
                <canvas
                  key={i}
                  ref={(el) => {
                    nextRefs.current[i] = el;
                  }}
                  aria-label={hud.next[i] ? `다음 블록 ${i + 1}: ${hud.next[i]}` : undefined}
                  className={`aspect-[5/3] w-full ${i > 0 ? "opacity-75" : ""}`}
                />
              ))}
            </div>
          </Panel>
        </aside>
      </div>

      <TouchControls controller={controller} hud={hud} onPause={game.togglePause} />
      <p className="relative hidden text-center font-sans text-xs text-indigo-200/80 pointer-fine:block">
        ←→/AD 이동 · ↓/S 소프트 드롭 · ↑/X 회전 · Z 반대 회전 · Space 하드 드롭 · C 홀드 · P/Esc 일시정지
      </p>
    </div>
  );
}

type GameApi = ReturnType<typeof useWinterBlocks>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-indigo-950/60 px-1.5 py-1 ring-1 ring-indigo-300/20">
      <div className="text-[6px] text-sky-300 sm:text-[8px]">{label}</div>
      <div className="truncate text-[9px] tabular-nums sm:text-xs">{value}</div>
      {sub && <div className="truncate font-sans text-[9px] text-amber-200 sm:text-[11px]">{sub}</div>}
    </div>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-indigo-950/60 p-1 ring-1 ring-indigo-300/20">
      <div className="mb-1 text-[6px] text-sky-300 sm:text-[8px]">{label}</div>
      {children}
    </div>
  );
}

const smallButton =
  "h-11 min-w-11 rounded-md border-2 px-2 text-[8px] uppercase tracking-wider transition-colors active:translate-y-px disabled:opacity-30 sm:text-[9px]";

function TopBar({ game }: { game: GameApi }) {
  const { hud } = game;
  const canPause = hud.phase === "playing" || hud.phase === "paused";
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-2">
      <p className="bg-linear-to-b from-white to-sky-300 bg-clip-text text-xs text-transparent sm:text-base">WINTER BLOCKS</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={game.togglePause} disabled={!canPause} className={`${smallButton} border-sky-300/70 text-sky-100 hover:bg-sky-300/10`}>
          {hud.phase === "paused" ? "Resume" : "Pause"}
        </button>
        <Toggle on={game.soundOn} onToggle={game.toggleSound} label="SFX" aria={game.soundOn ? "효과음 끄기" : "효과음 켜기"} />
        <Toggle on={game.musicOn} onToggle={game.toggleMusic} label="BGM" aria={game.musicOn ? "배경음악 끄기" : "배경음악 켜기"} />
      </div>
    </div>
  );
}

function Toggle({ on, onToggle, label, aria }: { on: boolean; onToggle: () => void; label: string; aria: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={aria}
      title={aria}
      className={`${smallButton} ${on ? "border-amber-300 text-amber-100 hover:bg-amber-300/10" : "border-slate-500 text-slate-400 hover:bg-slate-400/10"}`}
    >
      {label} {on ? "On" : "Off"}
    </button>
  );
}

function TrackSelect({ game }: { game: GameApi }) {
  return (
    <fieldset className="flex flex-col items-center gap-1">
      <legend className="mb-1 text-[8px] text-sky-300">BGM</legend>
      <div className="flex flex-wrap justify-center gap-1">
        {TRACK_IDS.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => game.selectTrack(id)}
            aria-pressed={game.track === id}
            className={`min-h-11 rounded-md border-2 px-2 font-sans text-[11px] ${game.track === id ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-indigo-300/40 text-indigo-100 hover:bg-indigo-300/10"}`}
          >
            {i + 1}. {SONGS[id].title}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * 레벨업 안내·바람·눈 예고. 게임판 위 별도 줄에 두어 새 블록이 나오는 자리를 가리지 않는다.
 * 비어 있어도 높이를 유지해 게임판이 위아래로 흔들리지 않게 한다.
 */
function Notices({ hud }: { hud: HudState }) {
  const info = hud.banner && hud.phase === "playing" ? LEVELS[hud.banner - 1] : null;
  const playing = hud.phase === "playing";
  return (
    <div className="relative flex min-h-11 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-center" aria-live="polite">
      {info && (
        <p className="font-sans text-[11px] leading-tight text-slate-100 sm:text-xs">
          <span className={`${arcadeFont.className} mr-1 text-[8px] text-amber-200 sm:text-[10px]`}>
            LEVEL {info.level} · {info.name.toUpperCase()}
          </span>
          {info.rule}
        </p>
      )}
      {playing && hud.wind !== null && (
        <p className="animate-pulse font-sans text-[11px] text-sky-100 sm:text-xs">
          {hud.wind < 0 ? "◀◀ 곧 바람이 왼쪽으로 붑니다" : "곧 바람이 오른쪽으로 붑니다 ▶▶"}
        </p>
      )}
      {playing && hud.snowColumn !== null && (
        <p className="font-sans text-[11px] text-sky-100 sm:text-xs">❄ 빛나는 열 위에 눈 블록이 쌓입니다</p>
      )}
    </div>
  );
}

function OverlayBox({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto bg-[#0b1338]/85 p-2 text-center">
      {children}
    </div>
  );
}

const bigButton = "min-h-11 w-full max-w-44 rounded-md border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px sm:text-[10px]";
const primary = `${bigButton} border-amber-300 bg-amber-300 text-indigo-950 hover:bg-amber-200`;
const secondary = `${bigButton} border-sky-300/70 text-sky-100 hover:bg-sky-300/10`;

function Logo() {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="bg-linear-to-b from-white via-sky-200 to-indigo-300 bg-clip-text text-lg leading-tight text-transparent drop-shadow-[0_0_10px_rgba(186,230,253,0.6)] sm:text-2xl">
        WINTER
        <br />
        BLOCKS
      </p>
      <p className="text-[6px] tracking-[0.2em] text-amber-200/90 sm:text-[8px]">A COZY PUZZLE CHALLENGE</p>
    </div>
  );
}

function Overlay({ game }: { game: GameApi }) {
  const { hud } = game;
  const [help, setHelp] = useState(false);

  if (hud.phase === "title" && help) {
    return (
      <OverlayBox>
        <HowToPlay />
        <button type="button" onClick={() => setHelp(false)} className={secondary}>
          Back
        </button>
      </OverlayBox>
    );
  }
  switch (hud.phase) {
    case "title":
      return (
        <OverlayBox>
          <Logo />
          <p className="max-w-56 font-sans text-[11px] leading-snug text-slate-200">{RULE_SENTENCE}</p>
          <button type="button" onClick={game.start} className={primary}>
            Start Game
          </button>
          <button type="button" onClick={() => setHelp(true)} className={secondary}>
            How to Play
          </button>
          <div className="flex gap-1">
            <Toggle on={game.soundOn} onToggle={game.toggleSound} label="Sound" aria={game.soundOn ? "효과음 끄기" : "효과음 켜기"} />
            <Toggle on={game.musicOn} onToggle={game.toggleMusic} label="BGM" aria={game.musicOn ? "배경음악 끄기" : "배경음악 켜기"} />
          </div>
          <TrackSelect game={game} />
          {hud.highScore > 0 && <p className="text-[8px] text-amber-200">BEST {hud.highScore.toLocaleString()}</p>}
        </OverlayBox>
      );
    case "paused":
      return (
        <OverlayBox>
          <p className="text-base text-sky-200">PAUSED</p>
          <button type="button" onClick={game.togglePause} className={primary}>
            Resume
          </button>
          <button type="button" onClick={game.start} className={secondary}>
            Restart
          </button>
          <TrackSelect game={game} />
        </OverlayBox>
      );
    case "gameOver":
      return (
        <OverlayBox>
          <p className="text-base text-rose-300 sm:text-xl">GAME OVER</p>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-left text-[8px] sm:text-[10px]">
            <dt className="text-sky-300">SCORE</dt>
            <dd className="tabular-nums">{hud.score.toLocaleString()}</dd>
            <dt className="text-sky-300">BEST</dt>
            <dd className="tabular-nums text-amber-200">{hud.highScore.toLocaleString()}</dd>
            <dt className="text-sky-300">LINES</dt>
            <dd className="tabular-nums">{hud.lines}</dd>
            <dt className="text-sky-300">LEVEL</dt>
            <dd>
              {hud.level} <span className="font-sans text-[10px] text-amber-200">{hud.levelName}</span>
            </dd>
          </dl>
          {hud.newRecord && <p className="animate-pulse text-[8px] text-amber-200">NEW BEST!</p>}
          <button type="button" onClick={game.start} className={primary}>
            Restart
          </button>
          <Link href="/#games" className={`${secondary} flex items-center justify-center`}>
            Back to Games
          </Link>
        </OverlayBox>
      );
    default:
      return null;
  }
}

function HowToPlay() {
  return (
    <div className="flex w-full max-w-64 flex-col gap-2 text-left font-sans text-[11px] leading-snug text-slate-100">
      <p className={`${arcadeFont.className} text-center text-[9px] text-sky-200`}>HOW TO PLAY</p>
      <p className="text-amber-100">{RULE_SENTENCE}</p>
      <BumpDemo />
      <p>가로줄을 빈칸 없이 채우면 사라집니다. 지운 줄이 늘면 레벨이 오르고 새 겨울 방해 요소가 등장합니다.</p>
      <ul className="list-disc space-y-0.5 pl-4 text-slate-300">
        <li>Lv.2 혹이 가끔 2칸</li>
        <li>Lv.3 얼음 칸: 줄을 채우면 먼저 금이 가고, 다음 차례에 사라짐</li>
        <li>Lv.4 바람: 화면에 예고된 뒤 블록을 한 칸 밈</li>
        <li>Lv.5 눈 블록: 표시된 열 위에 쌓임</li>
        <li>Lv.6 모든 방해 요소</li>
      </ul>
    </div>
  );
}

/** 혹 생성 규칙 안내 애니메이션: 4칸 블록이 떨어져 고정된 뒤 위쪽에 혹이 생긴다. */
function BumpDemo() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [caption, setCaption] = useState("1. 4칸 블록이 떨어집니다");
  useEffect(() => {
    const W = 120;
    const H = 96;
    const size = 16;
    let frame = 0;
    const startAt = performance.now();
    const piece: { x: number; y: number }[] = [{ x: 3, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }];
    const loop = (now: number) => {
      const t = ((now - startAt) / 1000) % 3.6;
      const ctx = ref.current && prepareCanvas(ref.current, W, H);
      if (ctx) {
        ctx.fillStyle = "#0b1338";
        ctx.fillRect(0, 0, W, H);
        const ox = 4;
        for (let x = 0; x < 7; x++) drawCell(ctx, ox + x * size, H - size, size, { kind: x === 3 ? "J" : "I" }, x === 3 ? 0 : 0.85);
        const landed = t >= 1.2;
        const fall = Math.min(t / 1.2, 1);
        const dy = landed ? 3 : Math.floor(fall * 3);
        for (const c of piece) drawCell(ctx, ox + c.x * size, (c.y + dy) * size - 4, size, { kind: "T" });
        if (t >= 1.7) {
          const p = Math.min((t - 1.7) / 0.4, 1);
          drawCell(ctx, ox + 3 * size, 2 * size - 4, size, { kind: "bump" }, p);
          ctx.strokeStyle = `rgba(245, 208, 254, ${1 - p})`;
          ctx.beginPath();
          ctx.arc(ox + 3.5 * size, 2.5 * size - 4, size * (0.4 + p), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      const next = t < 1.2 ? "1. 4칸 블록이 떨어집니다" : t < 1.7 ? "2. 착지해서 고정됩니다" : "3. 위쪽에 1칸짜리 혹이 생깁니다";
      setCaption((prev) => (prev === next ? prev : next));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <figure className="flex flex-col items-center gap-1">
      <canvas ref={ref} className="h-24 w-30 rounded" aria-hidden />
      <figcaption className="text-[11px] text-sky-200" aria-live="polite">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * 터치 기기 전용 조작 버튼. 버튼마다 포인터를 따로 잡으므로 이동하면서 회전·드롭을 동시에 누를 수 있다(멀티터치).
 * 누르고 있으면 반복 이동·소프트 드롭이 된다. 화면 확대·스크롤을 막기 위해 touch-none을 쓴다.
 */
function TouchControls({ controller, hud, onPause }: { controller: WinterBlocksController; hud: HudState; onPause: () => void }) {
  const { input } = controller;
  const playing = hud.phase === "playing";
  const capture = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const hold = (source: string, onDown: () => void) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      capture(event);
      onDown();
    },
    onPointerUp: () => input.release(source),
    onPointerCancel: () => input.release(source),
    onLostPointerCapture: () => input.release(source),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  const tap = (action: "rotateCW" | "rotateCCW" | "hardDrop" | "hold") => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (playing) input.trigger(action);
    },
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  const btn =
    "flex h-14 items-center justify-center rounded-xl border-2 text-lg select-none touch-none active:translate-y-px";
  const blue = `${btn} border-indigo-300/60 bg-indigo-950/80 text-sky-100 active:bg-indigo-800`;
  const warm = `${btn} border-amber-300/70 bg-amber-900/40 text-amber-100 active:bg-amber-800/60`;

  return (
    <div className="relative hidden touch-none grid-cols-4 gap-1.5 pointer-coarse:grid" aria-label="터치 조작">
      <button type="button" aria-label="왼쪽으로 이동" className={blue} {...hold("t-left", () => input.pressMove("t-left", -1))}>
        ◀
      </button>
      <button type="button" aria-label="오른쪽으로 이동" className={blue} {...hold("t-right", () => input.pressMove("t-right", 1))}>
        ▶
      </button>
      <button type="button" aria-label="시계 방향 회전" className={blue} {...tap("rotateCW")}>
        <RotateIcon dir={1} />
      </button>
      <button type="button" aria-label="아래로 이동 (소프트 드롭)" className={blue} {...hold("t-soft", () => input.setSoftDrop("t-soft", true))}>
        ▼
      </button>
      <button type="button" aria-label="반시계 방향 회전" className={blue} {...tap("rotateCCW")}>
        <RotateIcon dir={-1} />
      </button>
      <button type="button" aria-label="홀드" className={`${blue} text-[9px]`} {...tap("hold")}>
        HOLD
      </button>
      <button type="button" aria-label="즉시 낙하 (하드 드롭)" className={`${warm} text-[9px]`} {...tap("hardDrop")}>
        DROP
      </button>
      <button
        type="button"
        aria-label={hud.phase === "paused" ? "계속하기" : "일시정지"}
        className={`${blue} text-[9px]`}
        onPointerDown={(event) => {
          event.preventDefault();
          if (hud.phase === "playing" || hud.phase === "paused") onPause();
        }}
      >
        {hud.phase === "paused" ? "▶" : "II"}
      </button>
    </div>
  );
}

/** 회전 방향 화살표 (시스템 글꼴의 ↻·↺ 기호가 기기마다 작게 보여 SVG로 그린다) */
function RotateIcon({ dir }: { dir: 1 | -1 }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={dir < 0 ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4v4.5h-4.5" />
    </svg>
  );
}
