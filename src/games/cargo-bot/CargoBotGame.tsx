"use client";

import Link from "next/link";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { CargoRenderer } from "./render/renderer";
import { allCleared, isUnlocked } from "./save";
import { STAGES } from "./stages";
import type { Dir } from "./types";
import { useCargoBot, type CargoApi } from "./useCargoBot";

/**
 * Cargo Bot: Warehouse Puzzle 화면 (Canvas 2D, 게임 엔진 없음).
 * - 보드(타일·로봇·상자·연출): 캔버스 (render/)
 * - 시작·스테이지 선택·게임 방법·HUD·메뉴·결과·버튼·D-pad: React
 * 게임 안 문구는 영어가 기본이다. 이 컴포넌트 안(게임 플레이 영역)에는 광고를 넣지 않는다.
 */
export default function CargoBotGame() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useCargoBot(rootRef, canvasRef);
  const showBoard = game.screen === "game" || game.screen === "finale";
  const level = game.session?.level;
  const ratio = level ? level.cols / level.rows : 4 / 3;
  return (
    <div
      ref={rootRef}
      className={`${arcadeFont.className} relative mx-auto flex w-full max-w-4xl flex-col gap-2 rounded-2xl bg-linear-to-b from-[#1b2236] to-[#0b0f1c] p-2 text-slate-100 shadow-[0_0_0_4px_#3a4560,0_0_24px_rgba(255,190,85,0.18)] select-none sm:p-3`}
      onPointerDown={() => game.audio.unlock()}
    >
      {game.screen === "game" && <Hud game={game} />}
      {/* 터치 기기 가로 화면: 보드 옆에 조작부 (세로·데스크톱은 보드 아래) */}
      <div className={showBoard ? "flex flex-col gap-2 pointer-coarse:landscape:flex-row pointer-coarse:landscape:items-center" : "hidden"}>
        <div className="relative min-w-0 flex-1">
          <div
            className="relative mx-auto w-full max-w-[min(100%,calc(56vh*var(--board-ratio)))] pointer-coarse:landscape:max-w-[min(100%,calc(78vh*var(--board-ratio)))]"
            style={{ aspectRatio: `${ratio}`, ["--board-ratio" as string]: ratio }}
          >
            <canvas ref={canvasRef} className="block h-full w-full touch-none rounded-md bg-[#0b0f1c]" style={{ imageRendering: "pixelated" }} aria-label="Cargo Bot 퍼즐 보드" />
            {game.menuOpen && <PauseMenu game={game} />}
            {game.clear && <ClearPanel game={game} />}
            {game.screen === "finale" && <Finale game={game} />}
          </div>
        </div>
        {game.screen === "game" && (
          <div className="flex flex-col gap-2 pointer-coarse:landscape:w-60 pointer-coarse:landscape:shrink-0">
            <GameControls game={game} />
          </div>
        )}
      </div>
      {game.screen === "title" && <Title game={game} />}
      {game.screen === "select" && <StageSelect game={game} />}
      {game.screen === "howto" && <HowTo game={game} />}
    </div>
  );
}

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 sm:text-[10px]";
const primary = `${btn} border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200`;
const secondary = `${btn} border-sky-300/70 text-sky-100 hover:bg-sky-300/10`;
const ghost = `${btn} border-slate-500 text-slate-300 hover:bg-slate-400/10`;

