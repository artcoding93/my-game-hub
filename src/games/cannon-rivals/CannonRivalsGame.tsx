"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { SONGS } from "./audio/music";
import { AIM_LIMITS, DIFFICULTY, ECONOMY, ENERGY, FIELDS, ITEM_RULES, ITEMS, TANK, WORLD_H, WORLD_W } from "./config";
import type { HudState } from "./controller";
import { canUseItem, guidePath } from "./logic/game";
import { buyBlocker } from "./profile";
import { CannonRenderer, prepareCanvas } from "./renderer";
import { DIFFICULTIES, FIELD_IDS, ITEM_IDS, type ItemId } from "./types";
import { useCannonRivals, type CannonGameApi } from "./useCannonRivals";

/**
 * Cannon Rivals 화면 (Canvas 2D, 게임 엔진 없음).
 * - 전장·탱크·포탄·폭발: 캔버스 (renderer.ts)
 * - HUD·메뉴·상점·조작 버튼: React
 * - 규칙: logic/ (순수 TypeScript), 저장: profile.ts
 * 이 컴포넌트 안(게임 플레이 영역)에는 광고를 넣지 않는다.
 */
export default function CannonRivalsGame() {
  const rootRef = useRef<HTMLDivElement>(null);
  const game = useCannonRivals(rootRef);
  const { screen } = game;

  return (
    <div
      ref={rootRef}
      className={`${arcadeFont.className} relative mx-auto flex w-full max-w-5xl flex-col gap-2 overflow-hidden rounded-2xl bg-linear-to-b from-slate-900 to-slate-950 p-2 text-slate-100 shadow-[0_0_0_4px_#334155,0_0_28px_rgba(56,189,248,0.2)] select-none sm:p-3`}
      onPointerDown={() => game.audio.unlock()}
    >
      {screen === "battle" ? <Battle game={game} /> : <Menu game={game} />}
    </div>
  );
}

// ── 공용 버튼 ──

const btn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border-2 px-3 text-[9px] uppercase tracking-wider transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 sm:text-[10px]";
const primary = `${btn} border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200`;
const secondary = `${btn} border-sky-400/70 text-sky-100 hover:bg-sky-400/10`;
const ghost = `${btn} border-slate-500 text-slate-300 hover:bg-slate-400/10`;

function SoundToggles({ game }: { game: CannonGameApi }) {
  return (
    <>
      <button type="button" onClick={game.toggleSound} aria-pressed={game.soundOn} aria-label={game.soundOn ? "효과음 끄기" : "효과음 켜기"} className={game.soundOn ? secondary : ghost}>
        SFX {game.soundOn ? "On" : "Off"}
      </button>
      <button type="button" onClick={game.toggleMusic} aria-pressed={game.musicOn} aria-label={game.musicOn ? "배경음악 끄기" : "배경음악 켜기"} className={game.musicOn ? secondary : ghost}>
        BGM {game.musicOn ? "On" : "Off"}
      </button>
    </>
  );
}

// ── 메뉴 (시작 → 전장 → 난이도 → 상점) ──

function Menu({ game }: { game: CannonGameApi }) {
  const { screen, profile } = game;
  return (
    <section className="flex min-h-[22rem] flex-col gap-4 rounded-xl bg-[radial-gradient(ellipse_at_top,#1e3a5f,transparent_70%)] p-3 sm:p-5" aria-label="게임 메뉴">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="bg-linear-to-b from-amber-200 to-orange-500 bg-clip-text text-base text-transparent sm:text-xl">CANNON RIVALS</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-slate-800 px-2 py-1 text-[9px] text-amber-200 sm:text-[10px]" aria-label={`보유 코인 ${profile.coins}`}>
            ● {profile.coins.toLocaleString()} C
          </span>
          <SoundToggles game={game} />
        </div>
      </header>
      {screen === "title" && <TitleScreen game={game} />}
      {screen === "howto" && <HowTo game={game} />}
      {screen === "field" && <FieldSelect game={game} />}
      {screen === "difficulty" && <DifficultySelect game={game} />}
      {screen === "shop" && <Shop game={game} />}
    </section>
  );
}

