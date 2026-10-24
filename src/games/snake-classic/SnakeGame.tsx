"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { arcadeFont } from "@/lib/fonts";
import { BOARD_PIXELS } from "./constants";
import { drawBoard } from "./renderer";
import type { Direction, SnakeState } from "./types";
import { useSnakeGame } from "./useSnakeGame";

function formatScore(value: number) {
  return String(value).padStart(6, "0");
}

/**
 * Snake Classic 화면.
 * 상태·입력은 useSnakeGame, 그리기는 renderer.ts가 담당하고
 * 이 컴포넌트는 점수판·오버레이·버튼 UI만 그린다.
 */
export default function SnakeGame() {
  const { state, start, restart, togglePause, soundOn, toggleSound, musicOn, toggleMusic, turn, onBoardPointerUp } = useSnakeGame();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 고해상도 화면에서 선명하게 보이도록 devicePixelRatio를 반영해 한 번만 크기를 맞춘다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD_PIXELS * dpr;
    canvas.height = BOARD_PIXELS * dpr;
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ctx) ctx.imageSmoothingEnabled = false;
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawBoard(ctx, state);
  }, [state]);

  return (
    <div
      className={`${arcadeFont.className} mx-auto flex w-full max-w-[min(560px,max(320px,calc(100dvh_-_16rem)))] flex-col gap-3 pointer-coarse:max-w-[min(560px,max(240px,calc(100dvh_-_25.8rem)))] pointer-coarse:gap-2 rounded-2xl bg-black p-3 pointer-coarse:p-2 text-white shadow-[0_0_0_4px_#14532d,0_0_32px_rgba(34,197,94,0.25)] sm:p-4`}
    >
      <Scoreboard score={state.score} highScore={state.highScore} length={state.snake.length} />

      <div className="relative touch-none" onPointerUp={onBoardPointerUp}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Snake Classic 게임 보드. 점수 ${state.score}점`}
          className="block aspect-square w-full touch-none select-none border-2 border-green-700 [image-rendering:pixelated]"
        />
        {/* CRT 주사선 효과 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_2px,rgba(0,0,0,0.25)_3px)]"
        />
        <StatusOverlay state={state} />
      </div>

      <Controls
        status={state.status}
        onStart={start}
        onTogglePause={togglePause}
        onRestart={restart}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        musicOn={musicOn}
        onToggleMusic={toggleMusic}
      />

      <DirectionPad onTurn={turn} />
    </div>
  );
}

const PAD_BUTTONS: { direction: Direction; label: string; area: string; arrow: string }[] = [
  { direction: "up", label: "위로", area: "col-start-2 row-start-1", arrow: "▲" },
  { direction: "left", label: "왼쪽으로", area: "col-start-1 row-start-2", arrow: "◀" },
  { direction: "right", label: "오른쪽으로", area: "col-start-3 row-start-2", arrow: "▶" },
  { direction: "down", label: "아래로", area: "col-start-2 row-start-3", arrow: "▼" },
];

/**
 * 모바일 방향 버튼 (터치 기기에서만 보인다). 누르는 순간(pointerdown) 방향을 바꾼다.
 * 반대 방향·연속 입력 처리는 logic.ts의 queueTurn이 맡는다(마지막으로 예약된 방향 기준으로 180도 반전 금지, 최대 2개 예약).
 * 스크롤·확대·텍스트 선택·길게 누르기 메뉴를 막고, iPhone 홈 표시줄 영역(safe-area)만큼 아래 여백을 둔다.
 */
function DirectionPad({ onTurn }: { onTurn: (direction: Direction) => void }) {
  const [pressed, setPressed] = useState<Direction | null>(null);
  const release = () => setPressed(null);
  return (
    <div
      className="mx-auto hidden touch-none grid-cols-3 grid-rows-3 gap-1 pb-[env(safe-area-inset-bottom)] select-none [-webkit-touch-callout:none] pointer-coarse:grid"
      role="group"
      aria-label="방향 버튼"
      onContextMenu={(event) => event.preventDefault()}
    >
      {PAD_BUTTONS.map(({ direction, label, area, arrow }) => (
        <button
          key={direction}
          type="button"
          aria-label={label}
          className={`${area} flex h-14 w-14 touch-none items-center justify-center rounded-xl border-2 font-sans text-2xl transition-colors ${
            pressed === direction ? "border-green-300 bg-green-500 text-black" : "border-green-600 bg-zinc-900 text-green-400"
          }`}
          onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            setPressed(direction);
            onTurn(direction);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
        >
          {arrow}
        </button>
      ))}
    </div>
  );
}

function Scoreboard({ score, highScore, length }: { score: number; highScore: number; length: number }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center text-[10px] leading-relaxed sm:text-xs" aria-live="polite">
      <div>
        <div className="text-red-500">1UP</div>
        <div className="tabular-nums">{formatScore(score)}</div>
      </div>
      <div>
        <div className="text-red-500">HI-SCORE</div>
        <div className="tabular-nums text-yellow-300">{formatScore(highScore)}</div>
      </div>
      <div>
        <div className="text-red-500">LENGTH</div>
        <div className="tabular-nums">{String(length).padStart(3, "0")}</div>
      </div>
    </div>
  );
}

function StatusOverlay({ state }: { state: SnakeState }) {
  if (state.status === "playing") return null;

  const content = {
    ready: {
      title: "SNAKE",
      titleClass: "text-green-400",
      lines: ["PRESS START"],
      hint: "ENTER · SPACE · 방향키로 시작",
    },
    paused: {
      title: "PAUSED",
      titleClass: "text-yellow-300",
      lines: [],
      hint: "SPACE · P 로 계속하기",
    },
    over: {
      title: "GAME OVER",
      titleClass: "text-red-500",
      lines: [`SCORE ${formatScore(state.score)}`, ...(state.isNewHighScore ? ["NEW HI-SCORE!"] : [])],
      hint: "ENTER · SPACE 로 재시작",
    },
    won: {
      title: "YOU WIN!",
      titleClass: "text-green-400",
      lines: [`SCORE ${formatScore(state.score)}`, ...(state.isNewHighScore ? ["NEW HI-SCORE!"] : [])],
      hint: "ENTER · SPACE 로 재시작",
    },
  }[state.status];

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 p-4 text-center">
      <p className={`text-xl sm:text-3xl ${content.titleClass}`}>{content.title}</p>
      {content.lines.map((line) => (
        <p key={line} className="animate-pulse text-xs sm:text-sm">
          {line}
        </p>
      ))}
      {/* 한글은 픽셀 폰트에 없으므로 기본 글꼴로 표시 */}
      <p className="font-sans text-xs text-zinc-400 sm:text-sm">{content.hint}</p>
    </div>
  );
}

const buttonClass =
  "h-11 min-w-28 pointer-coarse:min-w-24 border-2 px-4 text-[10px] uppercase tracking-wider transition-colors active:translate-y-px sm:text-xs";

function Controls({
  status,
  onStart,
  onTogglePause,
  onRestart,
  soundOn,
  onToggleSound,
  musicOn,
  onToggleMusic,
}: {
  status: SnakeState["status"];
  onStart: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  soundOn: boolean;
  onToggleSound: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {status === "ready" ? (
        <button
          type="button"
          onClick={onStart}
          className={`${buttonClass} border-green-500 bg-green-600 text-black hover:bg-green-500`}
        >
          Start
        </button>
      ) : (
        <button
          type="button"
          onClick={onTogglePause}
          disabled={status === "over" || status === "won"}
          className={`${buttonClass} border-yellow-400 text-yellow-300 hover:bg-yellow-400/10 disabled:opacity-30`}
        >
          {status === "paused" ? "Resume" : "Pause"}
        </button>
      )}
      <button
        type="button"
        onClick={onRestart}
        className={`${buttonClass} border-red-500 text-red-400 hover:bg-red-500/10`}
      >
        Restart
      </button>
      <div className="flex gap-2">
        <SoundToggle on={soundOn} onToggle={onToggleSound} />
        <MusicToggle on={musicOn} onToggle={onToggleMusic} />
      </div>
    </div>
  );
}

function toggleClass(on: boolean) {
  return `flex h-11 w-11 items-center justify-center border-2 transition-colors active:translate-y-px ${
    on ? "border-green-500 text-green-400 hover:bg-green-500/10" : "border-zinc-600 text-zinc-500 hover:bg-zinc-500/10"
  }`;
}

/** 음표 아이콘 배경음악 토글 (기본 꺼짐). 효과음과 따로 켜고 끈다. */
function MusicToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "배경음악 끄기" : "배경음악 켜기"}
      title={on ? "배경음악 끄기" : "배경음악 켜기"}
      className={toggleClass(on)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor" shapeRendering="crispEdges">
        {/* 픽셀 스타일 8분음표 두 개 */}
        <path d="M8 4h12v3H11v10H8zM17 7h3v8h-3z" />
        <path d="M4 15h7v5H4zM13 13h7v5h-7z" />
        {!on && <path d="M2 2h3v3H2zM5 5h3v3H5zM19 19h3v3h-3zM16 16h3v3h-3z" />}
      </svg>
    </button>
  );
}

/** 스피커 아이콘 효과음 토글 (기본 꺼짐). 시작 화면·플레이 중·게임 오버 모두에서 보인다. */
function SoundToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={on ? "효과음 끄기" : "효과음 켜기"}
      title={on ? "효과음 끄기" : "효과음 켜기"}
      className={toggleClass(on)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden fill="currentColor" shapeRendering="crispEdges">
        {/* 픽셀 스타일 스피커 */}
        <path d="M3 9h4l5-5h2v16h-2l-5-5H3z" />
        {on ? (
          <path d="M16 8h2v8h-2zM19 5h2v14h-2z" />
        ) : (
          <path d="M16 9h2v2h-2zM18 11h2v2h-2zM20 9h2v2h-2zM16 13h2v2h-2zM20 13h2v2h-2z" />
        )}
      </svg>
    </button>
  );
}
