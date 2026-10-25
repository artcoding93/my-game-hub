"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { SONGS } from "./audio/music";
import { DIFFICULTY, DRIVERS, ITEMS } from "./config";
import type { HoldAction, TapAction } from "./input";
import { PLAYER } from "./logic/game";
import { formatTime } from "./records";
import { KartRenderer, prepareCanvas } from "./renderer";
import { TRACKS } from "./tracks";
import { DIFFICULTIES, TRACK_IDS } from "./types";
import { useTurboKart, type KartGameApi } from "./useTurboKart";

/**
 * Turbo Kart 화면 (Canvas 2D, 게임 엔진 없음).
 * - 레이스 장면·카메라·미니맵·속도/시간/게이지: 캔버스 (renderer.ts)
 * - 메뉴·트랙/난이도 선택·결과·일시정지·터치 버튼: React (가끔 바뀌는 값만 구독)
 * - 규칙: logic/ (순수 TypeScript), 기록: records.ts
 * 이 컴포넌트 안(게임 플레이 영역)에는 광고를 넣지 않는다.
 */
export default function TurboKartGame() {
  const rootRef = useRef<HTMLDivElement>(null);
  const game = useTurboKart(rootRef);
  return (
    <div
      ref={rootRef}
      className={`${arcadeFont.className} relative mx-auto flex w-full max-w-5xl flex-col gap-2 overflow-hidden rounded-2xl bg-linear-to-b from-slate-900 to-slate-950 p-2 text-slate-100 shadow-[0_0_0_4px_#334155,0_0_28px_rgba(250,204,21,0.18)] select-none sm:p-3`}
      onPointerDown={() => game.audio.unlock()}
    >
      {game.screen === "race" ? <RaceView game={game} /> : <Menu game={game} />}
    </div>
  );
}

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 sm:text-[10px]";
const primary = `${btn} border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200`;
const secondary = `${btn} border-sky-400/70 text-sky-100 hover:bg-sky-400/10`;
const ghost = `${btn} border-slate-500 text-slate-300 hover:bg-slate-400/10`;

function SoundToggles({ game }: { game: KartGameApi }) {
  return (
    <>
      <button
        type="button"
        onClick={game.toggleCamera}
        aria-label={game.cameraMode === "chase" ? "카메라: 회전 (누르면 고정 탑다운)" : "카메라: 고정 탑다운 (누르면 회전)"}
        title="회전 카메라: 카트 전방이 항상 화면 위 / 고정: 북쪽이 위"
        className={secondary}
      >
        CAM <span className="ml-1 font-sans text-[11px] normal-case">{game.cameraMode === "chase" ? "회전" : "고정"}</span>
      </button>
      <button type="button" onClick={game.toggleSound} aria-pressed={game.soundOn} aria-label={game.soundOn ? "효과음 끄기" : "효과음 켜기"} className={game.soundOn ? secondary : ghost}>
        SFX {game.soundOn ? "On" : "Off"}
      </button>
      <button type="button" onClick={game.toggleMusic} aria-pressed={game.musicOn} aria-label={game.musicOn ? "배경음악 끄기" : "배경음악 켜기"} className={game.musicOn ? secondary : ghost}>
        BGM {game.musicOn ? "On" : "Off"}
      </button>
    </>
  );
}

// ── 메뉴 ──

function Menu({ game }: { game: KartGameApi }) {
  return (
    <section className="flex min-h-[22rem] flex-col gap-4 rounded-xl bg-[radial-gradient(ellipse_at_top,#3f2a08,transparent_70%)] p-3 sm:p-5" aria-label="게임 메뉴">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="bg-linear-to-b from-yellow-200 to-orange-500 bg-clip-text text-base text-transparent italic sm:text-xl">TURBO KART</p>
        <div className="flex flex-wrap gap-1.5">
          <SoundToggles game={game} />
        </div>
      </header>
      {game.screen === "title" && <Title game={game} />}
      {game.screen === "howto" && <HowTo game={game} />}
      {game.screen === "track" && <TrackSelect game={game} />}
      {game.screen === "difficulty" && <DifficultySelect game={game} />}
    </section>
  );
}

