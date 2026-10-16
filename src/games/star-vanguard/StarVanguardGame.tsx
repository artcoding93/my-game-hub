"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { GAME_CONFIG } from "./config";
import type { HudState, StarVanguardController } from "./controller";
import { useStarVanguard } from "./useStarVanguard";

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

/**
 * Star Vanguard 화면.
 * - 게임 월드: Phaser 캔버스 (render/). Phaser는 브라우저 전용이므로 effect 안에서 동적 import한다.
 * - HUD·안내 오버레이·터치 버튼: React
 * - 규칙: logic/ (순수 TypeScript)
 */
export default function StarVanguardGame() {
  const { controller, hud, sound, soundOn, toggleSound, musicOn, toggleMusic, primaryAction } = useStarVanguard();
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
      className={`${arcadeFont.className} mx-auto flex w-full max-w-[min(30rem,max(17rem,calc((100dvh_-_15rem)*0.75)))] min-w-0 flex-col gap-2 rounded-2xl bg-black p-2 text-white shadow-[0_0_0_4px_#3b0764,0_0_32px_rgba(168,85,247,0.25)] pointer-coarse:max-w-[min(30rem,max(17rem,calc((100dvh_-_21rem)*0.75)))] sm:p-3`}
      onPointerDown={() => sound.unlock()}
    >
      <Hud hud={hud} />

      <div className="relative aspect-[3/4] w-full overflow-hidden border-2 border-indigo-900 bg-[#03030a]">
        <div ref={canvasParentRef} className="absolute inset-0 touch-none select-none" />
        <Overlay hud={hud} onPrimary={primaryAction} />
      </div>

      <ActionBar
        hud={hud}
        controller={controller}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        musicOn={musicOn}
        onToggleMusic={toggleMusic}
      />
      <TouchControls controller={controller} />
    </div>
  );
}

