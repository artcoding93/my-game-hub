"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { SCREEN_H, SCREEN_W } from "./config";
import type { Action } from "./input";
import { STAGES } from "./stages";
import { useFrostyRoll, type FrostyApi } from "./useFrostyRoll";

/**
 * Frosty Roll 화면 (Canvas 2D, 게임 엔진 없음).
 * - 장면·HUD·점수 팝업·연쇄 표시: 캔버스 (render/)
 * - 시작·일시정지·결과·스테이지 안내(한국어)·설정·터치 버튼: React (가끔 바뀌는 값만 구독)
 * 이 컴포넌트 안(게임 플레이 영역)에는 광고를 넣지 않는다.
 */
export default function FrostyRollGame() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useFrostyRoll(rootRef, canvasRef, arcadeFont.style.fontFamily);
  return (
    <div
      ref={rootRef}
      className={`${arcadeFont.className} relative mx-auto flex w-full max-w-5xl flex-col gap-2 rounded-2xl bg-linear-to-b from-[#16224a] to-[#0b1020] p-2 text-slate-100 shadow-[0_0_0_4px_#2a3a6e,0_0_28px_rgba(124,184,255,0.25)] select-none sm:p-3`}
      onPointerDown={() => game.audio.unlock()}
    >
      <div className="relative overflow-hidden rounded-lg">
        <canvas
          ref={canvasRef}
          width={SCREEN_W}
          height={SCREEN_H}
          className="block aspect-video w-full touch-none bg-[#0b1020]"
          style={{ imageRendering: "pixelated" }}
          aria-label="Frosty Roll 게임 화면"
        />
        <Overlay game={game} />
      </div>
      {game.screen === "game" && <TouchControls game={game} />}
      <Toolbar game={game} />
    </div>
  );
}

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 sm:text-[10px]";
const primary = `${btn} border-sky-300 bg-sky-300 text-slate-950 hover:bg-sky-200`;
const secondary = `${btn} border-sky-400/70 text-sky-100 hover:bg-sky-400/10`;
const ghost = `${btn} border-slate-500 text-slate-300 hover:bg-slate-400/10`;

function blurAfter(fn: () => void) {
  return (e: { currentTarget: HTMLElement }) => {
    fn();
    e.currentTarget.blur();
  };
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1020]/70 p-3 text-center">{children}</div>;
}

function Overlay({ game }: { game: FrostyApi }) {
  const { hud } = game;
  if (game.screen === "title") return <Title game={game} />;
  if (game.screen === "howto") return <HowTo game={game} />;
  const s = game.controller.state;
  if (!s) return null;
  if (hud.phase === "gameover" || hud.phase === "victory") {
    const won = hud.phase === "victory";
    return (
      <Panel>
        <p className={`text-base sm:text-2xl ${won ? "text-amber-200" : "text-rose-300"}`}>{won ? "ALL CLEAR!" : "GAME OVER"}</p>
        {won && <p className="font-sans text-sm text-slate-200">겨울 시계탑의 시계 기사를 멈췄습니다!</p>}
        <dl className="grid grid-cols-3 gap-2 font-sans text-xs text-slate-200">
          <Stat label="점수" value={s.score.toLocaleString()} />
          <Stat label="최고 점수" value={Math.max(game.best, s.score).toLocaleString()} />
          <Stat label="최대 연쇄" value={String(s.stats.bestChain)} />
        </dl>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={primary} onClick={blurAfter(() => game.startGame(false))}>
            처음부터
          </button>
          {game.checkpoint && !won && (
            <button type="button" className={secondary} onClick={blurAfter(() => game.startGame(true))}>
              고급 구간부터
            </button>
          )}
          <button type="button" className={ghost} onClick={blurAfter(game.toTitle)}>
            타이틀
          </button>
        </div>
      </Panel>
    );
  }
  if (hud.paused) {
    return (
      <Panel>
        <p className="text-base text-sky-100 sm:text-xl">PAUSE</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={primary} onClick={blurAfter(game.togglePause)}>
            계속하기
          </button>
          <button type="button" className={ghost} onClick={blurAfter(game.toTitle)}>
            타이틀로
          </button>
        </div>
      </Panel>
    );
  }
  if (hud.phase === "intro") {
    const stage = STAGES[hud.stageIndex];
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[13%] flex justify-center px-2">
        <p className="rounded-md bg-[#0b1020]/80 px-3 py-1.5 font-sans text-xs text-slate-100 sm:text-sm">
          <span className="text-amber-200">
            {stage.tier} {hud.stageIndex + 1} · {stage.nameKo}
          </span>{" "}
          — {stage.hint}
        </p>
      </div>
    );
  }
  if (hud.phase === "clear" && hud.stageIndex === 1) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-[13%] flex justify-center px-2">
        <p className="rounded-md bg-[#0b1020]/80 px-3 py-1.5 font-sans text-xs text-amber-100 sm:text-sm">체크포인트 해금! 다음부터 고급 구간에서 바로 시작할 수 있습니다.</p>
      </div>
    );
  }
  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800/80 px-3 py-2">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-sm text-white">{value}</dd>
    </div>
  );
}

