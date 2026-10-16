"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { GAME_CONFIG, guardSpeedMultiplier } from "./config";
import type { GoldEscapeController, HudState } from "./controller";
import type { Direction } from "./types";
import { useGoldEscape } from "./useGoldEscape";

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

/**
 * Gold Escape 화면.
 * - 게임 월드: Phaser 캔버스 (render/). Phaser는 브라우저 전용이므로 effect 안에서 동적 import한다.
 * - HUD·안내 오버레이·터치 버튼: React
 * - 규칙: logic/ (순수 TypeScript)
 */
export default function GoldEscapeGame() {
  const { controller, hud, sfxOn, musicOn, toggleSfx, toggleMusic } = useGoldEscape();
  const canvasParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = canvasParentRef.current;
    if (!parent) return;
    let cancelled = false;
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;

    import("./render/createPhaserGame").then(({ createPhaserGame }) => {
      if (!cancelled) game = createPhaserGame(parent, controller);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
    };
  }, [controller]);

  return (
    <div
      className={`${arcadeFont.className} mx-auto flex w-full max-w-[calc((100dvh_-_15rem)*1.75)] min-w-0 flex-col gap-3 rounded-2xl bg-black p-2 text-white shadow-[0_0_0_4px_#713f12,0_0_32px_rgba(250,204,21,0.2)] sm:p-3`}
    >
      <Hud hud={hud} />

      <div className="relative aspect-[28/16] w-full overflow-hidden border-2 border-yellow-800 bg-[#06070d]">
        <div ref={canvasParentRef} className="absolute inset-0 touch-none select-none" />
        <Overlay hud={hud} onPrimary={() => controller.primaryAction()} />
      </div>

      <ActionBar
        hud={hud}
        controller={controller}
        sound={{ sfxOn, musicOn, toggleSfx, toggleMusic }}
      />
      <TouchControls controller={controller} />
    </div>
  );
}

function Hud({ hud }: { hud: HudState }) {
  const items = [
    { label: "SCORE", value: pad(hud.score, 6) },
    { label: "HI-SCORE", value: pad(hud.highScore, 6), accent: "text-yellow-300" },
    { label: "LIVES", value: "♥".repeat(Math.max(hud.lives, 0)) || "-", accent: "text-rose-400" },
    { label: "ROUND", value: pad(hud.round, 2) },
    { label: "STAGE", value: `${hud.stage}/3` },
    { label: "GOLD", value: hud.escapeRevealed ? "EXIT!" : pad(hud.goldLeft, 2), accent: hud.escapeRevealed ? "text-green-400" : "text-yellow-300" },
  ];
  return (
    <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-center text-[8px] leading-relaxed sm:grid-cols-6 sm:text-[10px]" aria-live="polite">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-orange-500">{item.label}</div>
          <div className={`tabular-nums ${item.accent ?? ""}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function OverlayBox({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function Overlay({ hud, onPrimary }: { hud: HudState; onPrimary: () => void }) {
  const speedUp = Math.round((guardSpeedMultiplier(hud.round) - 1) * 100);

  switch (hud.phase) {
    case "ready":
      return (
        <OverlayBox onClick={onPrimary}>
          <p className="text-xl text-yellow-300 sm:text-3xl">GOLD ESCAPE</p>
          <p className="animate-pulse text-[10px] sm:text-sm">PRESS START</p>
          <KeyGuide />
        </OverlayBox>
      );
    case "stageIntro":
      return (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 text-center">
          <p className="bg-black/70 px-3 py-2 text-xs sm:text-lg">
            ROUND {hud.round} · STAGE {hud.stage}
          </p>
          {hud.round > 1 && (
            <p className="bg-black/70 px-2 py-1 font-sans text-xs text-rose-300">경비원 속도 +{speedUp}%</p>
          )}
        </div>
      );
    case "paused":
      return (
        <OverlayBox onClick={onPrimary}>
          <p className="text-xl text-yellow-300 sm:text-3xl">PAUSED</p>
          <p className="font-sans text-xs text-zinc-300 sm:text-sm">P · Enter · 화면 탭으로 계속하기</p>
        </OverlayBox>
      );
    case "stageClear":
      return (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 text-center">
          <p className="bg-black/70 px-3 py-2 text-sm text-green-400 sm:text-2xl">STAGE CLEAR!</p>
          <p className="bg-black/70 px-2 py-1 text-[10px] text-yellow-300 sm:text-xs">
            +{GAME_CONFIG.score.stageClear.toLocaleString()}
          </p>
        </div>
      );
    case "gameOver":
      return (
        <OverlayBox onClick={onPrimary}>
          <p className="text-xl text-rose-500 sm:text-3xl">GAME OVER</p>
          <p className="text-[10px] sm:text-sm">SCORE {pad(hud.score, 6)}</p>
          {hud.score > 0 && hud.score >= hud.highScore && (
            <p className="animate-pulse text-[10px] text-yellow-300 sm:text-sm">NEW HI-SCORE!</p>
          )}
          <p className="font-sans text-xs text-zinc-300 sm:text-sm">Enter · Space · 화면 탭으로 다시 시작</p>
        </OverlayBox>
      );
    default:
      return null;
  }
}

function KeyGuide() {
  return (
    <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-left font-sans text-[10px] text-zinc-300 sm:text-xs">
      <dt className="text-yellow-200">← →</dt>
      <dd>좌우 이동 · 로프 이동</dd>
      <dt className="text-yellow-200">↑ ↓</dt>
      <dd>사다리 오르내리기 · 로프에서 ↓ 낙하</dd>
      <dt className="text-yellow-200">Z / X</dt>
      <dd>왼쪽 / 오른쪽 아래 벽돌 파기</dd>
      <dt className="text-yellow-200">P</dt>
      <dd>일시정지</dd>
      <dt className="text-yellow-200">R</dt>
      <dd>갇혔을 때 다시 시작 (목숨 -1)</dd>
    </dl>
  );
}

const actionButtonClass =
  "h-10 min-w-24 border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px disabled:opacity-30 sm:text-[10px]";

interface SoundControls {
  sfxOn: boolean;
  musicOn: boolean;
  toggleSfx: () => void;
  toggleMusic: () => void;
}

function ActionBar({ hud, controller, sound }: { hud: HudState; controller: GoldEscapeController; sound: SoundControls }) {
  const canPause = hud.phase === "playing" || hud.phase === "stageIntro" || hud.phase === "paused";
  const showStart = hud.phase === "ready" || hud.phase === "gameOver";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {showStart ? (
        <button
          type="button"
          onClick={() => controller.primaryAction()}
          className={`${actionButtonClass} border-yellow-400 bg-yellow-400 text-black hover:bg-yellow-300`}
        >
          {hud.phase === "ready" ? "Start" : "Restart"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => controller.togglePause()}
          disabled={!canPause}
          className={`${actionButtonClass} border-yellow-400 text-yellow-300 hover:bg-yellow-400/10`}
        >
          {hud.phase === "paused" ? "Resume" : "Pause"}
        </button>
      )}
      <SoundToggle kind="sfx" on={sound.sfxOn} onToggle={sound.toggleSfx} />
      <SoundToggle kind="music" on={sound.musicOn} onToggle={sound.toggleMusic} />
      <p className="hidden font-sans text-xs text-zinc-400 pointer-fine:block">
        ←→ 이동 · ↑↓ 사다리 · Z/X 파기 · P 일시정지 · R 재시작(목숨 -1)
      </p>
    </div>
  );
}

const SOUND_LABELS = {
  sfx: { on: "효과음 끄기", off: "효과음 켜기" },
  music: { on: "배경음악 끄기", off: "배경음악 켜기" },
} as const;

/** 효과음(스피커)·배경음악(음표) 토글. 기본 꺼짐이며 시작 전·플레이 중·게임 오버 모두에서 보인다. */
function SoundToggle({ kind, on, onToggle }: { kind: "sfx" | "music"; on: boolean; onToggle: () => void }) {
  const label = SOUND_LABELS[kind][on ? "on" : "off"];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center border-2 transition-colors active:translate-y-px ${
        on ? "border-yellow-400 text-yellow-300 hover:bg-yellow-400/10" : "border-zinc-600 text-zinc-500 hover:bg-zinc-500/10"
      }`}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor" shapeRendering="crispEdges">
        {kind === "sfx" ? (
          <>
            {/* 픽셀 스피커 */}
            <path d="M3 9h4l5-5h2v16h-2l-5-5H3z" />
            {on ? (
              <path d="M16 8h2v8h-2zM19 5h2v14h-2z" />
            ) : (
              <path d="M16 9h2v2h-2zM18 11h2v2h-2zM20 9h2v2h-2zM16 13h2v2h-2zM20 13h2v2h-2z" />
            )}
          </>
        ) : (
          <>
            {/* 픽셀 8분음표 두 개 */}
            <path d="M8 4h12v3H11v10H8zM17 7h3v8h-3z" />
            <path d="M4 15h7v5H4zM13 13h7v5h-7z" />
            {!on && <path d="M2 2h3v3H2zM5 5h3v3H5zM19 19h3v3h-3zM16 16h3v3h-3z" />}
          </>
        )}
      </svg>
    </button>
  );
}

