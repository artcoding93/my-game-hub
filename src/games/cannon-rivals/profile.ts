import { ECONOMY, ITEM_RULES } from "./config";
import { ITEM_IDS, type ItemId } from "./types";

/*
 * 코인·상점 구매 목록·전적 (localStorage 한 키에 JSON으로 저장, 순수 함수).
 * - 코인은 게임 안에서만 쓰는 가상 재화이며 실제 결제·광고 시청과 연결하지 않는다.
 * - 보상은 전투 번호(battleId)마다 한 번만: rewardedBattleId로 같은 전투에 두 번 지급하지 않는다.
 * - 구매한 아이템(loadout)은 전투 시작 시 takeLoadout으로 한 번에 꺼내고 저장소에서 지운다.
 * 형식을 바꾸면 PROFILE_VERSION을 올린다. 손상되었거나 다른 버전의 데이터는 버리고 새로 시작한다.
 */

export const PROFILE_VERSION = 1;

export interface Profile {
  v: number;
  coins: number;
  wins: number;
  losses: number;
  /** 다음 전투에 가져갈 아이템 (최대 3개) */
  loadout: ItemId[];
  /** 가장 적은 턴으로 이긴 기록 (없으면 null) */
  bestWinTurns: number | null;
  rewardedBattleId: string | null;
}

export function newProfile(): Profile {
  return { v: PROFILE_VERSION, coins: 0, wins: 0, losses: 0, loadout: [], bestWinTurns: null, rewardedBattleId: null };
}

const isCount = (value: unknown, max = 1e9): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;

/** 저장된 문자열을 검증해 읽는다. 잘못된 값이면 null */
export function parseProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const p = data as Record<string, unknown>;
  if (p.v !== PROFILE_VERSION) return null;
  if (!isCount(p.coins) || !isCount(p.wins) || !isCount(p.losses)) return null;
  if (!Array.isArray(p.loadout) || p.loadout.length > ITEM_RULES.maxSlots) return null;
  if (!p.loadout.every((item) => (ITEM_IDS as readonly unknown[]).includes(item))) return null;
  if (p.bestWinTurns !== null && !isCount(p.bestWinTurns, 10000)) return null;
  if (p.rewardedBattleId !== null && (typeof p.rewardedBattleId !== "string" || p.rewardedBattleId.length > 80)) return null;
  return {
    v: PROFILE_VERSION,
    coins: p.coins,
    wins: p.wins,
    losses: p.losses,
    loadout: p.loadout as ItemId[],
    bestWinTurns: (p.bestWinTurns as number | null) ?? null,
    rewardedBattleId: (p.rewardedBattleId as string | null) ?? null,
  };
}

export function serializeProfile(profile: Profile): string {
  return JSON.stringify(profile);
}

export type BuyError = "coins" | "full" | "repairLimit";

/** 살 수 없는 이유 (없으면 null). Repair Kit은 경기당 2회만 쓸 수 있으므로 2개까지만 판다. */
export function buyBlocker(profile: Profile, item: ItemId): BuyError | null {
  if (profile.loadout.length >= ITEM_RULES.maxSlots) return "full";
  if (item === "repairKit" && profile.loadout.filter((i) => i === "repairKit").length >= ITEM_RULES.repairPerMatch) return "repairLimit";
  if (profile.coins < ECONOMY.prices[item]) return "coins";
  return null;
}

export function buyItem(profile: Profile, item: ItemId): Profile {
  if (buyBlocker(profile, item)) return profile;
  return { ...profile, coins: profile.coins - ECONOMY.prices[item], loadout: [...profile.loadout, item] };
}

/** 전투 시작 전 구매 취소 (전액 환불) */
export function refundItem(profile: Profile, index: number): Profile {
  const item = profile.loadout[index];
  if (!item) return profile;
  return { ...profile, coins: profile.coins + ECONOMY.prices[item], loadout: profile.loadout.filter((_, i) => i !== index) };
}

/** 전투 시작: 구매 목록을 꺼내고 비운다. 같은 아이템이 두 전투에 들어가지 않는다. */
export function takeLoadout(profile: Profile): { profile: Profile; items: ItemId[] } {
  return { profile: { ...profile, loadout: [] }, items: [...profile.loadout] };
}

/** 전투 결과 보상. 이미 보상한 전투면 그대로 돌려준다(coins: 0). */
export function rewardBattle(profile: Profile, battleId: string, won: boolean, turns: number): { profile: Profile; coins: number } {
  if (profile.rewardedBattleId === battleId) return { profile, coins: 0 };
  const coins = won ? ECONOMY.winCoins : ECONOMY.loseCoins;
  return {
    coins,
    profile: {
      ...profile,
      coins: profile.coins + coins,
      wins: profile.wins + (won ? 1 : 0),
      losses: profile.losses + (won ? 0 : 1),
      bestWinTurns: won ? Math.min(profile.bestWinTurns ?? Infinity, turns) : profile.bestWinTurns,
      rewardedBattleId: battleId,
    },
  };
}
