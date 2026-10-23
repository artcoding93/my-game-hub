import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ECONOMY } from "./config";
import { buyBlocker, buyItem, newProfile, parseProfile, PROFILE_VERSION, refundItem, rewardBattle, serializeProfile, takeLoadout } from "./profile";

const rich = () => ({ ...newProfile(), coins: 1000 });

describe("코인 상점", () => {
  test("구매하면 가격만큼 코인이 줄고 구매 목록에 들어간다", () => {
    const p = buyItem(rich(), "doubleShot");
    assert.equal(p.coins, 1000 - ECONOMY.prices.doubleShot);
    assert.deepEqual(p.loadout, ["doubleShot"]);
  });

  test("코인 부족·3칸 초과·Repair Kit 3개째는 살 수 없다 (상태 그대로)", () => {
    const poor = { ...newProfile(), coins: 30 };
    assert.equal(buyBlocker(poor, "windShield"), "coins");
    assert.equal(buyItem(poor, "windShield"), poor);
    let p = rich();
    p = buyItem(buyItem(p, "repairKit"), "repairKit");
    assert.equal(buyBlocker(p, "repairKit"), "repairLimit");
    p = buyItem(p, "barrier");
    assert.equal(buyBlocker(p, "aimAssist"), "full");
    assert.equal(buyItem(p, "aimAssist").loadout.length, 3);
  });

  test("전투 전 구매 취소는 전액 환불", () => {
    const p = refundItem(buyItem(rich(), "powerShell"), 0);
    assert.equal(p.coins, 1000);
    assert.deepEqual(p.loadout, []);
  });

  test("전투 시작 시 구매 목록을 한 번만 꺼낸다 (두 번 꺼내도 중복 없음)", () => {
    const bought = buyItem(buyItem(rich(), "aimAssist"), "barrier");
    const first = takeLoadout(bought);
    assert.deepEqual(first.items, ["aimAssist", "barrier"]);
    assert.deepEqual(first.profile.loadout, []);
    assert.deepEqual(takeLoadout(first.profile).items, []);
    assert.equal(first.profile.coins, bought.coins, "코인은 다시 빠지지 않는다");
  });
});

describe("승패 보상", () => {
  test("승리 100, 패배 30, 전적 기록", () => {
    const win = rewardBattle(newProfile(), "b1", true, 9);
    assert.equal(win.coins, ECONOMY.winCoins);
    assert.equal(win.profile.wins, 1);
    assert.equal(win.profile.bestWinTurns, 9);
    const lose = rewardBattle(win.profile, "b2", false, 14);
    assert.equal(lose.profile.coins, ECONOMY.winCoins + ECONOMY.loseCoins);
    assert.equal(lose.profile.losses, 1);
    assert.equal(lose.profile.bestWinTurns, 9);
  });

  test("같은 전투에는 두 번 보상하지 않는다", () => {
    const once = rewardBattle(newProfile(), "battle-x", true, 10);
    const twice = rewardBattle(once.profile, "battle-x", true, 10);
    assert.equal(twice.coins, 0);
    assert.equal(twice.profile, once.profile);
  });
});

describe("저장 형식", () => {
  test("저장 → 읽기 왕복", () => {
    const p = rewardBattle(buyItem(rich(), "aimAssist"), "b", true, 7).profile;
    assert.deepEqual(parseProfile(serializeProfile(p)), p);
  });

  test("손상되거나 형식이 다른 데이터는 거부한다", () => {
    const good = JSON.parse(serializeProfile(rich()));
    const bad = [
      null,
      "",
      "{",
      "[]",
      JSON.stringify({ ...good, v: PROFILE_VERSION + 1 }),
      JSON.stringify({ ...good, coins: -5 }),
      JSON.stringify({ ...good, coins: 1.5 }),
      JSON.stringify({ ...good, loadout: ["nuke"] }),
      JSON.stringify({ ...good, loadout: ["barrier", "barrier", "barrier", "barrier"] }),
      JSON.stringify({ ...good, wins: "3" }),
    ];
    for (const raw of bad) assert.equal(parseProfile(raw), null, String(raw));
  });
});