function Hud({ hud }: { hud: HudState }) {
  const items = [
    { label: "SCORE", value: pad(hud.score, 6) },
    { label: "HIGH SCORE", value: pad(hud.highScore, 6), accent: "text-amber-300" },
    { label: "LIVES", value: "▲".repeat(Math.max(hud.lives, 0)) || "-", accent: "text-cyan-300" },
    { label: "WAVE", value: pad(hud.wave, 2), accent: hud.bossWave ? "text-fuchsia-400" : undefined },
  ];
  const effects = [
    hud.rapidLeft > 0 && { key: "rapid", label: `RAPID ${hud.rapidLeft}`, className: "text-orange-400" },
    hud.doubleLeft > 0 && { key: "double", label: `DOUBLE ${hud.doubleLeft}`, className: "text-cyan-300" },
    hud.shield && { key: "shield", label: "SHIELD", className: "text-green-400" },
  ].filter((effect): effect is { key: string; label: string; className: string } => Boolean(effect));

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-4 gap-x-1 text-center text-[7px] leading-relaxed sm:text-[9px]" aria-live="polite">
        {items.map((item) => (
          <div key={item.label}>
            <div className="text-violet-400">{item.label}</div>
            <div className={`tabular-nums ${item.accent ?? ""}`}>{item.value}</div>
          </div>
        ))}
      </div>
      {/* 파워업 표시줄: 비어 있어도 높이를 유지해 화면이 흔들리지 않게 한다. */}
      <div className="flex h-3 items-center justify-center gap-3 text-[7px] sm:text-[8px]">
        {effects.map((effect) => (
          <span key={effect.key} className={effect.className}>
            {effect.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function OverlayBox({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-4 text-center"
      onClick={onClick}
    >
      {children}
    </div>
  );
}

const overlayButton =
  "min-h-11 min-w-40 border-2 px-4 text-[10px] uppercase tracking-wider transition-colors active:translate-y-px sm:text-xs";

function Title() {
  return (
    <p className="bg-linear-to-b from-cyan-200 via-sky-400 to-fuchsia-500 bg-clip-text text-2xl leading-tight text-transparent drop-shadow-[0_0_10px_rgba(168,85,247,0.6)] sm:text-3xl">
      STAR
      <br />
      VANGUARD
    </p>
  );
}

function Overlay({ hud, onPrimary }: { hud: HudState; onPrimary: () => void }) {
  const [showHelp, setShowHelp] = useState(false);

  switch (hud.phase) {
    case "ready":
      return showHelp ? (
        <OverlayBox>
          <HowToPlay />
          <button
            type="button"
            onClick={() => setShowHelp(false)}
            className={`${overlayButton} border-violet-400 text-violet-200 hover:bg-violet-400/10`}
          >
            Back
          </button>
        </OverlayBox>
      ) : (
        <OverlayBox>
          <Title />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onPrimary}
              className={`${overlayButton} border-cyan-300 bg-cyan-300 text-black hover:bg-cyan-200`}
            >
              Start Game
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className={`${overlayButton} border-violet-400 text-violet-200 hover:bg-violet-400/10`}
            >
              How to Play
            </button>
          </div>
          <p className="font-sans text-[11px] text-zinc-400">Enter 또는 Space로 바로 시작</p>
        </OverlayBox>
      );
    case "waveIntro":
      return (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 text-center">
          <p className="bg-black/60 px-3 py-2 text-sm sm:text-xl">WAVE {hud.wave}</p>
          {hud.bossWave && (
            <p className="animate-pulse bg-black/60 px-2 py-1 text-[9px] text-fuchsia-400 sm:text-xs">
              WARNING: COMMAND CORE
            </p>
          )}
        </div>
      );
    case "waveClear":
      return (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 text-center">
          <p className="bg-black/60 px-3 py-2 text-sm text-cyan-300 sm:text-xl">WAVE CLEAR</p>
          <p className="bg-black/60 px-2 py-1 text-[9px] text-amber-300 sm:text-xs">+{hud.clearBonus.toLocaleString()}</p>
          {hud.clearBonus > GAME_CONFIG.score.waveClear && (
            <p className="bg-black/60 px-2 py-1 text-[8px] text-green-400 sm:text-[10px]">SURVIVAL BONUS</p>
          )}
        </div>
      );
    case "paused":
      return (
        <OverlayBox>
          <p className="text-xl text-cyan-300 sm:text-2xl">PAUSED</p>
          <button
            type="button"
            onClick={onPrimary}
            className={`${overlayButton} border-cyan-300 bg-cyan-300 text-black hover:bg-cyan-200`}
          >
            Resume
          </button>
          <p className="font-sans text-xs text-zinc-400">P · Enter로 계속하기</p>
        </OverlayBox>
      );
    case "gameOver": {
      const newRecord = hud.score > 0 && hud.score >= hud.highScore;
      return (
        <OverlayBox>
          <p className="text-xl text-rose-500 sm:text-3xl">GAME OVER</p>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-[9px] sm:text-xs">
            <dt className="text-violet-400">FINAL SCORE</dt>
            <dd className="tabular-nums">{pad(hud.score, 6)}</dd>
            <dt className="text-violet-400">HIGH SCORE</dt>
            <dd className="tabular-nums text-amber-300">{pad(hud.highScore, 6)}</dd>
          </dl>
          {newRecord && <p className="animate-pulse text-[9px] text-amber-300 sm:text-xs">NEW HIGH SCORE!</p>}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onPrimary}
              className={`${overlayButton} border-cyan-300 bg-cyan-300 text-black hover:bg-cyan-200`}
            >
              Restart
            </button>
            <Link
              href="/#games"
              className={`${overlayButton} flex items-center justify-center border-violet-400 text-violet-200 hover:bg-violet-400/10`}
            >
              Back to Games
            </Link>
          </div>
        </OverlayBox>
      );
    }
    default:
      return null;
  }
}

function HowToPlay() {
  const enemies = [
    { name: "Scout Drone", color: "text-sky-400", text: "100점 · 느린 기본형" },
    { name: "Interceptor", color: "text-fuchsia-400", text: "200점 · 빠른 급강하" },
    { name: "Armored Sentinel", color: "text-orange-400", text: "400점 · 3발 필요, 사격 잦음" },
    { name: "Command Core", color: "text-purple-300", text: "1,000점 · 5웨이브마다 보스" },
  ];
  const items = [
    { name: "R", color: "text-orange-400", text: "Rapid Fire 8초" },
    { name: "D", color: "text-cyan-300", text: "Double Shot 10초" },
    { name: "S", color: "text-green-400", text: "Shield 1회 방어" },
    { name: "+", color: "text-pink-400", text: "Extra Life (최대 5)" },
  ];
  return (
    <div className="flex w-full max-w-xs flex-col gap-3 text-left font-sans text-[11px] leading-snug text-zinc-200 sm:text-xs">
      <p className={`${arcadeFont.className} text-center text-xs text-cyan-300`}>HOW TO PLAY</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-cyan-200">← → / A D</dt>
        <dd>좌우 이동</dd>
        <dt className="text-cyan-200">Space</dt>
        <dd>레이저 발사 (누르고 있으면 연사)</dd>
        <dt className="text-cyan-200">P · M</dt>
        <dd>일시정지 · 사운드 켜기/끄기</dd>
      </dl>
      <ul className="flex flex-col gap-0.5">
        {enemies.map((enemy) => (
          <li key={enemy.name}>
            <span className={enemy.color}>{enemy.name}</span> {enemy.text}
          </li>
        ))}
      </ul>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        {items.map((item) => (
          <li key={item.name}>
            <span className={`${item.color} font-bold`}>[{item.name}]</span> {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

const actionButtonClass =
  "h-11 min-w-20 border-2 px-3 text-[8px] uppercase tracking-wider transition-colors active:translate-y-px disabled:opacity-30 sm:text-[9px]";

function ActionBar({
  hud,
  controller,
  soundOn,
  onToggleSound,
  musicOn,
  onToggleMusic,
}: {
  hud: HudState;
  controller: StarVanguardController;
  soundOn: boolean;
  onToggleSound: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
}) {
  const canPause = hud.phase === "playing" || hud.phase === "waveIntro" || hud.phase === "waveClear" || hud.phase === "paused";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => controller.togglePause()}
        disabled={!canPause}
        className={`${actionButtonClass} border-cyan-400 text-cyan-300 hover:bg-cyan-400/10`}
      >
        {hud.phase === "paused" ? "Resume" : "Pause"}
      </button>
      <button
        type="button"
        onClick={onToggleSound}
        aria-pressed={soundOn}
        className={`${actionButtonClass} border-violet-400 text-violet-200 hover:bg-violet-400/10`}
      >
        Sound {soundOn ? "On" : "Off"}
      </button>
      <MusicToggle on={musicOn} onToggle={onToggleMusic} />
      <p className="hidden w-full text-center font-sans text-xs text-zinc-400 pointer-fine:block">
        ←→/AD 이동 · Space 발사 · P 일시정지 · M 사운드
      </p>
    </div>
  );
}

/** 음표 아이콘 배경음악 토글 (기본 꺼짐). 효과음(Sound) 버튼과 따로 켜고 끈다. */
function MusicToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const label = on ? "배경음악 끄기" : "배경음악 켜기";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center border-2 transition-colors active:translate-y-px ${
        on ? "border-violet-400 text-violet-200 hover:bg-violet-400/10" : "border-zinc-600 text-zinc-500 hover:bg-zinc-500/10"
      }`}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor" shapeRendering="crispEdges">
        {/* 픽셀 8분음표 두 개 */}
        <path d="M8 4h12v3H11v10H8zM17 7h3v8h-3z" />
        <path d="M4 15h7v5H4zM13 13h7v5h-7z" />
        {!on && <path d="M2 2h3v3H2zM5 5h3v3H5zM19 19h3v3h-3zM16 16h3v3h-3z" />}
      </svg>
    </button>
  );
}

/**
 * 터치 기기 전용 조작 버튼. 버튼마다 포인터를 따로 잡으므로 이동과 발사를 동시에 누를 수 있다(멀티터치).
 * 게임 화면 아래에 따로 배치해 손가락이 게임 영역을 가리지 않게 한다.
 */
function TouchControls({ controller }: { controller: StarVanguardController }) {
  const capture = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (source: string, dir: -1 | 1) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      capture(event);
      controller.input.press(source, dir);
    },
    onPointerUp: () => controller.input.release(source),
    onPointerCancel: () => controller.input.release(source),
    onLostPointerCapture: () => controller.input.release(source),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  const fire = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      capture(event);
      controller.input.setFire("touch", true);
    },
    onPointerUp: () => controller.input.setFire("touch", false),
    onPointerCancel: () => controller.input.setFire("touch", false),
    onLostPointerCapture: () => controller.input.setFire("touch", false),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  };

  const padClass =
    "flex h-16 w-20 items-center justify-center rounded-xl border-2 border-cyan-700 bg-zinc-900 text-2xl text-cyan-200 active:bg-cyan-900 select-none touch-none";

  return (
    <div className="hidden items-center justify-between gap-3 pt-1 pointer-coarse:flex" aria-label="터치 조작">
      <div className="flex gap-2">
        <button type="button" aria-label="왼쪽으로 이동" className={padClass} {...move("touch-left", -1)}>
          ◀
        </button>
        <button type="button" aria-label="오른쪽으로 이동" className={padClass} {...move("touch-right", 1)}>
          ▶
        </button>
      </div>
      <button
        type="button"
        aria-label="발사"
        className="flex h-16 w-24 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-950 text-xs text-orange-200 active:bg-orange-800 select-none touch-none"
        {...fire}
      >
        FIRE
      </button>
    </div>
  );
}
