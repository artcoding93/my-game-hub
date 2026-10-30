"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { chainMultiplier, GAME_CONFIG, type GameMode } from "./config";
import type { CascadeController, HudState } from "./controller";
import type { Press } from "./input";
import { CRYSTALS, CrystalCache } from "./render/crystals";
import { BOARD_H, BOARD_W, CascadeRenderer, drawNext, prepareCanvas } from "./render/renderer";
import type { Color } from "./types";
import { SHAKE_FACTOR, useCascadeRush, type ShakeLevel } from "./useCascadeRush";

const NEXT_W = 28;
const NEXT_H = 56;

/**
 * Cascade Rush 화면 (Canvas 2D, 게임 엔진 없음).
 * - 보드·연출: 캔버스 (render/)
 * - 시간·점수판·오버레이·설정·터치 버튼: React
 * - 규칙: logic/ (순수 TypeScript)
 */
export default function CascadeRushGame() {
  const game = useCascadeRush();
  const { controller, hud, audio } = game;
  const boardRef = useRef<HTMLCanvasElement>(null);
  const nextRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const shakeRef = useRef(game.shake);
  useEffect(() => {
    shakeRef.current = game.shake;
  }, [game.shake]);

  // 게임 루프: requestAnimationFrame마다 고정 스텝으로 진행하고 캔버스를 그린다.
  useEffect(() => {
    const renderer = new CascadeRenderer();
    const cache = new CrystalCache();
    const font = arcadeFont.style.fontFamily;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const events = controller.update(dt);
      renderer.handle(events);
      const s = controller.state;
      const board = boardRef.current;
      const ctx = board && prepareCanvas(board, BOARD_W, BOARD_H);
      if (ctx) renderer.render(ctx, s, s.phase === "paused" ? 0 : dt, { shake: SHAKE_FACTOR[shakeRef.current], font, reducedMotion: reduceMotion.matches });
      nextRefs.current.forEach((canvas, i) => {
        const c = canvas && prepareCanvas(canvas, NEXT_W, NEXT_H);
        if (c) drawNext(c, s.phase === "title" ? undefined : s.queue[i], NEXT_W, NEXT_H, cache);
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [controller]);

  const urgent = hud.phase === "playing" && hud.seconds !== null && hud.seconds <= 5;

  return (
    <div
      className={`${arcadeFont.className} relative mx-auto flex w-full max-w-3xl flex-col gap-2 overflow-hidden rounded-2xl bg-linear-to-b from-[#0d0626] via-[#1a0b3b] to-[#2b0f4f] p-2 text-slate-100 select-none sm:p-3 ${urgent ? "shadow-[0_0_0_4px_#e11d48,0_0_36px_rgba(244,63,94,0.55)]" : "shadow-[0_0_0_4px_#4c1d95,0_0_32px_rgba(168,85,247,0.3)]"}`}
      onPointerDown={() => audio.unlock()}
    >
      <TopBar game={game} />
      <div className="flex flex-col gap-2 pointer-coarse:landscape:flex-row pointer-coarse:landscape:items-center pointer-coarse:landscape:justify-center">
        <div className="flex flex-col gap-2">
          <div className="pointer-coarse:landscape:hidden">
            <TimerBar hud={hud} controller={controller} />
          </div>
          {/*
            보드 너비: 화면 폭 − (페이지 여백 + 점수판), 세로는 화면 높이 − (상단 버튼·시간·터치 버튼) 의 절반 중 작은 값.
            모바일 세로 화면에서 점수판을 좁히고 위아래 요소를 줄여 보드를 최대한 크게 쓴다.
          */}
          <div className="flex items-start justify-center gap-1.5 sm:gap-4">
            <div className="relative aspect-[1/2] w-[min(calc(100vw-7.75rem),calc((100dvh-15rem)/2),20rem)] min-w-36 shrink-0 overflow-hidden rounded-lg border-2 border-violet-300/60 shadow-[0_0_0_1px_rgba(232,121,249,0.35),0_0_14px_rgba(196,181,253,0.25)] pointer-coarse:w-[min(calc(100vw-7.75rem),calc((100dvh-11rem)/2),20rem)] pointer-coarse:landscape:w-[min(calc((100dvh-8rem)/2),20rem)] pointer-coarse:landscape:min-w-0">
              <canvas ref={boardRef} className="h-full w-full touch-none" aria-label="Cascade Rush 게임판 (가로 6칸, 세로 12칸)" />
              <Overlay game={game} />
            </div>
            <aside className="flex w-[4.25rem] shrink-0 flex-col gap-1 sm:w-28 sm:gap-1.5" aria-label="점수판">
              {/* 터치 가로 화면: 세로 공간이 부족해 남은 시간을 점수판 맨 위에 둔다 */}
              <div className="hidden pointer-coarse:landscape:block">
                <Stat label={hud.mode === "rush" ? "TIME" : "MODE"} value={hud.mode === "rush" ? String(hud.seconds ?? GAME_CONFIG.rush.startTime) : "ENDLESS"} highlight={hud.seconds !== null && hud.seconds <= 30 && hud.phase === "playing"} />
              </div>
              <Panel label="NEXT">
                <div className="flex items-end justify-center gap-1 sm:gap-2">
                  {[0, 1].map((i) => (
                    <canvas
                      key={i}
                      ref={(el) => {
                        nextRefs.current[i] = el;
                      }}
                      aria-label={hud.next[i] ? `${i === 0 ? "다음" : "그다음"} 크리스털: ${CRYSTALS[hud.next[i][1]].name}, ${CRYSTALS[hud.next[i][0]].name}` : undefined}
                      className={`h-14 w-7 ${i > 0 ? "origin-bottom scale-[0.8]" : ""}`}
                    />
                  ))}
                </div>
              </Panel>
              <Stat label="SCORE">
                <ScoreCounter value={hud.score} />
              </Stat>
              <Stat label="CHAIN" value={hud.chain > 0 ? `${hud.chain} ×${chainMultiplier(hud.chain)}` : "-"} highlight={hud.chain >= 3} />
              <Stat label="MAX CHAIN" value={String(hud.maxChain)} />
              {/* 좁은 화면에서는 생략 (결과 화면에 표시) */}
              <div className="hidden sm:block pointer-coarse:landscape:hidden">
                <Stat label="CRYSTALS" value={String(hud.crystals)} />
              </div>
              <Stat label="SPEED" value={`LV ${hud.speed}`} />
            </aside>
          </div>
        </div>
        <TouchControls controller={controller} hud={hud} />
      </div>
      <p className="hidden text-center font-sans text-xs text-violet-200/80 pointer-fine:block">
        ←→ 이동 · ↓ 빠른 낙하 · ↑/X 시계 회전 · Z 반시계 회전 · Space 즉시 낙하 · P/Esc 일시정지
      </p>
    </div>
  );
}

type GameApi = ReturnType<typeof useCascadeRush>;

/** 점수가 오를 때 숫자가 빠르게 올라가며 합산되는 연출 */
function ScoreCounter({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    let frame = 0;
    const from = shownRef.current;
    if (value < from) {
      shownRef.current = value;
      frame = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(frame);
    }
    const startAt = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - startAt) / 450, 1);
      const v = Math.round(from + (value - from) * (1 - (1 - p) ** 3));
      shownRef.current = v;
      setShown(v);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className={shown < value ? "text-amber-200" : undefined}>{shown.toLocaleString()}</span>;
}

function Stat({ label, value, children, highlight }: { label: string; value?: string; children?: ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-violet-950/60 px-1 py-1 ring-1 ring-violet-300/20 sm:px-1.5">
      <div className="text-[6px] text-fuchsia-300 sm:text-[8px]">{label}</div>
      <div className={`truncate text-[8px] tabular-nums min-[400px]:text-[9px] sm:text-xs ${highlight ? "text-amber-200" : ""}`}>{children ?? value}</div>
    </div>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-violet-950/60 p-1 ring-1 ring-violet-300/20">
      <div className="mb-1 text-[6px] text-fuchsia-300 sm:text-[8px]">{label}</div>
      {children}
    </div>
  );
}

const smallButton =
  "h-11 min-w-11 rounded-md border-2 px-1.5 text-[7px] uppercase tracking-wide transition-colors active:translate-y-px disabled:opacity-30 min-[400px]:px-2 min-[400px]:text-[8px] sm:tracking-wider sm:text-[9px]";

const SHAKE_LABEL: Record<ShakeLevel, string> = { 2: "On", 1: "Low", 0: "Off" };

function TopBar({ game }: { game: GameApi }) {
  const { hud } = game;
  const canPause = hud.phase === "playing" || hud.phase === "paused" || hud.phase === "ready";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* 좁은 화면에서는 제목을 빼고 버튼 네 개를 한 줄에 둔다 (제목은 시작 화면에 있음) */}
      <p className="hidden bg-linear-to-b from-white to-fuchsia-300 bg-clip-text text-xs text-transparent min-[480px]:block sm:text-base">CASCADE RUSH</p>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-1 min-[400px]:gap-1.5">
        <button type="button" onClick={game.togglePause} disabled={!canPause} className={`${smallButton} border-fuchsia-300/70 text-fuchsia-100 hover:bg-fuchsia-300/10`}>
          {hud.phase === "paused" ? "Resume" : "Pause"}
        </button>
        <SettingButtons game={game} />
      </div>
    </div>
  );
}

