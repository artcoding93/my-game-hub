"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { TIME_SCALES, VIEW } from "./config";
import type { HoldAction } from "./input";
import { TEST_SPOTS } from "./level";
import { useShadowGame, type ShadowGameApi } from "./useShadowGame";

/**
 * Shadow of the Citadel — 캐릭터 움직임 프로토타입 (Canvas 2D, 게임 엔진 없음).
 * - 장면·캐릭터: 캔버스 (render/)
 * - 디버그 패널·일시정지·터치 버튼: React (초당 10번 갱신되는 값만 구독)
 * 이 컴포넌트 안(게임 플레이 영역)에는 광고를 넣지 않는다.
 */
export default function ShadowGame() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useShadowGame(rootRef, canvasRef);
  return (
    <div
      ref={rootRef}
      className="mx-auto flex w-full max-w-5xl flex-col gap-2 rounded-2xl bg-stone-950 p-2 text-stone-100 shadow-[0_0_0_3px_#44342a,0_0_30px_rgba(234,140,60,0.15)] select-none sm:p-3"
    >
      <div className="relative overflow-hidden rounded-lg">
        <canvas
          ref={canvasRef}
          width={VIEW.width}
          height={VIEW.height}
          className="block aspect-video w-full touch-none bg-black"
          aria-label="Shadow of the Citadel 움직임 테스트 공간"
        />
        <p className="pointer-events-none absolute top-2 left-3 text-[10px] tracking-[0.2em] text-amber-200/70 uppercase sm:text-xs">
          Shadow of the Citadel · Prototype
        </p>
        {game.hud.paused && <PauseOverlay game={game} />}
      </div>
      <Toolbar game={game} />
      <TouchControls game={game} />
      {game.debugOpen && <DebugPanel game={game} />}
    </div>
  );
}

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-md border px-3 text-xs transition-colors active:translate-y-px disabled:opacity-40";
const ghost = `${btn} border-stone-600 text-stone-200 hover:bg-stone-800`;
const on = `${btn} border-amber-400 bg-amber-400/15 text-amber-100`;

/** 버튼을 눌러도 포커스가 남지 않게 한다 (Space가 버튼을 다시 누르지 않도록) */
function blurAfter(fn: () => void) {
  return (e: { currentTarget: HTMLElement }) => {
    fn();
    e.currentTarget.blur();
  };
}

function PauseOverlay({ game }: { game: ShadowGameApi }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
      <p className="text-lg tracking-widest text-amber-100">일시정지</p>
      <button type="button" className={on} onClick={blurAfter(game.togglePause)}>
        계속하기 (P)
      </button>
    </div>
  );
}

function Toolbar({ game }: { game: ShadowGameApi }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={game.hud.paused ? on : ghost} onClick={blurAfter(game.togglePause)}>
        {game.hud.paused ? "계속" : "일시정지"}
      </button>
      <button type="button" className={ghost} onClick={blurAfter(() => game.reset())}>
        리셋 (R)
      </button>
      <button type="button" className={game.debugOpen ? on : ghost} aria-pressed={game.debugOpen} onClick={blurAfter(() => game.setDebugOpen((v) => !v))}>
        디버그 패널 (`)
      </button>
      <p className="ml-auto hidden text-[11px] leading-5 text-stone-400 md:block">
        ←→/AD 이동 · Shift 달리기 · Space 점프 · ↑/W 올라오기 · ↓/S 손 놓기 · R 리셋 · P/Esc 일시정지
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded bg-stone-900 px-2 py-1">
      <dt className="text-stone-400">{label}</dt>
      <dd className="font-mono text-stone-100 tabular-nums">{children}</dd>
    </div>
  );
}

function DebugPanel({ game }: { game: ShadowGameApi }) {
  const { debug, hud, flags } = game;
  const yes = (v: boolean) => <span className={v ? "text-emerald-300" : "text-stone-500"}>{v ? "예" : "아니오"}</span>;
  return (
    <section aria-label="애니메이션 디버그 패널" className="grid gap-3 rounded-lg border border-stone-800 bg-stone-900/60 p-2 text-xs sm:grid-cols-[1fr_1.3fr]">
      <dl className="grid grid-cols-2 gap-1">
        <Row label="상태">{debug.state}</Row>
        <Row label="애니메이션">{debug.anim}</Row>
        <Row label="속도 x">{debug.vx.toFixed(0)}</Row>
        <Row label="속도 y">{debug.vy.toFixed(0)}</Row>
        <Row label="지면 접촉">{yes(debug.grounded)}</Row>
        <Row label="난간 감지">{yes(debug.ledge)}</Row>
        <Row label="FPS">{debug.fps.toFixed(0)}</Row>
        <Row label="올라오기">{debug.climb > 0 ? `${Math.round(debug.climb * 100)}%` : "-"}</Row>
      </dl>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-stone-400">재생 속도</span>
          {TIME_SCALES.map((s) => (
            <button key={s} type="button" className={hud.timeScale === s ? on : ghost} aria-pressed={hud.timeScale === s} onClick={blurAfter(() => game.controller.setTimeScale(s))}>
              {s}x
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-stone-400">표시</span>
          <button type="button" className={flags.hitbox ? on : ghost} aria-pressed={flags.hitbox} onClick={blurAfter(() => game.toggleFlag("hitbox"))}>
            충돌 박스 (H)
          </button>
          <button type="button" className={flags.ledges ? on : ghost} aria-pressed={flags.ledges} onClick={blurAfter(() => game.toggleFlag("ledges"))}>
            난간 감지 영역 (L)
          </button>
          <button type="button" className={flags.skeleton ? on : ghost} aria-pressed={flags.skeleton} onClick={blurAfter(() => game.toggleFlag("skeleton"))}>
            골격 (K)
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 text-stone-400">테스트 위치</span>
          {TEST_SPOTS.map((s) => (
            <button key={s.key} type="button" className={hud.spot === s.key ? on : ghost} onClick={blurAfter(() => game.reset(s.key))} title={`${s.key}번 키`}>
              {s.key}. {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

const TOUCH: { action: HoldAction; label: string }[] = [
  { action: "left", label: "◀" },
  { action: "right", label: "▶" },
  { action: "run", label: "RUN" },
  { action: "down", label: "▼" },
  { action: "up", label: "▲" },
  { action: "jump", label: "JUMP" },
];

/** 터치 기기 전용 버튼: 누르고 있는 동안 동작 (여러 버튼 동시 입력 가능) */
function TouchControls({ game }: { game: ShadowGameApi }) {
  const { input } = game.controller;
  const bind = (action: HoldAction) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      input.press(`touch-${e.pointerId}`, action);
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => input.release(`touch-${e.pointerId}`),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => input.release(`touch-${e.pointerId}`),
  });
  return (
    <div className="hidden grid-cols-6 gap-1.5 pointer-coarse:grid" aria-label="터치 조작">
      {TOUCH.map((t) => (
        <button key={t.action} type="button" className={`${ghost} min-h-12 touch-none text-sm`} {...bind(t.action)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