function Title({ game }: { game: KartGameApi }) {
  const { records } = game;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <KartBadge />
      <p className="max-w-md font-sans text-sm leading-6 text-slate-300">
        AI 카트 3대와 3바퀴 레이스! 방향키만으로 코너를 돌면 자동 드리프트로 부스터가 모입니다. 아이템과 지름길로 역전하세요.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={() => game.go("track")}>
          레이스 시작
        </button>
        <button type="button" className={secondary} onClick={() => game.go("howto")}>
          게임 방법
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-2 font-sans text-xs text-slate-300">
        <div className="rounded-lg bg-slate-800/70 px-3 py-2">
          <dt className="text-[11px] text-slate-400">총 경기</dt>
          <dd className="text-sm text-slate-100">{records.races}</dd>
        </div>
        <div className="rounded-lg bg-slate-800/70 px-3 py-2">
          <dt className="text-[11px] text-slate-400">1위</dt>
          <dd className="text-sm text-slate-100">{records.wins}</dd>
        </div>
      </dl>
    </div>
  );
}

function KartBadge() {
  return (
    <svg viewBox="0 0 120 60" className="h-14 w-28" aria-hidden>
      <rect x="20" y="8" width="16" height="10" rx="2" fill="#111827" />
      <rect x="20" y="42" width="16" height="10" rx="2" fill="#111827" />
      <rect x="78" y="8" width="16" height="10" rx="2" fill="#111827" />
      <rect x="78" y="42" width="16" height="10" rx="2" fill="#111827" />
      <rect x="14" y="16" width="92" height="28" rx="12" fill="#22d3ee" stroke="#0e7490" strokeWidth="3" />
      <rect x="14" y="27" width="92" height="6" fill="#fff" />
      <circle cx="52" cy="30" r="9" fill="#f8fafc" />
      <path d="M2 22 L12 30 L2 38" fill="#fb923c" />
    </svg>
  );
}

function HowTo({ game }: { game: KartGameApi }) {
  return (
    <div className="flex flex-col gap-3 font-sans text-sm leading-6 text-slate-200">
      <ul className="list-disc space-y-1 pl-5">
        <li>PC: W/↑ 가속, S/↓ 브레이크, A·D/←·→ 조향, Space 부스터, E 아이템, P/Esc 일시정지</li>
        <li>모바일: 화면 아래 버튼. 조향·가속·부스터를 동시에 누를 수 있습니다.</li>
        <li>CAM 버튼: 회전 카메라(카트 전방이 항상 화면 위, 기본)와 고정 탑다운(북쪽이 위) 중에서 고릅니다. 조향은 어느 쪽이든 카트 기준입니다.</li>
        <li>조향은 부드럽게 꺾이고 손을 떼면 바로 똑바로 돌아옵니다. 빠르게 달리며 한쪽으로 0.25초 이상 계속 꺾으면 자동으로 드리프트하고, 옆으로 미끄러지는 동안 부스터 게이지가 찹니다. 조향을 풀면 드리프트가 끝납니다.</li>
        <li>게이지가 가득 차면 Space(BOOST)로 2초 동안 최고 속도가 약 30% 빨라집니다.</li>
        <li>? 상자를 지나면 순위에 따라 아이템을 하나 얻습니다. 아이템은 한 번에 하나만 가질 수 있습니다.</li>
        <li>체크포인트를 순서대로 지나야 바퀴가 인정됩니다. 막히거나 코스를 벗어나면 마지막 체크포인트로 돌아갑니다.</li>
      </ul>
      <div>
        <button type="button" className={ghost} onClick={() => game.go("title")}>
          ← 처음으로
        </button>
      </div>
    </div>
  );
}