function blurAfter(fn: () => void) {
  return (e: { currentTarget: HTMLElement }) => {
    fn();
    e.currentTarget.blur();
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 픽셀 그림 하나를 캔버스에 그려 보여 준다 (시작 화면 로봇, 게임 방법 예시) */
function PixelArt({ make, label, className = "" }: { make: () => HTMLCanvasElement; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = ref.current;
    const ctx = target?.getContext("2d");
    if (!target || !ctx) return;
    const src = make();
    target.width = src.width;
    target.height = src.height;
    ctx.drawImage(src, 0, 0);
  }, [make]);
  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated" }} role="img" aria-label={label} />;
}

const robotArt = () => CargoRenderer.robotPreview(6);
const icon = (kind: Parameters<typeof CargoRenderer.tilePreview>[0]) => () => CargoRenderer.tilePreview(kind, 3);
const ICONS = { robot: () => CargoRenderer.robotPreview(3), crate: icon("crate"), lamp: icon("lamp"), lit: icon("lit"), belt: icon("belt"), ice: icon("ice"), pad: icon("pad") };

function SoundToggles({ game }: { game: CargoApi }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      <button type="button" className={game.soundOn ? secondary : ghost} aria-pressed={game.soundOn} onClick={blurAfter(game.toggleSound)} title="Sound effects on/off (off by default)">
        SFX {game.soundOn ? "On" : "Off"}
      </button>
      <button type="button" className={game.musicOn ? secondary : ghost} aria-pressed={game.musicOn} onClick={blurAfter(game.toggleMusic)} title="Background music on/off (off by default)">
        BGM {game.musicOn ? "On" : "Off"}
      </button>
      <button type="button" className={ghost} onClick={blurAfter(game.cycleVolume)} title="Volume" aria-label={`Volume ${game.volume} of 3`}>
        VOL {"▮".repeat(game.volume)}
        {"▯".repeat(3 - game.volume)}
      </button>
    </div>
  );
}

function Title({ game }: { game: CargoApi }) {
  const continuing = Boolean(game.progress.resume) || Object.keys(game.progress.records).length > 0;
  return (
    <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
      <PixelArt make={robotArt} label="Cargo Bot robot" className="h-24 w-24" />
      <div>
        <p className="text-3xl text-amber-300 sm:text-5xl">CARGO BOT</p>
        <p className="mt-2 text-[10px] tracking-[0.35em] text-sky-200 sm:text-sm">WAREHOUSE PUZZLE</p>
      </div>
      <p className="max-w-md font-sans text-xs leading-5 text-slate-300 sm:text-sm">
        An old automated warehouse has stopped. Guide the little maintenance robot, push every crate onto its glowing delivery lamp, and bring the system back online.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button type="button" className={`${primary} min-h-12 text-[11px]`} onClick={blurAfter(game.play)}>
          {continuing ? "Continue" : "Play"}
        </button>
        <button type="button" className={secondary} onClick={blurAfter(() => game.setScreen("select"))}>
          Stage Select
        </button>
        <button type="button" className={secondary} onClick={blurAfter(() => game.setScreen("howto"))}>
          How to Play
        </button>
      </div>
      <SoundToggles game={game} />
      <Link href="/" className={`${ghost} no-underline`}>
        Back to Game Hub
      </Link>
    </div>
  );
}

