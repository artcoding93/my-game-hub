"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { arcadeFont } from "@/lib/fonts";
import { GAME_CONFIG } from "./config";
import type { HudState, LostRelicController } from "./controller";
import { ITEMS } from "./items";
import type { ItemId } from "./types";
import { useLostRelic } from "./useLostRelic";

function pad(value: number, length: number) {
  return String(value).padStart(length, "0");
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(s / 60), 2)}:${pad(s % 60, 2)}`;
}

/**
 * Lost Relic 화면.
 * - 게임 월드: Phaser 캔버스 (render/). Phaser는 브라우저 전용이므로 effect 안에서 동적 import한다.
 * - HUD·안내 문구·인벤토리·오버레이·터치 버튼: React (한글 문구는 기본 글꼴)
 * - 규칙: logic/ (순수 TypeScript)
 */
export default function LostRelicGame() {
  const game = useLostRelic();
  const { controller, hud, audio } = game;
  const canvasParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = canvasParentRef.current;
    if (!parent) return;
    let cancelled = false;
    let phaser: { destroy: (removeCanvas: boolean) => void } | null = null;

    import("./render/createPhaserGame").then(({ createPhaserGame }) => {
      if (!cancelled) phaser = createPhaserGame(parent, controller);
    });

    return () => {
      cancelled = true;
      phaser?.destroy(true);
    };
  }, [controller]);

  return (
    <div
      className={`${arcadeFont.className} mx-auto flex w-full max-w-[min(64rem,max(20rem,calc((100dvh_-_14rem)*16/9)))] min-w-0 flex-col gap-2 rounded-2xl bg-stone-950 p-2 text-stone-100 shadow-[0_0_0_4px_#78350f,0_0_32px_rgba(234,179,8,0.2)] pointer-coarse:max-w-[min(64rem,max(20rem,calc((100dvh_-_22rem)*16/9)))] sm:p-3`}
      onPointerDown={() => audio.unlock()}
    >
      <Hud hud={hud} />

      <div className="relative aspect-video w-full overflow-hidden border-2 border-amber-900 bg-[#0c0a09]">
        <div ref={canvasParentRef} className="absolute inset-0 touch-none select-none" />
        {hud.phase === "playing" && <PromptBubble hud={hud} />}
        {(hud.phase === "playing" || hud.phase === "inventory") && <MessageBanner hud={hud} />}
        <Overlay game={game} />
      </div>

      <ItemBar hud={hud} controller={controller} />
      <ActionBar
        hud={hud}
        controller={controller}
        soundOn={game.soundOn}
        onToggleSound={game.toggleSound}
        musicOn={game.musicOn}
        onToggleMusic={game.toggleMusic}
        onResume={game.resume}
      />
      <TouchControls controller={controller} hud={hud} />
    </div>
  );
}

// ── HUD ──