const TRACK_STYLES = {
  greenValley: "from-green-300 via-emerald-500 to-sky-400",
  desertCanyon: "from-amber-200 via-orange-400 to-amber-700",
  frostCircuit: "from-slate-100 via-sky-200 to-indigo-400",
} as const;

function TrackSelect({ game }: { game: KartGameApi }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] text-sky-200 sm:text-xs">1. 트랙 선택</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {TRACK_IDS.map((id) => {
          const t = TRACKS[id];
          const rec = game.records.tracks[id];
          const selected = game.track === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => game.chooseTrack(id)}
                aria-pressed={selected}
                className={`flex w-full flex-col gap-1 overflow-hidden rounded-xl border-2 text-left ${selected ? "border-amber-300" : "border-slate-600 hover:border-slate-400"}`}
              >
                <span className={`block h-12 bg-linear-to-r ${TRACK_STYLES[id]}`} aria-hidden />
                <span className="px-3 pt-1 text-[10px]">{t.name}</span>
                <span className="px-3 pb-3 font-sans text-xs leading-5 text-slate-300">
                  {t.description}
                  <br />
                  최고 기록 {rec.bestTime ? formatTime(rec.bestTime) : "-"} · 최고 순위 {rec.bestRank ?? "-"}
                  <br />
                  BGM: {SONGS[id].title}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => game.go("title")}>
          ← 처음으로
        </button>
        <button type="button" className={primary} onClick={() => game.go("difficulty")}>
          다음: 난이도
        </button>
      </div>
    </div>
  );
}

const DIFFICULTY_NOTES = {
  easy: "정적 장애물 5~6개, 움직이는 장애물 없음, 아이템 상자 많음, 미끄러운 구간 짧음",
  normal: "정적 장애물 9개, 움직이는 장애물 2개, 아이템 상자 보통",
  hard: "정적 장애물 14개, 움직이는 장애물 4개, 아이템 상자 적음, 미끄러운 구간 길어짐",
} as const;

function DifficultySelect({ game }: { game: KartGameApi }) {
  const rec = game.records.tracks[game.track];
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] text-sky-200 sm:text-xs">2. 난이도 ({TRACKS[game.track].name})</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {DIFFICULTIES.map((id) => {
          const selected = game.difficulty === id;
          const best = rec.byDifficulty[id];
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => game.setDifficulty(id)}
                aria-pressed={selected}
                className={`flex min-h-11 w-full flex-col gap-1 rounded-xl border-2 p-3 text-left ${selected ? "border-amber-300 bg-amber-300/10" : "border-slate-600 hover:border-slate-400"}`}
              >
                <span className="text-[10px]">{DIFFICULTY[id].name}</span>
                <span className="font-sans text-xs leading-5 text-slate-300">
                  {DIFFICULTY[id].nameKo} · {DIFFICULTY_NOTES[id]}
                  <br />
                  최고 기록 {best ? formatTime(best) : "-"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="font-sans text-xs text-slate-400">AI 카트의 속도와 트랙 모양은 모든 난이도에서 같습니다. 장애물과 아이템 구성만 달라집니다.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => game.go("track")}>
          ← 트랙
        </button>
        <button type="button" className={primary} onClick={game.startRace}>
          출발!
        </button>
      </div>
    </div>
  );
}

// ── 레이스 ──

