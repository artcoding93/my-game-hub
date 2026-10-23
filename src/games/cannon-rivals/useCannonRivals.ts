import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { readStoredNumber, readStoredString, writeStoredNumber, writeStoredString } from "@/lib/storage";
import { CannonAudio } from "./audio/CannonAudio";
import { STORAGE_KEYS } from "./config";
import { CannonRivalsController } from "./controller";
import { buyItem, newProfile, parseProfile, refundItem, rewardBattle, serializeProfile, takeLoadout, type Profile } from "./profile";
import type { Difficulty, EndReason, FieldId, ItemId, Side } from "./types";

/** 입력 칸이나 링크에 포커스가 있으면 게임 키를 가로채지 않는다(Enter로 헤더·푸터 링크를 열 수 있게). */
function isPageControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("a[href]") !== null)
  );
}

function newSeed() {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
}

export type Screen = "title" | "howto" | "field" | "difficulty" | "shop" | "battle";

export interface BattleResult {
  winner: Side;
  reason: EndReason;
  coins: number;
  turns: number;
}

function loadProfile(): Profile {
  return parseProfile(readStoredString(STORAGE_KEYS.profile)) ?? newProfile();
}

/**
 * 컨트롤러·사운드 생성, 메뉴 흐름, 코인·구매·전적 저장, 키보드 입력, 탭 전환 시 자동 일시정지를 담당한다.
 * (ssr: false로만 로드되므로 초기화 시점에 window·localStorage를 써도 안전하다.)
 */