function TitleScreen({ game }: { game: CannonGameApi }) {
  const { profile } = game;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <TankBadge />
      <p className="max-w-md font-sans text-sm leading-6 text-slate-300">
        각도와 파워를 맞춰 바람을 읽고 포탄을 날리세요. 먼저 상대 탱크의 HP를 0으로 만들거나 낭떠러지로 떨어뜨리면 승리합니다.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={() => game.go("field")}>
          게임 시작
        </button>
        <button type="button" className={secondary} onClick={() => game.go("howto")}>
          게임 방법
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-2 font-sans text-xs text-slate-300">
        <Record label="승리" value={profile.wins} />
        <Record label="패배" value={profile.losses} />
        <Record label="최단 승리" value={profile.bestWinTurns ? `${profile.bestWinTurns}턴` : "-"} />
      </dl>
    </div>
  );
}

function Record({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-800/70 px-3 py-2">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-100">{value}</dd>
    </div>
  );
}

function TankBadge() {
  return (
    <svg viewBox="0 0 120 50" className="h-14 w-36" aria-hidden>
      <rect x="18" y="34" width="84" height="12" rx="6" fill="#334155" />
      <rect x="24" y="24" width="72" height="12" rx="5" fill="#14b8a6" />
      <path d="M44 24a16 12 0 0 1 32 0z" fill="#0f766e" />
      <rect x="60" y="13" width="44" height="6" rx="3" fill="#0f766e" transform="rotate(-18 60 16)" />
      <circle cx="108" cy="2" r="3" fill="#fde047" />
    </svg>
  );
}

function HowTo({ game }: { game: CannonGameApi }) {
  return (
    <div className="flex flex-col gap-3 font-sans text-sm leading-6 text-slate-200">
      <ul className="list-disc space-y-1 pl-5">
        <li>플레이어(왼쪽)가 먼저 쏘고, 컴퓨터(오른쪽)와 번갈아 한 발씩 쏩니다. 탱크는 직접 움직일 수 없습니다.</li>
        <li>
          발사 각도 {AIM_LIMITS.minAngle}°~{AIM_LIMITS.maxAngle}°, 파워 {AIM_LIMITS.minPower}~{AIM_LIMITS.maxPower}%. 점선은 예상 경로의 앞부분(약 30%)만 보여 줍니다.
        </li>
        <li>바람은 턴마다 바뀌고 포탄을 옆으로 밀어 냅니다. 상단의 화살표와 숫자를 확인하세요.</li>
        <li>폭발은 지형을 깎습니다. 발밑 땅이 사라지면 탱크가 떨어져 낙하 피해를 입고, 화면 밖으로 떨어지면 패배합니다.</li>
        <li>명중하면 에너지가 차고(직접 +{ENERGY.direct}, 범위 +{ENERGY.splash}), {ENERGY.threshold}이 되면 아이템을 받습니다. 보급 상자를 맞혀도 아이템을 얻습니다.</li>
        <li>아이템은 한 턴에 하나만 고를 수 있고, FIRE를 누를 때 사용됩니다.</li>
      </ul>
      <div>
        <button type="button" className={ghost} onClick={() => game.go("title")}>
          ← 처음으로
        </button>
      </div>
    </div>
  );
}

const FIELD_STYLES = {
  greenHills: "from-sky-300 via-emerald-300 to-emerald-700",
  desertCanyon: "from-orange-300 via-amber-400 to-amber-800",
  frozenRidge: "from-indigo-800 via-sky-300 to-slate-200",
} as const;

function FieldSelect({ game }: { game: CannonGameApi }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] text-sky-200 sm:text-xs">1. 전장 선택</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {FIELD_IDS.map((id) => {
          const f = FIELDS[id];
          const selected = game.field === id;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => game.chooseField(id)}
                aria-pressed={selected}
                className={`flex w-full flex-col gap-1 overflow-hidden rounded-xl border-2 text-left ${selected ? "border-amber-300" : "border-slate-600 hover:border-slate-400"}`}
              >
                <span className={`block h-12 bg-linear-to-b ${FIELD_STYLES[id]}`} aria-hidden />
                <span className="px-3 pt-1 text-[10px] text-slate-100">{f.name}</span>
                <span className="px-3 pb-3 font-sans text-xs leading-5 text-slate-300">
                  {f.nameKo} · 바람 최대 {f.windMax} · {f.description}
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
  easy: "조준이 크게 흔들리고 보정이 느립니다. 아이템은 단순하게 씁니다.",
  normal: "조준 오차가 중간이고, 상황에 따라 아이템을 씁니다.",
  hard: "오차가 작고 빗나간 탄을 빠르게 보정합니다. 결정적인 순간에 아이템을 씁니다.",
} as const;