function RaceView({ game }: { game: KartGameApi }) {
  const { controller, hud, audio } = game;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer] = useState(() => new KartRenderer());

  useEffect(() => {
    return controller.onEvents((events) => {
      if (controller.race) renderer.handleEvents(events, controller.race);
    });
  }, [controller, renderer]);

  useEffect(() => {
    renderer.reset();
  }, [hud.raceId, renderer]);

  useEffect(() => {
    renderer.setCameraMode(game.cameraMode);
  }, [game.cameraMode, renderer]);

  // 게임 루프: requestAnimationFrame마다 고정 스텝으로 진행하고 그린다. 캔버스 크기는 CSS가 정하고 매 프레임 읽는다(화면 회전·크기 변경 대응).
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      controller.update(dt);
      const race = controller.race;
      const canvas = canvasRef.current;
      if (race && canvas) {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const ctx = prepareCanvas(canvas, w, h);
        if (ctx) renderer.draw(ctx, race, w, h, dt);
        audio.updateLoops(race.state.karts[PLAYER], race.state.phase === "racing" && !race.state.paused && !race.state.karts[PLAYER].finished);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [controller, renderer, audio]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-sans text-[11px] text-slate-400" aria-live="polite">
          {hud.track && TRACKS[hud.track].name} · {hud.difficulty && DIFFICULTY[hud.difficulty].name} · LAP {hud.lap}/3 · {hud.rank}위
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondary} onClick={game.togglePause} disabled={hud.phase === "finished"} aria-label={hud.paused ? "계속하기" : "일시정지"}>
            {hud.paused ? "Resume" : "Pause"}
          </button>
          <SoundToggles game={game} />
        </div>
      </div>
      <div className="relative flex flex-col gap-2">
        <div className="relative aspect-[4/5] max-h-[calc(100dvh-17rem)] min-h-64 w-full overflow-hidden rounded-xl border-2 border-slate-600 bg-slate-800 sm:aspect-video sm:max-h-[calc(100dvh-9rem)] pointer-fine:max-h-none">
          <canvas ref={canvasRef} className="block h-full w-full touch-none" role="img" aria-label={`레이스 화면: ${hud.rank}위, ${hud.lap}바퀴째`} />
        </div>
        <TouchControls game={game} />
        <p className="hidden font-sans text-xs text-slate-500 pointer-fine:block">
          W/↑ 가속 · S/↓ 브레이크 · A D/← → 조향(빠르게 계속 꺾으면 자동 드리프트) · Space 부스터 · E 아이템 · P/Esc 일시정지
        </p>
        {hud.paused && <PauseMenu game={game} />}
        {hud.phase === "finished" && <Results game={game} />}
      </div>
    </>
  );
}

function OverlayBox({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="dialog" aria-label={label} className="absolute inset-0 z-10 flex flex-col items-center justify-center-safe gap-3 overflow-y-auto rounded-xl bg-slate-950/85 p-3 text-center backdrop-blur-[2px]">
      {children}
    </div>
  );
}

function PauseMenu({ game }: { game: KartGameApi }) {
  return (
    <OverlayBox label="일시정지 메뉴">
      <p className="text-lg text-amber-200">PAUSED</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={primary} onClick={game.togglePause}>
          계속하기
        </button>
        <button type="button" className={secondary} onClick={game.startRace}>
          재시작
        </button>
        <SoundToggles game={game} />
        <button type="button" className={`${ghost} col-span-2`} onClick={() => game.quitToMenu("title")}>
          레이스 종료 (메뉴로)
        </button>
      </div>
    </OverlayBox>
  );
}

const PLACE = ["1st", "2nd", "3rd", "4th"];