function Hearts({ health, max }: { health: number; max: number }) {
  return (
    <span className="flex gap-1" aria-label={`체력 ${health} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <svg key={i} viewBox="0 0 7 6" width="14" height="12" aria-hidden shapeRendering="crispEdges" className={i < health ? "text-rose-500" : "text-stone-700"}>
          <path fill="currentColor" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z" />
        </svg>
      ))}
    </span>
  );
}

function Hud({ hud }: { hud: HudState }) {
  const inGame = hud.phase !== "title";
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 text-[7px] leading-relaxed sm:text-[9px]" aria-live="polite">
      <div className="flex items-center gap-2">
        <span className="text-amber-400">HP</span>
        <Hearts health={inGame ? hud.health : hud.maxHealth} max={hud.maxHealth} />
      </div>
      <div className="flex min-w-0 items-center justify-center gap-2 truncate">
        <span className="text-amber-400">ROOM {inGame ? hud.roomIndex : 1}/8</span>
        <span className="truncate font-sans text-[11px] text-stone-300 sm:text-xs">{inGame ? hud.roomName : "유적 입구"}</span>
        {hud.hasRelic && <span className="hidden font-sans text-[11px] text-yellow-300 sm:inline">· 탈출하라!</span>}
      </div>
      <div className="flex gap-3 text-right tabular-nums">
        <span>
          <span className="text-amber-400">SCORE </span>
          {pad(hud.score, 5)}
        </span>
        <span className="hidden min-[400px]:inline">
          <span className="text-amber-400">TIME </span>
          {formatTime(hud.seconds)}
        </span>
      </div>
    </div>
  );
}

/** 오브젝트 위에 뜨는 안내 (예: "E: 상자 열기", "청동 열쇠가 필요합니다") */
function PromptBubble({ hud }: { hud: HudState }) {
  const prompt = hud.prompt;
  if (!prompt) return null;
  const left = Math.min(Math.max((prompt.x / GAME_CONFIG.width) * 100, 12), 88);
  const top = Math.max((prompt.y / GAME_CONFIG.height) * 100, 12);
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
      style={{ left: `${left}%`, top: `${top}%` }}
      role="status"
    >
      <p
        className={`whitespace-nowrap border px-1.5 py-0.5 font-sans text-[10px] leading-tight shadow sm:text-xs ${
          prompt.actionable ? "border-amber-400 bg-stone-950/90 text-amber-100" : "border-stone-500 bg-stone-950/80 text-stone-300"
        }`}
      >
        {prompt.text}
      </p>
    </div>
  );
}

const TONE_CLASS: Record<NonNullable<HudState["message"]>["tone"], string> = {
  info: "border-stone-500 text-stone-100",
  item: "border-amber-400 text-amber-100",
  secret: "border-cyan-400 text-cyan-100",
  warn: "border-rose-400 text-rose-100",
};

function MessageBanner({ hud }: { hud: HudState }) {
  const message = hud.message;
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center" aria-live="polite">
      {message && (
        <p key={message.id} className={`max-w-[92%] border-2 bg-stone-950/90 px-3 py-1.5 text-center font-sans text-[11px] leading-snug sm:text-sm ${TONE_CLASS[message.tone]}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

// ── 아이콘 ──

function PixelIcon({ item, size = 20 }: { item: ItemId; size?: number }) {
  const info = ITEMS[item];
  const width = info.icon[0].length;
  const height = info.icon.length;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={size} height={size} aria-hidden shapeRendering="crispEdges">
      {info.icon.flatMap((row, y) =>
        [...row].map((char, x) =>
          info.palette[char] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={info.palette[char]} /> : null,
        ),
      )}
    </svg>
  );
}

// ── 오버레이 ──

function OverlayBox({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-stone-950/80 p-3 text-center">
      {children}
    </div>
  );
}

const overlayButton =
  "min-h-11 min-w-44 border-2 px-4 text-[10px] uppercase tracking-wider transition-colors active:translate-y-px sm:text-xs";
const primaryButton = `${overlayButton} border-amber-400 bg-amber-400 text-stone-950 hover:bg-amber-300`;
const secondaryButton = `${overlayButton} border-amber-700 text-amber-200 hover:bg-amber-400/10`;

function Title() {
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="bg-linear-to-b from-yellow-200 via-amber-400 to-orange-600 bg-clip-text text-2xl leading-tight text-transparent drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] sm:text-4xl">
        LOST RELIC
      </p>
      <p className="text-[8px] tracking-[0.3em] text-amber-200/80 sm:text-[10px]">TEMPLE OF SECRETS</p>
    </div>
  );
}

type GameApi = ReturnType<typeof useLostRelic>;

function Overlay({ game }: { game: GameApi }) {
  const { hud } = game;
  const [screen, setScreen] = useState<"menu" | "help" | "confirm">("menu");

  switch (hud.phase) {
    case "title":
      if (screen === "help") {
        return (
          <OverlayBox>
            <HowToPlay />
            <button type="button" onClick={() => setScreen("menu")} className={secondaryButton}>
              Back
            </button>
          </OverlayBox>
        );
      }
      if (screen === "confirm") {
        return (
          <OverlayBox>
            <p className="font-sans text-sm text-stone-200">저장된 탐험 기록이 지워집니다. 새로 시작할까요?</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={game.startNew} className={primaryButton}>
                New Game
              </button>
              <button type="button" onClick={() => setScreen("menu")} className={secondaryButton}>
                Cancel
              </button>
            </div>
          </OverlayBox>
        );
      }
      return (
        <OverlayBox>
          <Title />
          <div className="flex flex-col gap-2">
            {hud.hasSave && (
              <button type="button" onClick={game.continueSaved} className={primaryButton}>
                Continue
              </button>
            )}
            <button
              type="button"
              onClick={hud.hasSave ? () => setScreen("confirm") : game.startNew}
              className={hud.hasSave ? secondaryButton : primaryButton}
            >
              New Game
            </button>
            <button type="button" onClick={() => setScreen("help")} className={secondaryButton}>
              How to Play
            </button>
          </div>
          <SoundSettings game={game} />
          {game.saveCorrupted && <p className="font-sans text-[11px] text-rose-300">저장 데이터가 손상되어 지웠습니다. 새 게임으로 시작해 주세요.</p>}
          <Records hud={hud} />
        </OverlayBox>
      );
    case "paused":
      return (
        <OverlayBox>
          <p className="text-xl text-amber-300 sm:text-2xl">PAUSED</p>
          <button type="button" onClick={game.resume} className={primaryButton}>
            Resume
          </button>
          <SoundSettings game={game} />
          <p className="font-sans text-xs text-stone-400">P · Esc · Enter로 계속하기 · 진행 상황은 자동 저장됩니다</p>
        </OverlayBox>
      );
    case "inventory":
      return <InventoryPanel hud={hud} controller={game.controller} />;
    case "gameOver":
      return (
        <OverlayBox>
          <p className="text-xl text-rose-500 sm:text-3xl">GAME OVER</p>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[9px] sm:text-xs">
            <dt className="text-amber-400">SCORE</dt>
            <dd className="tabular-nums">{hud.score.toLocaleString()}</dd>
            <dt className="text-amber-400">BEST</dt>
            <dd className="tabular-nums text-yellow-300">{hud.bestScore.toLocaleString()}</dd>
          </dl>
          <EndButtons game={game} />
        </OverlayBox>
      );
    case "cleared": {
      const stats = hud.stats;
      return (
        <OverlayBox>
          <p className="text-lg text-yellow-300 sm:text-3xl">ESCAPED!</p>
          <p className="font-sans text-xs text-stone-300 sm:text-sm">고대 유물과 함께 유적을 무사히 빠져나왔습니다.</p>
          {stats && (
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-left text-[8px] sm:text-[11px]">
              <dt className="text-amber-400">TOTAL SCORE</dt>
              <dd className="tabular-nums">
                {stats.score.toLocaleString()} {hud.newBestScore && <span className="text-yellow-300">NEW!</span>}
              </dd>
              <dt className="text-amber-400">TIME</dt>
              <dd className="tabular-nums">
                {formatTime(stats.time)} {hud.newBestTime && <span className="text-yellow-300">NEW!</span>}
              </dd>
              <dt className="text-amber-400">CHESTS</dt>
              <dd className="tabular-nums">
                {stats.chests} / {stats.totalChests}
              </dd>
              <dt className="text-amber-400">ROOMS</dt>
              <dd className="tabular-nums">
                {stats.rooms} / {stats.totalRooms}
              </dd>
              <dt className="text-amber-400">HEALTH</dt>
              <dd className="tabular-nums">
                {stats.health} / {hud.maxHealth}
              </dd>
            </dl>
          )}
          <Records hud={hud} />
          <EndButtons game={game} />
        </OverlayBox>
      );
    }
    default:
      return null;
  }
}

function EndButtons({ game }: { game: GameApi }) {
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={game.startNew} className={primaryButton}>
        Restart
      </button>
      <Link href="/#games" className={`${secondaryButton} flex items-center justify-center`}>
        Back to Games
      </Link>
    </div>
  );
}