/** 터치 기기 전용 조작 버튼. 누르고 있는 동안 이동하고, 파기 버튼은 누를 때마다 한 번 판다. */
function TouchControls({ controller }: { controller: GoldEscapeController }) {
  const hold = (direction: Direction) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      controller.input.press(direction);
    },
    onPointerUp: () => controller.input.release(direction),
    onPointerCancel: () => controller.input.release(direction),
    onLostPointerCapture: () => controller.input.release(direction),
  });

  const pad = "flex h-14 w-14 items-center justify-center rounded-xl border-2 border-zinc-600 bg-zinc-900 text-lg text-zinc-100 active:bg-zinc-700 select-none touch-none";
  const dig = "flex h-14 w-16 flex-col items-center justify-center rounded-xl border-2 border-orange-500 bg-orange-950 text-[9px] text-orange-200 active:bg-orange-800 select-none touch-none";

  return (
    <div className="hidden items-end justify-between gap-4 pt-1 pointer-coarse:flex" aria-label="터치 조작">
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        <span />
        <button type="button" aria-label="위" className={pad} {...hold("up")}>▲</button>
        <span />
        <button type="button" aria-label="왼쪽" className={pad} {...hold("left")}>◀</button>
        <span />
        <button type="button" aria-label="오른쪽" className={pad} {...hold("right")}>▶</button>
        <span />
        <button type="button" aria-label="아래" className={pad} {...hold("down")}>▼</button>
        <span />
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="왼쪽 아래 파기"
            className={dig}
            onPointerDown={(event) => {
              event.preventDefault();
              controller.input.dig(-1);
            }}
          >
            <span className="text-base">◣</span>DIG Z
          </button>
          <button
            type="button"
            aria-label="오른쪽 아래 파기"
            className={dig}
            onPointerDown={(event) => {
              event.preventDefault();
              controller.input.dig(1);
            }}
          >
            <span className="text-base">◢</span>DIG X
          </button>
        </div>
      </div>
    </div>
  );
}