function Results({ game }: { game: KartGameApi }) {
  const { summary } = game;
  if (!summary) return null;
  const podium = summary.results.slice(0, 3);
  return (
    <OverlayBox label="레이스 결과">
      <p className={`text-lg sm:text-2xl ${summary.rank === 1 ? "text-amber-300" : "text-sky-200"}`}>{summary.rank === 1 ? "WINNER!" : `${PLACE[summary.rank - 1]} PLACE`}</p>
      {/* 시상대 */}
      <div className="flex items-end gap-1" aria-hidden>
        {[podium[1], podium[0], podium[2]].map((r, i) =>
          r ? (
            <div key={r.index} className="flex flex-col items-center gap-1">
              <span className="text-[9px]" style={{ color: DRIVERS[r.id].color }}>
                {DRIVERS[r.id].name}
              </span>
              <div className={`flex w-14 items-start justify-center rounded-t-md bg-slate-700 pt-1 text-[10px] ${["h-10", "h-14", "h-7"][i]}`}>{[2, 1, 3][i]}</div>
            </div>
          ) : null,
        )}
      </div>
      <table className="font-sans text-xs text-slate-200">
        <tbody>
          {summary.results.map((r) => (
            <tr key={r.index} className={r.index === PLAYER ? "text-amber-200" : ""}>
              <td className="px-2 py-0.5 text-left">{PLACE[r.rank - 1]}</td>
              <td className="px-2 py-0.5 text-left">{DRIVERS[r.id].name}</td>
              <td className="px-2 py-0.5 text-right">
                {formatTime(r.time)}
                {r.estimated ? " (예상)" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.newBest && <p className="font-sans text-xs text-amber-300">이 트랙 최고 기록!</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={game.startRace}>
          다시 달리기
        </button>
        <button type="button" className={secondary} onClick={() => game.quitToMenu("track")}>
          트랙 선택
        </button>
        <Link href="/#games" className={ghost}>
          게임 목록
        </Link>
      </div>
    </OverlayBox>
  );
}

/**
 * 터치 기기 전용 버튼. 버튼마다 포인터를 따로 잡으므로 조향 + 가속 + 부스터를 동시에 누를 수 있다(멀티터치).
 * 드리프트는 자동이라 버튼이 없다. 조향 버튼도 키보드와 같은 InputState(-1·0·1)를 쓰므로 주행 감각이 같다.
 * 페이지 스크롤·확대가 되지 않도록 touch-none을 쓴다.
 */
function TouchControls({ game }: { game: KartGameApi }) {
  const { controller, hud } = game;
  const { input } = controller;
  const hold = (source: string, action: HoldAction) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      game.audio.unlock();
      input.press(source, action);
    },
    onPointerUp: () => input.release(source),
    onPointerCancel: () => input.release(source),
    onLostPointerCapture: () => input.release(source),
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  const tap = (action: TapAction) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      input.tap(action);
    },
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  const base = "flex items-center justify-center rounded-xl border-2 select-none touch-none active:translate-y-px";
  const steerBtn = `${base} h-full min-h-28 w-16 border-sky-300/60 bg-slate-800 text-2xl text-sky-100 active:bg-sky-900 min-[380px]:w-20`;
  const small = `${base} h-14 w-[3.6rem] text-[8px] min-[380px]:w-16`;
  return (
    <div className="hidden touch-none items-stretch justify-between gap-2 pointer-coarse:flex" aria-label="터치 조작">
      <div className="flex gap-1.5">
        <button type="button" aria-label="왼쪽으로 조향" className={steerBtn} {...hold("t-left", "left")}>
          ◀
        </button>
        <button type="button" aria-label="오른쪽으로 조향" className={steerBtn} {...hold("t-right", "right")}>
          ▶
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" aria-label={hud.item ? `아이템 사용: ${ITEMS[hud.item].name}` : "아이템 없음"} disabled={!hud.itemUsable} className={`${small} border-pink-300/70 bg-pink-950/60 text-pink-100 disabled:opacity-40`} {...tap("item")}>
          {hud.item ? ITEMS[hud.item].short : "ITEM"}
        </button>
        <button type="button" aria-label="부스터" className={`${small} ${hud.boostReady ? "border-amber-300 bg-amber-500/30 text-amber-100" : "border-slate-500 bg-slate-800 text-slate-400"}`} {...tap("boost")}>
          BOOST
        </button>
        <button type="button" aria-label="브레이크·후진" className={`${small} border-rose-300/70 bg-rose-950/60 text-rose-100`} {...hold("t-brake", "brake")}>
          BRAKE
        </button>
        <button type="button" aria-label="가속" className={`${small} border-emerald-300 bg-emerald-700/50 text-emerald-50`} {...hold("t-gas", "throttle")}>
          GAS
        </button>
      </div>
    </div>
  );
}