function Records({ hud }: { hud: HudState }) {
  if (hud.bestScore === 0 && hud.bestTime === 0) return null;
  return (
    <p className="text-[8px] text-stone-400 sm:text-[10px]">
      BEST {hud.bestScore.toLocaleString()}
      {hud.bestTime > 0 && ` · FASTEST ${formatTime(hud.bestTime)}`}
    </p>
  );
}

function SoundSettings({ game }: { game: GameApi }) {
  return (
    <div className="flex gap-2" aria-label="사운드 설정">
      <ToggleButton on={game.soundOn} onToggle={game.toggleSound} label="Sound" aria={game.soundOn ? "효과음 끄기" : "효과음 켜기"} />
      <ToggleButton on={game.musicOn} onToggle={game.toggleMusic} label="BGM" aria={game.musicOn ? "배경음악 끄기" : "배경음악 켜기"} />
    </div>
  );
}

function ToggleButton({ on, onToggle, label, aria }: { on: boolean; onToggle: () => void; label: string; aria: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={aria}
      title={aria}
      className={`h-11 min-w-24 border-2 px-3 text-[8px] uppercase tracking-wider transition-colors active:translate-y-px sm:text-[9px] ${
        on ? "border-amber-400 text-amber-200 hover:bg-amber-400/10" : "border-stone-600 text-stone-500 hover:bg-stone-500/10"
      }`}
    >
      {label} {on ? "On" : "Off"}
    </button>
  );
}