function Title({ game }: { game: FrostyApi }) {
  return (
    <Panel>
      <p className="bg-linear-to-b from-white to-sky-300 bg-clip-text text-2xl text-transparent sm:text-4xl">FROSTY ROLL</p>
      <p className="max-w-md font-sans text-xs leading-5 text-slate-200 sm:text-sm">
        눈송이로 적을 눈덩이로 만들고, 차서 굴려 한 번에 여러 마리를 쓰러뜨리세요! 5개 스테이지, 마지막엔 시계 기사 보스.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={blurAfter(() => game.startGame(false))}>
          게임 시작
        </button>
        {game.checkpoint && (
          <button type="button" className={secondary} onClick={blurAfter(() => game.startGame(true))}>
            고급 구간부터
          </button>
        )}
        <button type="button" className={ghost} onClick={blurAfter(() => game.setScreen("howto"))}>
          게임 방법
        </button>
      </div>
      <p className="font-sans text-[11px] text-slate-400">최고 점수 {game.best.toLocaleString()}</p>
    </Panel>
  );
}

function HowTo({ game }: { game: FrostyApi }) {
  return (
    <Panel>
      <ul className="max-w-lg list-disc space-y-1 pl-5 text-left font-sans text-[11px] leading-5 text-slate-200 sm:text-sm">
        <li>PC: ←→/AD 이동, Space·↑ 점프, Z·J 눈송이, X·K 눈덩이 밀기(차기), P·Esc 일시정지</li>
        <li>눈송이 3번 → 적이 눈덩이가 됩니다. 옆에서 밀기 키로 차면 빠르게 굴러가요.</li>
        <li>굴러가는 눈덩이는 닿는 적을 모두 쓰러뜨립니다. 연쇄가 길수록 점수가 2배씩!</li>
        <li>벽에 두 번 튕긴 눈덩이는 다음 벽에서 부서집니다. 오래 두면 금이 가고 적이 탈출해요.</li>
        <li>간편 조작을 켜면 공격 키만으로 앞의 눈덩이를 찰 수 있습니다.</li>
      </ul>
      <button type="button" className={primary} onClick={blurAfter(() => game.setScreen("title"))}>
        돌아가기
      </button>
    </Panel>
  );
}

function Toolbar({ game }: { game: FrostyApi }) {
  const toggle = (on: boolean, label: string, onClick: () => void, title: string) => (
    <button type="button" className={on ? secondary : ghost} aria-pressed={on} onClick={blurAfter(onClick)} title={title}>
      {label} {on ? "On" : "Off"}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {game.screen === "game" && game.hud.running && (
        <button type="button" className={ghost} onClick={blurAfter(game.togglePause)} aria-label={game.hud.paused ? "계속하기" : "일시정지"}>
          {game.hud.paused ? "Resume" : "Pause"}
        </button>
      )}
      {toggle(game.soundOn, "SFX", game.toggleSound, "효과음 켜기/끄기 (기본 꺼짐)")}
      {toggle(game.musicOn, "BGM", game.toggleMusic, "배경음악 켜기/끄기 (기본 꺼짐)")}
      {toggle(game.shakeOn, "Shake", game.toggleShake, "연쇄·보스 타격 때 화면 흔들림")}
      {toggle(game.easyPush, "Easy", game.toggleEasyPush, "간편 조작: 공격 키만으로 눈덩이 차기")}
    </div>
  );
}

const PAD: { action: Action; label: string }[] = [
  { action: "left", label: "◀" },
  { action: "right", label: "▶" },
  { action: "jump", label: "JUMP" },
  { action: "fire", label: "SNOW" },
  { action: "kick", label: "PUSH" },
];

/** 터치 기기 전용 버튼. 손가락마다 따로 눌러 이동·점프·공격을 동시에 할 수 있다 */
function TouchControls({ game }: { game: FrostyApi }) {
  const { input } = game.controller;
  const bind = (action: Action) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      input.press(`touch-${e.pointerId}`, action);
      game.audio.unlock();
      try {
        // 손가락이 버튼 밖으로 미끄러져도 뗄 때까지 같은 버튼으로 본다
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // 포인터 캡처를 지원하지 않는 환경: 입력은 이미 반영됐다
      }
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => input.release(`touch-${e.pointerId}`),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => input.release(`touch-${e.pointerId}`),
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  });
  const pad = (a: Action) => PAD.find((p) => p.action === a)!;
  const button = (a: Action, extra = "") => (
    <button key={a} type="button" className={`${ghost} min-h-14 touch-none px-1 text-xs ${extra}`} {...bind(a)} aria-label={pad(a).label}>
      {pad(a).label}
    </button>
  );
  // 왼손: 이동 / 오른손: 밀기·눈송이·점프 (좁은 화면에서도 한 줄에 맞도록 5칸 격자)
  return (
    <div className="hidden grid-cols-5 gap-1.5 pointer-coarse:grid" aria-label="터치 조작">
      {button("left", "font-sans text-2xl leading-none")}
      {button("right", "mr-2 font-sans text-2xl leading-none")}
      {button("kick")}
      {button("fire")}
      {button("jump", "border-sky-400/70 text-sky-100")}
    </div>
  );
}