function DifficultySelect({ game }: { game: CannonGameApi }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] text-sky-200 sm:text-xs">2. AI 난이도</h3>
      <ul className="grid gap-2 sm:grid-cols-3">
        {DIFFICULTIES.map((id) => {
          const selected = game.difficulty === id;
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
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => game.go("field")}>
          ← 전장
        </button>
        <button type="button" className={primary} onClick={() => game.go("shop")}>
          다음: 준비
        </button>
      </div>
    </div>
  );
}

const BLOCK_TEXT = { coins: "코인 부족", full: "3칸 가득", repairLimit: "2개까지" } as const;

function Shop({ game }: { game: CannonGameApi }) {
  const { profile } = game;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[10px] text-sky-200 sm:text-xs">3. 준비 · 아이템 상점</h3>
      <p className="font-sans text-xs leading-5 text-slate-300">
        코인으로 이번 전투에 가져갈 아이템을 최대 {ITEM_RULES.maxSlots}개 살 수 있습니다. 코인은 승리 {ECONOMY.winCoins}, 패배 {ECONOMY.loseCoins}씩 쌓이며 게임 안에서만 쓰입니다.
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ITEM_IDS.map((id) => {
          const blocker = buyBlocker(profile, id);
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl border-2 border-slate-700 bg-slate-900/60 p-2">
              <ItemIcon item={id} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[9px] text-slate-100">{ITEMS[id].name}</span>
                <span className="font-sans text-[11px] leading-4 text-slate-400">{ITEMS[id].description}</span>
              </div>
              <button type="button" className={`${secondary} shrink-0 px-2`} disabled={blocker !== null} onClick={() => game.buy(id)} aria-label={`${ITEMS[id].name} ${ECONOMY.prices[id]}코인에 구매`}>
                {blocker ? BLOCK_TEXT[blocker] : `${ECONOMY.prices[id]} C`}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 rounded-xl bg-slate-800/60 p-2">
        <span className="text-[9px] text-slate-300">가져갈 아이템 ({profile.loadout.length}/{ITEM_RULES.maxSlots}) · 누르면 취소(환불)</span>
        <div className="flex flex-wrap gap-2">
          {profile.loadout.length === 0 && <span className="font-sans text-xs text-slate-500">없음</span>}
          {profile.loadout.map((item, i) => (
            <button key={`${item}-${i}`} type="button" className={ghost} onClick={() => game.refund(i)} aria-label={`${ITEMS[item].name} 구매 취소`}>
              {ITEMS[item].name} ✕
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={ghost} onClick={() => game.go("difficulty")}>
          ← 난이도
        </button>
        <button type="button" className={primary} onClick={game.startBattle}>
          전투 시작 ({FIELDS[game.field].name} · {DIFFICULTY[game.difficulty].name})
        </button>
      </div>
    </div>
  );
}

// ── 전투 ──

function Battle({ game }: { game: CannonGameApi }) {
  const { controller, hud } = game;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderer] = useState(() => new CannonRenderer());

  useEffect(() => {
    const off = controller.onEvents((events) => {
      if (controller.state) renderer.handleEvents(events, controller.state);
    });
    return off;
  }, [controller, renderer]);

  useEffect(() => {
    renderer.reset();
  }, [hud.battleId, renderer]);

  // 게임 루프: requestAnimationFrame마다 고정 스텝으로 진행하고 캔버스를 그린다.
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      controller.update(dt);
      const state = controller.state;
      const canvas = canvasRef.current;
      const ctx = canvas && prepareCanvas(canvas, WORLD_W, WORLD_H);
      if (ctx && state) {
        const guide = state.phase === "playerAim" && !state.paused ? guidePath(state) : null;
        renderer.draw(ctx, state, guide, dt);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [controller, renderer]);

  return (
    <>
      <BattleHud game={game} />
      {/* 일시정지·결과 패널은 전장과 조작부를 함께 덮는다(작은 화면에서도 버튼이 잘리지 않고, 덮인 동안 조작 버튼을 누를 수 없다). */}
      <div className="relative flex flex-col gap-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border-2 border-slate-600 bg-sky-200">
          <canvas ref={canvasRef} className="block h-full w-full touch-none" role="img" aria-label={`전장: 플레이어 HP ${hud.playerHp}, 컴퓨터 HP ${hud.aiHp}, 바람 ${hud.wind}`} />
        </div>
        <ControlPanel game={game} />
        {hud.paused && <PauseMenu game={game} />}
        {hud.phase === "gameOver" && <ResultPanel game={game} />}
      </div>
    </>
  );
}

function HpBar({ label, hp, color, barrier, align }: { label: string; hp: number; color: string; barrier: boolean; align: "left" | "right" }) {
  const ratio = Math.max(0, hp) / TANK.maxHp;
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${align === "right" ? "items-end text-right" : ""}`}>
      <span className="text-[8px] text-slate-300 sm:text-[10px]">
        {label} {hp}
        {barrier ? " · BR" : ""}
      </span>
      <div className="h-2.5 w-full max-w-56 overflow-hidden rounded-full bg-slate-700" role="meter" aria-label={`${label} HP`} aria-valuemin={0} aria-valuemax={TANK.maxHp} aria-valuenow={hp}>
        <div className={`h-full ${color} transition-[width] duration-300 ${align === "right" ? "ml-auto" : ""}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function WindMeter({ wind }: { wind: number }) {
  const strength = Math.abs(wind);
  const dir = wind === 0 ? "무풍" : wind > 0 ? "→ 오른쪽" : "← 왼쪽";
  return (
    <div className="flex flex-col items-center gap-0.5" aria-label={`바람 ${dir} ${strength}`}>
      <span className="text-[8px] text-slate-400 sm:text-[9px]">WIND</span>
      <span className="text-[10px] text-sky-200 sm:text-xs">
        {wind < 0 ? "◀ " : ""}
        {strength}
        {wind > 0 ? " ▶" : ""}
      </span>
      <div className="flex gap-px" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-[1px] ${i < strength ? "bg-sky-300" : "bg-slate-700"}`} />
        ))}
      </div>
    </div>
  );
}

function turnText(hud: HudState) {
  if (hud.phase === "gameOver") return hud.winner === "player" ? "VICTORY" : "DEFEAT";
  if (hud.phase === "playerAim") return "YOUR TURN";
  if (hud.phase === "aiAim") return "CPU AIMING";
  return hud.turn === "player" ? "FIRING" : "CPU FIRING";
}

function BattleHud({ game }: { game: CannonGameApi }) {
  const { hud } = game;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 sm:gap-4">
        <HpBar label="YOU" hp={hud.playerHp} color="bg-teal-400" barrier={hud.playerBarrier} align="left" />
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span className={`text-[8px] sm:text-[10px] ${hud.phase === "playerAim" ? "animate-pulse text-amber-200" : "text-slate-300"}`} aria-live="polite">
            {turnText(hud)}
          </span>
          <WindMeter wind={hud.wind} />
        </div>
        <HpBar label="CPU" hp={hud.aiHp} color="bg-rose-400" barrier={hud.aiBarrier} align="right" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="font-sans text-[11px] text-slate-400">
          {hud.field && FIELDS[hud.field].name} · {hud.difficulty && DIFFICULTY[hud.difficulty].name} · 턴 {hud.turnCount + 1} · CPU 아이템 {hud.aiInventory}
        </span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondary} onClick={game.togglePause} disabled={hud.phase === "gameOver"} aria-label={hud.paused ? "계속하기" : "일시정지"}>
            {hud.paused ? "Resume" : "Pause"}
          </button>
          <SoundToggles game={game} />
        </div>
      </div>
    </div>
  );
}

function OverlayBox({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="dialog" aria-label={label} className="absolute inset-0 z-10 flex flex-col items-center justify-center-safe gap-2 overflow-y-auto rounded-xl bg-slate-950/85 p-3 text-center backdrop-blur-[2px] sm:gap-3">
      {children}
    </div>
  );
}

function PauseMenu({ game }: { game: CannonGameApi }) {
  const [confirm, setConfirm] = useState<"restart" | "quit" | null>(null);
  return (
    <OverlayBox label="일시정지 메뉴">
      <p className="text-sm text-amber-200 sm:text-lg">PAUSED</p>
      {confirm ? (
        <>
          <p className="max-w-xs font-sans text-xs leading-5 text-slate-200">
            {confirm === "restart" ? "같은 설정으로 새 전투를 시작합니다." : "메뉴로 나갑니다."} 진행 중인 전투의 보상은 없고, 이번 전투에 가져온 아이템은 사라집니다.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={primary} onClick={() => (confirm === "restart" ? game.restart() : game.quitToMenu("title"))}>
              확인
            </button>
            <button type="button" className={ghost} onClick={() => setConfirm(null)}>
              취소
            </button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={primary} onClick={game.togglePause}>
            계속하기
          </button>
          <button type="button" className={secondary} onClick={() => setConfirm("restart")}>
            재시작
          </button>
          <SoundToggles game={game} />
          <button type="button" className={`${ghost} col-span-2`} onClick={() => setConfirm("quit")}>
            게임 종료 (메뉴로)
          </button>
        </div>
      )}
    </OverlayBox>
  );
}

function ResultPanel({ game }: { game: CannonGameApi }) {
  const { result, profile } = game;
  const won = game.hud.winner === "player";
  const reason = result?.reason === "fell" ? (won ? "상대 탱크가 낭떠러지로 떨어졌습니다" : "탱크가 낭떠러지로 떨어졌습니다") : won ? "상대 HP 0" : "내 HP 0";
  return (
    <OverlayBox label="전투 결과">
      <p className={`text-lg sm:text-2xl ${won ? "text-amber-300" : "text-rose-300"}`}>{won ? "VICTORY!" : "DEFEAT"}</p>
      <p className="font-sans text-xs text-slate-200 sm:text-sm">
        {reason} · {result?.turns ?? game.hud.turnCount + 1}턴 · +{result?.coins ?? 0} 코인 (보유 {profile.coins.toLocaleString()})
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={primary} onClick={() => game.quitToMenu("shop")}>
          다시 대전
        </button>
        <button type="button" className={secondary} onClick={() => game.quitToMenu("field")}>
          설정 바꾸기
        </button>
        <Link href="/#games" className={ghost}>
          게임 목록
        </Link>
      </div>
    </OverlayBox>
  );
}

// ── 조작부 ──

/** 누르고 있으면 반복되는 버튼 (각도·파워 미세 조절) */
function RepeatButton({ onStep, label, children, disabled }: { onStep: () => void; label: string; children: ReactNode; disabled?: boolean }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onStep();
    const repeat = (delay: number) => {
      timer.current = setTimeout(() => {
        onStep();
        repeat(70);
      }, delay);
    };
    stop();
    repeat(320);
  };
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-lg border-2 border-slate-500 bg-slate-800 text-base text-slate-100 active:bg-slate-600 disabled:opacity-40"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onStep();
        }
      }}
    >
      {children}
    </button>
  );
}

/** 파워 슬라이더 (포인터를 잡고 끌어 조절, 페이지 스크롤 방지) */
function PowerSlider({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { minPower, maxPower } = AIM_LIMITS;
  const setFromPointer = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onChange(Math.round(minPower + t * (maxPower - minPower)));
  };
  const ratio = (value - minPower) / (maxPower - minPower);
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="발사 파워"
      aria-valuemin={minPower}
      aria-valuemax={maxPower}
      aria-valuenow={value}
      aria-disabled={disabled}
      className={`relative h-11 min-w-0 flex-1 touch-none rounded-lg bg-slate-800 ${disabled ? "opacity-40" : "cursor-pointer"}`}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromPointer(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) setFromPointer(event.clientX);
      }}
    >
      <div className="absolute inset-y-0 left-0 rounded-lg bg-linear-to-r from-amber-500/60 to-rose-500/80" style={{ width: `${ratio * 100}%` }} />
      <div className="absolute top-1/2 h-8 w-3 -translate-x-1/2 -translate-y-1/2 rounded bg-amber-200 shadow" style={{ left: `${ratio * 100}%` }} />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-white [text-shadow:0_1px_2px_#000]">{value.toFixed(0)}%</span>
    </div>
  );
}

function ItemSlots({ game }: { game: CannonGameApi }) {
  const { hud, controller } = game;
  const aiming = hud.phase === "playerAim" && !hud.paused;
  const tank = controller.state?.tanks.player;
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="아이템 (한 턴에 하나, 발사할 때 사용)">
      {Array.from({ length: ITEM_RULES.maxSlots }, (_, slot) => {
        const item = hud.inventory[slot];
        const armed = hud.armedSlot === slot;
        const usable = !!item && !!tank && canUseItem(tank, item);
        return (
          <button
            key={slot}
            type="button"
            disabled={!item || !aiming || !usable}
            onClick={() => game.armItem(slot)}
            aria-pressed={armed}
            aria-label={item ? `${slot + 1}번 아이템 ${ITEMS[item].name}: ${ITEMS[item].description}${armed ? " (선택됨)" : ""}` : `${slot + 1}번 아이템 칸 비어 있음`}
            title={item ? `${ITEMS[item].name} — ${ITEMS[item].description}` : "빈 칸"}
            className={`relative flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg border-2 text-[8px] transition-colors disabled:opacity-40 sm:h-14 sm:w-14 ${armed ? "border-amber-300 bg-amber-300/20" : "border-slate-500 bg-slate-800 hover:border-slate-300"}`}
          >
            <span className="absolute top-0.5 left-1 text-[7px] text-slate-400">{slot + 1}</span>
            {item ? <ItemIcon item={item} small /> : <span className="text-slate-600">-</span>}
          </button>
        );
      })}
    </div>
  );
}

const ITEM_COLORS: Record<ItemId, string> = {
  doubleShot: "bg-orange-500",
  powerShell: "bg-rose-500",
  repairKit: "bg-emerald-500",
  barrier: "bg-sky-500",
  windShield: "bg-teal-500",
  aimAssist: "bg-violet-500",
};

function ItemIcon({ item, small }: { item: ItemId; small?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md text-white ${ITEM_COLORS[item]} ${small ? "h-7 w-9 text-[8px]" : "h-9 w-11 text-[9px]"}`} aria-hidden>
      {ITEMS[item].short}
    </span>
  );
}

function ControlPanel({ game }: { game: CannonGameApi }) {
  const { hud, controller } = game;
  const aiming = hud.phase === "playerAim" && !hud.paused;
  const armed = hud.armedSlot !== null ? hud.inventory[hud.armedSlot] : null;
  const energyRatio = Math.min(1, hud.energy / ENERGY.threshold);
  return (
    <div className="flex flex-col gap-2" aria-label="조작">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <span className="w-11 shrink-0 text-[7px] text-slate-400 sm:w-14 sm:text-[9px]">
            ANGLE
            <br />
            <span className="font-sans text-[10px]">
              {AIM_LIMITS.minAngle}–{AIM_LIMITS.maxAngle}°
            </span>
          </span>
          <RepeatButton label="각도 내리기" disabled={!aiming} onStep={() => controller.adjustAim(-1, 0)}>
            ▼
          </RepeatButton>
          <output className="min-w-0 flex-1 text-center text-sm text-amber-100" aria-label="발사 각도">
            {hud.angle.toFixed(0)}°
          </output>
          <RepeatButton label="각도 올리기" disabled={!aiming} onStep={() => controller.adjustAim(1, 0)}>
            ▲
          </RepeatButton>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-11 shrink-0 text-[7px] text-slate-400 sm:w-14 sm:text-[9px]">
            POWER
            <br />
            <span className="font-sans text-[10px]">
              {AIM_LIMITS.minPower}–{AIM_LIMITS.maxPower}%
            </span>
          </span>
          <RepeatButton label="파워 낮추기" disabled={!aiming} onStep={() => controller.adjustAim(0, -1)}>
            −
          </RepeatButton>
          <PowerSlider value={hud.power} disabled={!aiming} onChange={(power) => controller.setAim(hud.angle, power)} />
          <RepeatButton label="파워 높이기" disabled={!aiming} onStep={() => controller.adjustAim(0, 1)}>
            +
          </RepeatButton>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ItemSlots game={game} />
        <div className="flex min-w-24 flex-1 flex-col gap-1">
          <span className="text-[8px] text-slate-400">
            ENERGY {Math.floor(hud.energy)}/{ENERGY.threshold}
          </span>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-700" role="meter" aria-label="에너지" aria-valuemin={0} aria-valuemax={ENERGY.threshold} aria-valuenow={Math.floor(hud.energy)}>
            <div className="h-full bg-linear-to-r from-cyan-400 to-violet-400" style={{ width: `${energyRatio * 100}%` }} />
          </div>
          <span className="min-h-4 font-sans text-[11px] leading-4 text-slate-300" aria-live="polite">
            {armed ? `선택: ${ITEMS[armed].name} — ${ITEMS[armed].description}` : hud.phase === "playerAim" ? "아이템을 고르거나 바로 발사하세요" : ""}
          </span>
        </div>
        <button
          type="button"
          disabled={!aiming}
          onClick={game.fire}
          className="flex h-14 min-w-28 flex-1 touch-none items-center justify-center rounded-xl border-2 border-rose-300 bg-linear-to-b from-rose-500 to-rose-700 text-sm text-white shadow-[0_4px_0_#881337] active:translate-y-0.5 active:shadow-none disabled:opacity-40 sm:max-w-44 sm:flex-none"
        >
          FIRE
        </button>
      </div>
      <p className="hidden font-sans text-xs text-slate-500 pointer-fine:block">
        ↑↓ 각도 · ←→ 파워 (Shift = 5씩) · Space 발사 · 1/2/3 아이템 · P/Esc 일시정지
      </p>
    </div>
  );
}