function HowToPlay() {
  return (
    <div className="flex w-full max-w-md flex-col gap-2 text-left font-sans text-[11px] leading-snug text-stone-200 sm:text-xs">
      <p className={`${arcadeFont.className} text-center text-xs text-amber-300`}>HOW TO PLAY</p>
      <p>
        유적 8개 방을 탐험해 가장 깊은 방의 <span className="text-yellow-300">고대 유물</span>을 찾은 뒤, 1번 방 입구의 탈출문으로 돌아오세요.
        상자를 열고 수상한 곳을 조사하면 열쇠와 도구를 얻을 수 있습니다.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-amber-200">← → / A D</dt>
        <dd>이동 (석상은 밀어서 옮김)</dd>
        <dt className="text-amber-200">↑ ↓ / W S</dt>
        <dd>사다리 오르내리기</dd>
        <dt className="text-amber-200">Space</dt>
        <dd>점프 (길게 누르면 더 높이)</dd>
        <dt className="text-amber-200">E</dt>
        <dd>상자 열기 · 문 열기 · 조사 (열쇠는 자동 사용)</dd>
        <dt className="text-amber-200">F · Q · I</dt>
        <dd>아이템 사용 · 아이템 바꾸기 · 가방 열기</dd>
        <dt className="text-amber-200">P / Esc</dt>
        <dd>일시정지</dd>
      </dl>
      <p className="text-stone-400">체력은 3칸입니다. 가시·적·떨어지는 돌을 조심하세요. 진행 상황은 방을 옮길 때마다 자동 저장됩니다.</p>
    </div>
  );
}