function Stars({ n, size = "text-xs" }: { n: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${n} of 3 stars`}>
      <span className="text-amber-300">{"★".repeat(n)}</span>
      <span className="text-slate-600">{"★".repeat(3 - n)}</span>
    </span>
  );
}

function StageSelect({ game }: { game: CargoApi }) {
  const current = game.progress.resume?.stage ?? STAGES.findIndex((s) => !game.progress.records[s.id]);
  return (
    <div className="flex flex-col gap-3 p-1">
      <p className="text-center text-sm text-amber-300 sm:text-base">STAGE SELECT</p>
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {STAGES.map((s, i) => {
          const rec = game.progress.records[s.id];
          const open = isUnlocked(game.progress, i);
          const here = i === current;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!open}
                onClick={blurAfter(() => game.openStage(i))}
                className={`flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 p-1.5 text-center transition-colors ${
                  here ? "border-amber-300 bg-amber-300/10" : rec ? "border-emerald-400/60 bg-emerald-400/5" : "border-slate-600"
                } ${open ? "hover:bg-slate-400/10" : "cursor-not-allowed opacity-45"}`}
                aria-label={`Stage ${s.id}: ${s.name}${rec ? `, cleared, ${rec.stars} stars` : open ? "" : ", locked"}`}
              >
                <span className="text-sm text-white">{pad2(s.id)}</span>
                <span className="font-sans text-[10px] leading-tight text-slate-300">{s.name}</span>
                {rec ? <Stars n={rec.stars} /> : <span className="text-[9px] text-slate-500">{open ? (here ? "NEXT" : "OPEN") : "LOCKED"}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex justify-center">
        <button type="button" className={ghost} onClick={blurAfter(() => game.setScreen(game.session ? "game" : "title"))}>
          Back
        </button>
      </div>
    </div>
  );
}

function HowToRow({ art, title, children }: { art: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-slate-800/60 p-2">
      <div className="flex shrink-0 items-center gap-1">{art}</div>
      <div className="font-sans text-xs leading-5 text-slate-200 sm:text-sm">
        <p className="font-semibold text-amber-200">{title}</p>
        <p>{children}</p>
      </div>
    </li>
  );
}

function HowTo({ game }: { game: CargoApi }) {
  const px = "h-12 w-12";
  return (
    <div className="flex flex-col gap-3 p-1">
      <p className="text-center text-sm text-amber-300 sm:text-base">HOW TO PLAY</p>
      <ul className="flex flex-col gap-2">
        <HowToRow
          title="Push crates onto lamps"
          art={
            <>
              <PixelArt make={ICONS.robot} label="robot" className={px} />
              <PixelArt make={ICONS.crate} label="crate" className={px} />
              <PixelArt make={ICONS.lamp} label="lamp" className={px} />
            </>
          }
        >
          Walk into a crate to push it one tile. When every crate sits on a lamp, the lamps turn green and the stage is clear.
        </HowToRow>
        <HowToRow title="Push only, one at a time" art={<PixelArt make={ICONS.lit} label="crate on lamp" className={px} />}>
          You cannot pull crates or push two in a row. A crate stuck in a corner can never move again — a red ! warns you. Just Undo.
        </HowToRow>
        <HowToRow title="Conveyor belts" art={<PixelArt make={ICONS.belt} label="conveyor belt" className={px} />}>
          A crate pushed onto a belt rides in the arrow direction, even around corners, and stops on the first plain floor or when blocked.
        </HowToRow>
        <HowToRow title="Ice" art={<PixelArt make={ICONS.ice} label="ice" className={px} />}>
          Crates slide across ice until something stops them. Leaving the ice, a crate stops on the first plain floor tile.
        </HowToRow>
        <HowToRow title="Teleporters" art={<PixelArt make={ICONS.pad} label="teleporter" className={px} />}>
          A crate pushed onto a pad jumps to the pad with the same colour and dots, then stops. If that pad is occupied, it stays put.
        </HowToRow>
      </ul>
      <p className="text-center font-sans text-[11px] leading-5 text-slate-400">
        Belts, ice and teleporters only move crates — your robot&apos;s magnetic treads keep it in place.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-slate-600 p-2 text-[9px] sm:text-[10px]">
        <dt className="text-sky-200">Arrows / WASD</dt>
        <dd>Move</dd>
        <dt className="text-sky-200">Z · Ctrl+Z</dt>
        <dd>Undo</dd>
        <dt className="text-sky-200">Y · Ctrl+Y</dt>
        <dd>Redo</dd>
        <dt className="text-sky-200">R</dt>
        <dd>Restart stage</dd>
        <dt className="text-sky-200">H</dt>
        <dd>Hint</dd>
        <dt className="text-sky-200">Esc</dt>
        <dd>Menu</dd>
      </dl>
      <div className="flex justify-center">
        <button type="button" className={primary} onClick={blurAfter(() => game.setScreen(game.session && !game.clear ? "game" : "title"))}>
          Got it
        </button>
      </div>
    </div>
  );
}

function Hud({ game }: { game: CargoApi }) {
  const s = game.session;
  if (!s) return null;
  const stage = STAGES[s.stageIndex];
  const rec = game.progress.records[stage.id];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 text-[9px] sm:text-[11px]">
      <p>
        <span className="text-amber-300">STAGE {pad2(stage.id)}</span>
        <span className="text-slate-500"> / {STAGES.length}</span>
        <span className="ml-2 font-sans text-xs text-slate-300 sm:text-sm">{stage.name}</span>
      </p>
      <p className="flex gap-3">
        <span>
          MOVES <span className="text-white">{s.current.moves}</span>
        </span>
        <span>
          PUSHES <span className="text-white">{s.current.pushes}</span>
        </span>
        {rec && (
          <span className="text-slate-400">
            BEST {rec.bestMoves}/{rec.bestPushes}
          </span>
        )}
      </p>
    </div>
  );
}

function GameControls({ game }: { game: CargoApi }) {
  const s = game.session;
  const message = game.thinking ? "Thinking…" : game.hint ? game.hint.text : game.warning ? "A crate is stuck in a corner. Undo (Z) to take it back." : null;
  const tone = game.hint?.kind === "stuck" || (!game.hint && game.warning) ? "text-rose-300" : "text-sky-100";
  return (
    <>
      <p className={`min-h-10 px-1 text-center font-sans text-xs leading-5 sm:text-sm pointer-coarse:landscape:min-h-0 pointer-coarse:landscape:text-[11px] pointer-coarse:landscape:leading-4 ${tone}`} role="status" aria-live="polite">
        {message}
      </p>
      <div className="flex flex-wrap justify-center gap-1.5 pointer-coarse:landscape:grid pointer-coarse:landscape:grid-cols-3 pointer-coarse:landscape:[&>button]:px-1">
        <button type="button" className={ghost} disabled={!s?.canUndo} onClick={blurAfter(game.undo)}>
          Undo
        </button>
        <button type="button" className={ghost} disabled={!s?.canRedo} onClick={blurAfter(game.redo)}>
          Redo
        </button>
        <button type="button" className={ghost} onClick={blurAfter(game.restart)}>
          Restart
        </button>
        <button type="button" className={secondary} onClick={blurAfter(game.askHint)} disabled={game.thinking}>
          Hint
        </button>
        <button type="button" className={ghost} onClick={blurAfter(game.toggleMenu)}>
          Menu
        </button>
      </div>
      <DPad game={game} />
    </>
  );
}

const PAD: { dir: Dir; label: string; area: string; glyph: string }[] = [
  { dir: 0, label: "Move up", area: "[grid-area:up]", glyph: "▲" },
  { dir: 3, label: "Move left", area: "[grid-area:left]", glyph: "◀" },
  { dir: 1, label: "Move right", area: "[grid-area:right]", glyph: "▶" },
  { dir: 2, label: "Move down", area: "[grid-area:down]", glyph: "▼" },
];

/** 터치 기기 전용 십자 버튼 (버튼마다 포인터를 따로 잡는다). 탭 = 한 칸, 누르고 있으면 반복 */
function DPad({ game }: { game: CargoApi }) {
  const bind = (dir: Dir) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 포인터 캡처를 지원하지 않는 환경: 입력은 그대로 처리된다
      }
      game.padPress(`pad-${e.pointerId}`, dir);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => game.padRelease(`pad-${e.pointerId}`),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => game.padRelease(`pad-${e.pointerId}`),
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => game.padRelease(`pad-${e.pointerId}`),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  });
  return (
    <div
      className="mx-auto hidden touch-none grid-cols-[repeat(3,3.5rem)] grid-rows-[repeat(3,3.5rem)] gap-1.5 pointer-coarse:grid pointer-coarse:landscape:grid-cols-[repeat(3,3rem)] pointer-coarse:landscape:grid-rows-[repeat(3,3rem)]"
      style={{ gridTemplateAreas: '". up ." "left . right" ". down ."' }}
      aria-label="Direction pad"
    >
      {PAD.map((p) => (
        <button key={p.dir} type="button" aria-label={p.label} className={`${p.area} flex touch-none items-center justify-center rounded-xl border-2 border-sky-300/60 bg-slate-800 font-sans text-xl text-sky-100 active:bg-sky-900`} {...bind(p.dir)}>
          {p.glyph}
        </button>
      ))}
    </div>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center-safe gap-3 overflow-y-auto rounded-md bg-[#0b0f1c]/85 p-3 text-center">{children}</div>;
}

function PauseMenu({ game }: { game: CargoApi }) {
  return (
    <Overlay>
      <p className="text-lg text-amber-300 sm:text-2xl">PAUSED</p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <button type="button" className={primary} onClick={blurAfter(game.toggleMenu)}>
          Resume
        </button>
        <button type="button" className={secondary} onClick={blurAfter(game.restart)}>
          Restart Stage
        </button>
        <button type="button" className={secondary} onClick={blurAfter(() => game.setScreen("select"))}>
          Stage Select
        </button>
        <button type="button" className={secondary} onClick={blurAfter(() => game.setScreen("howto"))}>
          How to Play
        </button>
        <button type="button" className={ghost} onClick={blurAfter(game.toTitle)}>
          Title
        </button>
      </div>
      <SoundToggles game={game} />
    </Overlay>
  );
}

function ClearPanel({ game }: { game: CargoApi }) {
  const c = game.clear!;
  const stage = STAGES[c.stageIndex];
  return (
    <Overlay>
      <p className="text-xl text-emerald-300 sm:text-3xl">STAGE CLEAR!</p>
      <Stars n={c.stars} size="text-2xl sm:text-3xl" />
      <dl className="grid grid-cols-2 gap-2 font-sans text-xs text-slate-200 sm:text-sm">
        <Stat label="Moves" value={String(c.moves)} />
        <Stat label="Pushes" value={String(c.pushes)} />
        <Stat label="Best Record" value={`${c.bestMoves} / ${c.bestPushes}`} note={c.newBest ? "NEW BEST!" : "moves / pushes"} />
        <Stat label="Target" value={`${stage.par.pushes} pushes`} note="for ★★★" />
      </dl>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={blurAfter(game.nextStage)}>
          {c.last ? "Finish" : "Next Stage"}
        </button>
        <button type="button" className={secondary} onClick={blurAfter(game.restart)}>
          Retry
        </button>
        <button type="button" className={ghost} onClick={blurAfter(() => game.setScreen("select"))}>
          Stage Select
        </button>
      </div>
    </Overlay>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-slate-800/80 px-3 py-2">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-sm text-white">{value}</dd>
      {note && <dd className="text-[10px] text-amber-200">{note}</dd>}
    </div>
  );
}

function Finale({ game }: { game: CargoApi }) {
  const recs = STAGES.map((s) => game.progress.records[s.id]).filter(Boolean);
  const moves = recs.reduce((a, r) => a + r.bestMoves, 0);
  const pushes = recs.reduce((a, r) => a + r.bestPushes, 0);
  const stars = recs.reduce((a, r) => a + r.stars, 0);
  return (
    <Overlay>
      <p className="animate-pulse text-xl text-emerald-300 sm:text-3xl">WAREHOUSE RESTORED!</p>
      <p className="max-w-sm font-sans text-xs leading-5 text-slate-200 sm:text-sm">Every belt is humming, every lamp is green. The little robot has brought the whole warehouse back online.</p>
      <dl className="grid grid-cols-3 gap-2 font-sans text-xs text-slate-200 sm:text-sm">
        <Stat label="Stages" value={`${recs.length} / ${STAGES.length}`} />
        <Stat label="Stars" value={`${stars} / ${STAGES.length * 3}`} />
        <Stat label="Best Total" value={`${moves} / ${pushes}`} note="moves / pushes" />
      </dl>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={blurAfter(() => game.openStage(0, true))} disabled={!allCleared(game.progress)}>
          Play Again
        </button>
        <button type="button" className={secondary} onClick={blurAfter(() => game.setScreen("select"))}>
          Stage Select
        </button>
      </div>
    </Overlay>
  );
}