export function useCannonRivals(rootRef: RefObject<HTMLElement | null>) {
  const [controller] = useState(() => new CannonRivalsController());
  // 효과음·배경음악은 기본 꺼짐. 설정은 게임별 키에 저장한다.
  const [audio] = useState(() => new CannonAudio(readStoredNumber(STORAGE_KEYS.sfx, 0) === 1, readStoredNumber(STORAGE_KEYS.music, 0) === 1));
  const [soundOn, setSoundOn] = useState(audio.sfxEnabled);
  const [musicOn, setMusicOn] = useState(audio.musicEnabled);
  const [profile, setProfileState] = useState<Profile>(loadProfile);
  const profileRef = useRef(profile);
  const [screen, setScreen] = useState<Screen>("title");
  const [field, setField] = useState<FieldId>("greenHills");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [result, setResult] = useState<BattleResult | null>(null);
  const hud = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getHud(),
    () => controller.getHud(),
  );

  const saveProfile = useCallback((next: Profile) => {
    profileRef.current = next;
    setProfileState(next);
    writeStoredString(STORAGE_KEYS.profile, serializeProfile(next));
  }, []);

  // 전투 이벤트 → 사운드, 승패 보상(전투마다 한 번)
  useEffect(() => {
    const off = controller.onEvents((events) => {
      audio.handle(events);
      const over = events.find((e) => e.type === "gameOver");
      const state = controller.state;
      if (!over || over.type !== "gameOver" || !state) return;
      const reward = rewardBattle(profileRef.current, state.battleId, over.winner === "player", state.turnCount + 1);
      if (reward.coins > 0) saveProfile(reward.profile);
      setResult({ winner: over.winner, reason: over.reason, coins: reward.coins, turns: state.turnCount + 1 });
    });
    return () => {
      off();
      audio.dispose();
    };
  }, [controller, audio, saveProfile]);

  // 개발 서버에서만 브라우저 테스트·디버깅용으로 노출한다(프로덕션 빌드에서는 제거됨).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const debug = window as unknown as { __CANNON_RIVALS__?: unknown };
    debug.__CANNON_RIVALS__ = { controller, audio };
    return () => {
      delete debug.__CANNON_RIVALS__;
    };
  }, [controller, audio]);

  const toggleSound = useCallback(() => {
    const next = !audio.sfxEnabled;
    audio.setSfxEnabled(next);
    setSoundOn(next);
    writeStoredNumber(STORAGE_KEYS.sfx, next ? 1 : 0);
    if (next) audio.click();
  }, [audio]);

  const toggleMusic = useCallback(() => {
    const next = !audio.musicEnabled;
    audio.setMusicEnabled(next);
    setMusicOn(next);
    writeStoredNumber(STORAGE_KEYS.music, next ? 1 : 0);
    if (next) {
      const state = controller.state;
      if (state && state.phase !== "gameOver") {
        audio.startBattleMusic(state.field);
        if (state.paused) audio.setPaused(true);
      } else audio.cueMusic(field);
    }
  }, [audio, controller, field]);

  const go = useCallback(
    (next: Screen) => {
      audio.unlock();
      audio.click();
      setScreen(next);
    },
    [audio],
  );

  const chooseField = useCallback(
    (id: FieldId) => {
      setField(id);
      audio.unlock();
      audio.cueMusic(id);
    },
    [audio],
  );

  const buy = useCallback((item: ItemId) => saveProfile(buyItem(profileRef.current, item)), [saveProfile]);
  const refund = useCallback((index: number) => saveProfile(refundItem(profileRef.current, index)), [saveProfile]);

  /** 전투 시작: 구매 아이템을 꺼내(저장소에서도 비움) 인벤토리에 넣는다. */
  const startBattle = useCallback(() => {
    audio.unlock();
    const { profile: next, items } = takeLoadout(profileRef.current);
    saveProfile(next);
    setResult(null);
    controller.startBattle({ field, difficulty, seed: newSeed(), loadout: items });
    audio.startBattleMusic(field);
    setScreen("battle");
  }, [audio, controller, difficulty, field, saveProfile]);

  /** 전투 중 다시 시작 (이번 전투는 보상 없이 버리고, 같은 설정으로 새 전투) */
  const restart = useCallback(() => {
    audio.unlock();
    setResult(null);
    controller.startBattle({ field, difficulty, seed: newSeed() });
    audio.startBattleMusic(field);
  }, [audio, controller, difficulty, field]);

  /** 메뉴로 나가기 (진행 중이던 전투는 보상 없이 끝남) */
  const quitToMenu = useCallback(
    (next: Screen = "title") => {
      controller.quit();
      setResult(null);
      audio.cueMusic(field);
      go(next);
    },
    [audio, controller, field, go],
  );

  const togglePause = useCallback(() => {
    audio.unlock();
    controller.togglePause();
    audio.setPaused(controller.state?.paused ?? false);
  }, [audio, controller]);

  const fire = useCallback(() => {
    audio.unlock();
    controller.fire();
  }, [audio, controller]);

  const armItem = useCallback(
    (slot: number) => {
      audio.unlock();
      if (controller.armItem(slot)) audio.click();
    },
    [audio, controller],
  );

  // 키보드: 게임 화면이 보이는 동안 전투 중일 때만 방향키·Space를 가로챈다(본문을 읽을 때는 페이지 스크롤 가능)
  const visibleRef = useRef(true);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => (visibleRef.current = entry.isIntersecting), { threshold: 0.35 });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || isPageControlTarget(event.target)) return;
      const state = controller.state;
      if (screen !== "battle" || !state || !visibleRef.current) return;
      const aiming = state.phase === "playerAim" && !state.paused;
      const step = event.shiftKey ? 5 : 1;
      const aim: Record<string, [number, number]> = {
        ArrowUp: [step, 0],
        ArrowDown: [-step, 0],
        ArrowLeft: [0, -step],
        ArrowRight: [0, step],
      };
      if (event.code in aim) {
        event.preventDefault();
        if (aiming) controller.adjustAim(...aim[event.code]);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat && aiming) fire();
        return;
      }
      if (event.code === "Digit1" || event.code === "Digit2" || event.code === "Digit3") {
        event.preventDefault();
        if (!event.repeat) armItem(Number(event.code.slice(5)) - 1);
        return;
      }
      if (event.code === "KeyP" || event.code === "Escape") {
        event.preventDefault();
        if (!event.repeat && state.phase !== "gameOver") togglePause();
        return;
      }
      if (event.code === "Enter" && state.paused) {
        event.preventDefault();
        togglePause();
      }
    }
    function pauseNow() {
      const state = controller.state;
      if (state && !state.paused && state.phase !== "gameOver") {
        controller.pause();
        audio.setPaused(true);
      }
    }
    function handleVisibilityChange() {
      if (document.hidden) pauseNow();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", pauseNow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", pauseNow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [controller, audio, screen, fire, armItem, togglePause]);

  return {
    controller,
    audio,
    hud,
    profile,
    screen,
    field,
    difficulty,
    result,
    soundOn,
    musicOn,
    toggleSound,
    toggleMusic,
    go,
    chooseField,
    setDifficulty,
    buy,
    refund,
    startBattle,
    restart,
    quitToMenu,
    togglePause,
    fire,
    armItem,
  };
}

export type CannonGameApi = ReturnType<typeof useCannonRivals>;