function SettingButtons({ game }: { game: GameApi }) {
  return (
    <>
      <Toggle on={game.soundOn} onToggle={game.toggleSound} label={`SFX ${game.soundOn ? "On" : "Off"}`} aria={game.soundOn ? "효과음 끄기" : "효과음 켜기"} />
      <Toggle on={game.musicOn} onToggle={game.toggleMusic} label={`BGM ${game.musicOn ? "On" : "Off"}`} aria={game.musicOn ? "배경음악 끄기" : "배경음악 켜기"} />
      <Toggle
        on={game.shake > 0}
        onToggle={game.cycleShake}
        label={`Shake ${SHAKE_LABEL[game.shake]}`}
        aria={`화면 흔들림: ${{ 2: "보통", 1: "약하게", 0: "끔" }[game.shake]} (누르면 바뀜)`}
      />
    </>
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
      {label}
    </button>
  );
}

/** 남은 시간 (Rush) 또는 Endless 표시. 30초 이하 강조, 10초 이하 깜빡임, 시간 보너스 +N SEC */
function TimerBar({ hud, controller }: { hud: HudState; controller: CascadeController }) {
  const [bonus, setBonus] = useState<{ seconds: number; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = controller.onEvents((events) => {
      for (const e of events) {
        if (e.type === "timeBonus") {
          setBonus({ seconds: e.seconds, id: performance.now() });
          clearTimeout(timer);
          timer = setTimeout(() => setBonus(null), 1300);
        } else if (e.type === "start") setBonus(null);
      }
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [controller]);

  if (hud.mode === "endless") {
    return (
      <div className="flex h-8 items-center justify-center gap-3 sm:h-10">
        <span className="text-[8px] text-fuchsia-300 sm:text-[10px]">ENDLESS</span>
        <span className="text-lg text-violet-100 sm:text-xl">∞</span>
      </div>
    );
  }
  const seconds = hud.seconds ?? GAME_CONFIG.rush.startTime;
  const active = hud.phase === "playing";
  const color = !active || seconds > 30 ? "text-white" : seconds > 10 ? "text-amber-300" : "text-rose-400";
  const pct = Math.min(seconds / GAME_CONFIG.rush.maxTime, 1) * 100;
  return (
    <div className="relative flex h-8 items-center gap-2 sm:h-10" role="timer" aria-label={`남은 시간 ${seconds}초`}>
      <span className="text-[8px] text-fuchsia-300 sm:text-[10px]">TIME</span>
      <span className={`w-14 text-center text-lg tabular-nums sm:text-xl ${color} ${active && seconds <= 10 ? "animate-pulse" : ""}`}>{seconds}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-violet-950 ring-1 ring-violet-300/30">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${seconds > 30 ? "bg-linear-to-r from-fuchsia-400 to-sky-300" : seconds > 10 ? "bg-amber-300" : "bg-rose-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {bonus && (
        <span key={bonus.id} className="absolute top-1/2 right-1 -translate-y-1/2 rounded bg-violet-950/80 px-1 text-[10px] text-emerald-300 drop-shadow-[0_0_6px_rgba(110,231,183,0.8)] sm:text-xs" aria-live="polite">
          +{bonus.seconds} SEC
        </span>
      )}
    </div>
  );
}

function OverlayBox({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center-safe gap-2 overflow-y-auto bg-[#0d0626]/85 p-2 text-center">
      {children}
    </div>
  );
}

const bigButton = "min-h-11 w-full max-w-48 rounded-md border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px sm:text-[10px]";
const primary = `${bigButton} border-amber-300 bg-amber-300 text-violet-950 hover:bg-amber-200`;
const secondary = `${bigButton} border-fuchsia-300/70 text-fuchsia-100 hover:bg-fuchsia-300/10`;

function Logo() {
  return (
    <div className="flex flex-col items-center gap-1">
      <CrystalRow />
      <p className="bg-linear-to-b from-white via-fuchsia-200 to-violet-400 bg-clip-text text-lg leading-tight text-transparent drop-shadow-[0_0_10px_rgba(232,121,249,0.6)] sm:text-2xl">
        CASCADE
        <br />
        RUSH
      </p>
      <p className="text-[6px] tracking-[0.2em] text-amber-200/90 sm:text-[8px]">CHAIN REACTION</p>
    </div>
  );
}

/** 다섯 크리스털 그림 (시작·설명 화면) */
function CrystalRow({ size = 22 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas && prepareCanvas(canvas, size * 5 + 16, size);
    if (!ctx) return;
    const cache = new CrystalCache();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    ([1, 2, 3, 4, 5] as Color[]).forEach((c, i) => ctx.drawImage(cache.get(c, size, dpr), i * (size + 4), 0, size, size));
  }, [size]);
  return <canvas ref={ref} aria-hidden style={{ width: size * 5 + 16, height: size }} />;
}

function ModeButtons({ game }: { game: GameApi }) {
  const options: { mode: GameMode; title: string; desc: string }[] = [
    { mode: "rush", title: "Rush Mode", desc: "120초 · 연쇄로 시간 획득" },
    { mode: "endless", title: "Endless Mode", desc: "시간 제한 없음 · 점점 빨라짐" },
  ];
  return (
    <div className="flex w-full max-w-48 flex-col gap-1.5">
      {options.map((o) => (
        <button key={o.mode} type="button" onClick={() => game.start(o.mode)} className={`${o.mode === game.mode ? primary : secondary} flex flex-col items-center justify-center gap-0.5 py-1`}>
          <span>{o.title}</span>
          <span className="font-sans text-[10px] normal-case tracking-normal opacity-80">{o.desc}</span>
        </button>
      ))}
    </div>
  );
}

function Overlay({ game }: { game: GameApi }) {
  const { hud, records } = game;
  const [help, setHelp] = useState(false);

  if ((hud.phase === "title" || hud.phase === "paused") && help) {
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
          <p className="max-w-52 font-sans text-[11px] leading-snug text-slate-200">같은 색 크리스털 3개를 이어 터뜨리고, 연쇄 반응으로 시간을 버세요!</p>
          <ModeButtons game={game} />
          <button type="button" onClick={() => setHelp(true)} className={secondary}>
            How to Play
          </button>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-left text-[7px] sm:text-[8px]">
            <dt className="text-fuchsia-300">RUSH BEST</dt>
            <dd className="tabular-nums text-amber-200">
              {records.rush.score.toLocaleString()} · {records.rush.maxChain} CHAIN
            </dd>
            <dt className="text-fuchsia-300">ENDLESS BEST</dt>
            <dd className="tabular-nums text-amber-200">
              {records.endless.score.toLocaleString()} · {records.endless.maxChain} CHAIN
            </dd>
            {records.classic && (
              <>
                <dt className="text-violet-300" title="이전 규칙(4개 연결·90초)으로 세운 기록">CLASSIC</dt>
                <dd className="tabular-nums text-violet-200">
                  {records.classic.rush.score.toLocaleString()} / {records.classic.endless.score.toLocaleString()}
                </dd>
              </>
            )}
          </dl>
          <Link href="/" className="min-h-11 content-center font-sans text-[11px] text-violet-200 underline-offset-2 hover:underline">
            ← Back to Game Hub
          </Link>
        </OverlayBox>
      );
    case "paused":
      return (
        <OverlayBox>
          <p className="text-base text-fuchsia-200">PAUSED</p>
          <button type="button" onClick={game.togglePause} className={primary}>
            Resume
          </button>
          <button type="button" onClick={() => game.start(hud.mode)} className={secondary}>
            Restart
          </button>
          <button type="button" onClick={() => setHelp(true)} className={secondary}>
            How to Play
          </button>
          <button type="button" onClick={game.toTitle} className={secondary}>
            Mode Select
          </button>
          <div className="flex flex-wrap justify-center gap-1">
            <SettingButtons game={game} />
          </div>
        </OverlayBox>
      );
    case "over": {
      const best = records[hud.mode];
      return (
        <OverlayBox>
          <p className={`text-base sm:text-xl ${hud.endReason === "time" ? "text-amber-200" : "text-rose-300"}`}>{hud.endReason === "time" ? "TIME UP!" : "GAME OVER"}</p>
          <p className="font-sans text-[11px] text-slate-300">{hud.mode === "rush" ? "Rush Mode" : "Endless Mode"}{hud.endReason === "topout" ? " · 크리스털이 천장에 닿았습니다" : ""}</p>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-left text-[8px] sm:text-[10px]">
            <dt className="text-fuchsia-300">SCORE</dt>
            <dd className="tabular-nums">{hud.score.toLocaleString()}</dd>
            <dt className="text-fuchsia-300">MAX CHAIN</dt>
            <dd className="tabular-nums">{hud.maxChain}</dd>
            <dt className="text-fuchsia-300">CRYSTALS</dt>
            <dd className="tabular-nums">{hud.crystals}</dd>
            <dt className="text-fuchsia-300">BEST</dt>
            <dd className="tabular-nums text-amber-200">{best.score.toLocaleString()}</dd>
            <dt className="text-fuchsia-300">BEST CHAIN</dt>
            <dd className="tabular-nums text-amber-200">{best.maxChain}</dd>
          </dl>
          {game.result?.newBest && <p className="animate-pulse text-[9px] text-amber-200">NEW BEST!</p>}
          <button type="button" onClick={() => game.start(hud.mode)} className={primary}>
            Retry
          </button>
          <button type="button" onClick={game.toTitle} className={secondary}>
            Mode Select
          </button>
        </OverlayBox>
      );
    }
    default:
      return null;
  }
}

function HowToPlay() {
  return (
    <div className="flex w-full max-w-64 flex-col gap-2 text-left font-sans text-[11px] leading-snug text-slate-100">
      <p className={`${arcadeFont.className} text-center text-[9px] text-fuchsia-200`}>HOW TO PLAY</p>
      <div className="flex justify-center">
        <CrystalRow size={18} />
      </div>
      <ul className="list-disc space-y-1 pl-4">
        <li>두 개가 붙은 크리스털이 떨어집니다. 좌우로 옮기고 돌려서 쌓으세요.</li>
        <li>같은 색 3개 이상이 상하좌우로 이어지면 터집니다(대각선 제외). 4개는 ×1.5, 5개 이상은 ×2 점수.</li>
        <li>터진 자리로 위 크리스털이 떨어져 새로 이어지면 연쇄! 연쇄마다 점수 배율이 두 배(×1·×2·×4·×8, 5연쇄 이상 ×16)가 됩니다.</li>
        <li>바닥에 닿은 뒤에도 잠깐(0.6초) 옮기거나 돌릴 수 있습니다.</li>
        <li>Rush: 120초 제한. 3연쇄 +3초, 5연쇄 이상 +5초(최대 150초). 연쇄 중에는 시계가 멈춥니다.</li>
        <li>가운데 위 ✕ 칸이 막히면 Game Over.</li>
      </ul>
      <p className="text-violet-200">
        PC: ←→ 이동 · ↓ 빠른 낙하 · ↑/X 시계 · Z 반시계 · Space 즉시 낙하 · P/Esc 일시정지
      </p>
    </div>
  );
}

/** 누름 표시: React 상태 대신 data-pressed 속성을 바로 바꿔 다시 렌더링 없이 즉시 보이게 한다 */
function setPressed(el: HTMLElement, on: boolean) {
  if (on) el.dataset.pressed = "true";
  else delete el.dataset.pressed;
}

/**
 * 터치 기기 전용 조작 버튼. 버튼마다 포인터를 따로 잡으므로 이동하면서 회전·낙하를 동시에 누를 수 있다(멀티터치).
 * ◀ ▶ ▼는 누르고 있으면 반복되고, 회전은 빠르게 연타한 횟수만큼 처리된다(input.ts). 모두 pointerdown에 바로 반응한다.
 * 이동 · 회전 · 낙하 세 묶음 사이를 넓게 띄워 옆 버튼을 잘못 누르지 않게 한다. 화면 확대·스크롤을 막기 위해 touch-none을 쓴다.
 */
function TouchControls({ controller, hud }: { controller: CascadeController; hud: HudState }) {
  const { input } = controller;
  const playing = hud.phase === "playing";
  const press = (onDown: () => void, onUp?: () => void) => {
    const up = (event: PointerEvent<HTMLButtonElement>) => {
      setPressed(event.currentTarget, false);
      onUp?.();
    };
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setPressed(event.currentTarget, true);
        onDown();
      },
      onPointerUp: up,
      onPointerCancel: up,
      onLostPointerCapture: up,
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    };
  };
  const hold = (source: string, onDown: () => void) => press(onDown, () => input.release(source));
  const tap = (action: Press) => press(() => playing && input.trigger(action));
  const btn =
    "flex h-14 flex-1 items-center justify-center rounded-xl border-2 text-lg select-none touch-none [-webkit-touch-callout:none] transition-transform duration-75 data-[pressed=true]:translate-y-0.5 data-[pressed=true]:scale-95";
  const blue = `${btn} border-violet-300/70 bg-violet-950 text-violet-100 data-[pressed=true]:border-white data-[pressed=true]:bg-violet-600`;
  const warm = `${btn} border-amber-300/80 bg-amber-950 text-amber-100 data-[pressed=true]:border-white data-[pressed=true]:bg-amber-600`;
  const group = "flex flex-1 gap-1.5";

  return (
    <div
      className="hidden touch-none gap-3 pointer-coarse:flex pointer-coarse:landscape:w-36 pointer-coarse:landscape:flex-col"
      aria-label="터치 조작"
    >
      <div className={group}>
        <button type="button" aria-label="왼쪽으로 이동" className={blue} {...hold("t-left", () => input.pressMove("t-left", -1))}>
          ◀
        </button>
        <button type="button" aria-label="오른쪽으로 이동" className={blue} {...hold("t-right", () => input.pressMove("t-right", 1))}>
          ▶
        </button>
      </div>
      <div className={group}>
        <button type="button" aria-label="반시계 방향 회전" className={blue} {...tap("rotateCCW")}>
          <RotateIcon dir={-1} />
        </button>
        <button type="button" aria-label="시계 방향 회전" className={blue} {...tap("rotateCW")}>
          <RotateIcon dir={1} />
        </button>
      </div>
      <div className={group}>
        <button type="button" aria-label="빠른 낙하 (누르고 있기)" className={blue} {...hold("t-soft", () => input.setSoftDrop("t-soft", true))}>
          ▼
        </button>
        <button type="button" aria-label="즉시 낙하" className={`${warm} text-[9px]`} {...tap("hardDrop")}>
          DROP
        </button>
      </div>
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