function InventoryPanel({ hud, controller }: { hud: HudState; controller: LostRelicController }) {
  const selected = hud.selected ? ITEMS[hud.selected] : null;
  return (
    <OverlayBox>
      <p className="text-sm text-amber-300 sm:text-base">INVENTORY</p>
      {hud.inventory.length === 0 ? (
        <p className="font-sans text-xs text-stone-400">아직 가진 아이템이 없습니다. 상자를 열어 보세요!</p>
      ) : (
        <ul className="flex w-full max-w-lg flex-wrap justify-center gap-2">
          {hud.inventory.map(({ id, count }) => (
            <li key={id} className="w-20">
              <button
                type="button"
                onClick={() => controller.select(id)}
                aria-pressed={hud.selected === id}
                aria-label={`${ITEMS[id].name} ${count}개${hud.selected === id ? " (선택됨)" : ""}`}
                className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 border-2 p-1 ${
                  hud.selected === id ? "border-amber-400 bg-amber-400/15" : "border-stone-700 hover:border-stone-500"
                }`}
              >
                <PixelIcon item={id} size={28} />
                <span className="font-sans text-[10px] leading-tight text-stone-200">{ITEMS[id].name}</span>
                <span className="text-[8px] text-amber-300">x{count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <p className="max-w-md font-sans text-xs text-stone-300">{selected.description}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => controller.applySelected()} disabled={!hud.selected} className={`${primaryButton} disabled:opacity-40`}>
          Use (F)
        </button>
        <button type="button" onClick={() => controller.toggleInventory()} className={secondaryButton}>
          Close (I)
        </button>
      </div>
      <p className="font-sans text-[11px] text-stone-400">← → / Q로 선택 · 진행에 필요한 아이템은 맞는 곳에서만 소모됩니다</p>
    </OverlayBox>
  );
}

// ── 아이템 바·버튼 ──

function ItemBar({ hud, controller }: { hud: HudState; controller: LostRelicController }) {
  const canUse = hud.phase === "playing" && hud.selected !== null;
  return (
    <div className="flex items-center gap-2" aria-label="아이템">
      <ul className="flex min-h-11 flex-1 items-center gap-1 overflow-x-auto border-2 border-stone-800 px-1">
        {hud.inventory.length === 0 && <li className="px-1 font-sans text-[11px] text-stone-500">아이템 없음</li>}
        {hud.inventory.map(({ id, count }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => controller.select(id)}
              aria-pressed={hud.selected === id}
              aria-label={`${ITEMS[id].name} ${count}개 선택`}
              title={ITEMS[id].name}
              className={`relative flex h-10 w-10 items-center justify-center border-2 ${hud.selected === id ? "border-amber-400 bg-amber-400/15" : "border-transparent hover:border-stone-600"}`}
            >
              <PixelIcon item={id} size={22} />
              {count > 1 && <span className="absolute right-0 bottom-0 bg-stone-950 px-0.5 text-[7px] text-amber-300">{count}</span>}
            </button>
          </li>
        ))}
      </ul>
      <span className="hidden max-w-32 truncate font-sans text-xs text-stone-300 sm:inline">{hud.selected ? ITEMS[hud.selected].name : ""}</span>
      <button
        type="button"
        onClick={() => controller.input.trigger("use")}
        disabled={!canUse}
        className="h-11 min-w-16 border-2 border-amber-600 px-2 text-[8px] text-amber-200 transition-colors hover:bg-amber-400/10 active:translate-y-px disabled:opacity-30 sm:text-[9px]"
      >
        USE F
      </button>
      <button
        type="button"
        onClick={() => controller.toggleInventory()}
        disabled={hud.phase !== "playing" && hud.phase !== "inventory"}
        aria-label="가방(인벤토리) 열기"
        className="h-11 min-w-16 border-2 border-stone-500 px-2 text-[8px] text-stone-200 transition-colors hover:bg-stone-400/10 active:translate-y-px disabled:opacity-30 sm:text-[9px]"
      >
        BAG I
      </button>
    </div>
  );
}

function ActionBar({
  hud,
  controller,
  soundOn,
  onToggleSound,
  musicOn,
  onToggleMusic,
  onResume,
}: {
  hud: HudState;
  controller: LostRelicController;
  soundOn: boolean;
  onToggleSound: () => void;
  musicOn: boolean;
  onToggleMusic: () => void;
  onResume: () => void;
}) {
  const canPause = hud.phase === "playing" || hud.phase === "paused" || hud.phase === "inventory";
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => (hud.phase === "paused" ? onResume() : controller.pause())}
        disabled={!canPause}
        className="h-11 min-w-24 border-2 border-amber-500 px-3 text-[8px] uppercase tracking-wider text-amber-200 transition-colors hover:bg-amber-400/10 active:translate-y-px disabled:opacity-30 sm:text-[9px]"
      >
        {hud.phase === "paused" ? "Resume" : "Pause"}
      </button>
      <ToggleButton on={soundOn} onToggle={onToggleSound} label="Sound" aria={soundOn ? "효과음 끄기" : "효과음 켜기"} />
      <ToggleButton on={musicOn} onToggle={onToggleMusic} label="BGM" aria={musicOn ? "배경음악 끄기" : "배경음악 켜기"} />
      <p className="hidden w-full text-center font-sans text-xs text-stone-400 pointer-fine:block">
        ←→ 이동 · ↑↓ 사다리 · Space 점프 · E 조사/열기 · F 사용 · Q 아이템 변경 · I 가방 · P 일시정지
      </p>
    </div>
  );
}

/**
 * 터치 기기 전용 조작 버튼. 버튼마다 포인터를 따로 잡으므로 이동하면서 점프·조사를 동시에 누를 수 있다(멀티터치).
 * 게임 화면 아래에 따로 배치해 손가락이 게임 영역을 가리지 않게 한다.
 */
function TouchControls({ controller, hud }: { controller: LostRelicController; hud: HudState }) {
  const { input } = controller;
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
  const tap = (onTap: () => void) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onTap();
    },
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
  });
  const playing = hud.phase === "playing";

  const pad =
    "flex h-14 w-14 items-center justify-center rounded-xl border-2 border-amber-800 bg-stone-900 text-xl text-amber-200 active:bg-amber-900 select-none touch-none";
  const action =
    "flex h-14 min-w-14 flex-col items-center justify-center rounded-xl border-2 px-2 text-[9px] leading-tight select-none touch-none";

  return (
    <div className="hidden items-end justify-between gap-2 pt-1 pointer-coarse:flex" aria-label="터치 조작">
      <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
        <span />
        <button type="button" aria-label="위로 (사다리 오르기)" className={pad} {...hold("touch-up", () => input.pressVertical("touch-up", -1))}>
          ▲
        </button>
        <span />
        <button type="button" aria-label="왼쪽으로 이동" className={pad} {...hold("touch-left", () => input.pressMove("touch-left", -1))}>
          ◀
        </button>
        <button type="button" aria-label="아래로 (사다리 내려가기)" className={pad} {...hold("touch-down", () => input.pressVertical("touch-down", 1))}>
          ▼
        </button>
        <button type="button" aria-label="오른쪽으로 이동" className={pad} {...hold("touch-right", () => input.pressMove("touch-right", 1))}>
          ▶
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          aria-label="조사 · 열기 (E)"
          disabled={!playing}
          className={`${action} border-amber-500 bg-amber-950 text-amber-100 active:bg-amber-800 disabled:opacity-40`}
          {...tap(() => input.trigger("interact"))}
        >
          <span className="text-sm">E</span>조사
        </button>
        <button
          type="button"
          aria-label="점프"
          className={`${action} row-span-2 h-auto rounded-full border-orange-500 bg-orange-950 text-orange-100 active:bg-orange-800`}
          {...hold("touch-jump", () => input.setJump("touch-jump", true))}
        >
          JUMP
        </button>
        <button
          type="button"
          aria-label="선택한 아이템 사용 (F)"
          disabled={!playing}
          className={`${action} border-stone-500 bg-stone-900 text-stone-100 active:bg-stone-700 disabled:opacity-40`}
          {...tap(() => input.trigger("use"))}
        >
          <span className="text-sm">F</span>사용
        </button>
      </div>
    </div>
  );
}
