import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CRATE, DAMAGE, ENERGY, ITEM_RULES, TANK, TIMING, WORLD_H } from "../config";
import type { GameEvent, GameState } from "../types";
import { armItem, createBattle, playerFire, setAim, togglePause } from "./game";
import { DT, dropShell, flatBattle, run, runTurn } from "./testUtils";

const hits = (events: GameEvent[]) => events.filter((e): e is Extract<GameEvent, { type: "hit" }> => e.type === "hit");

/** AI 탱크 바로 위에서 떨어뜨려 직접 명중시킨다 */
function directHitAi(state: GameState, damageScale = 1) {
  const ai = state.tanks.ai;
  dropShell(state, ai.x, ai.y - 30, "player", damageScale);
  return run(state, 0.5);
}

describe("턴 진행", () => {
  test("플레이어 선공, 시간 제한 없이 대기", () => {
    const state = flatBattle();
    assert.equal(state.phase, "playerAim");
    assert.equal(state.turn, "player");
    run(state, 60);
    assert.equal(state.phase, "playerAim", "60초가 지나도 플레이어 턴 유지");
  });

  test("발사 → 착탄 → AI 약 1초 조준 → AI 발사 → 다시 플레이어 턴", () => {
    const state = flatBattle();
    setAim(state, 45, 30);
    playerFire(state);
    assert.equal(state.phase, "resolving");
    runTurn(state);
    assert.equal(state.phase, "aiAim");
    assert.equal(state.turn, "ai");
    run(state, TIMING.aiAim - 0.1);
    assert.equal(state.phase, "aiAim", "1초가 되기 전에는 쏘지 않는다");
    run(state, 0.15);
    assert.equal(state.phase, "resolving");
    runTurn(state);
    assert.equal(state.turn, "player");
    assert.equal(state.phase, "playerAim");
    assert.equal(state.turnCount, 2);
  });

  test("상대 턴에는 플레이어가 쏘거나 조준을 바꿀 수 없다", () => {
    const state = flatBattle();
    playerFire(state);
    assert.deepEqual(playerFire(state), []);
    const before = state.tanks.player.angle;
    setAim(state, 70, 70);
    assert.equal(state.tanks.player.angle, before);
  });
});

describe("피해량", () => {
  test("직접 명중 25", () => {
    const state = flatBattle();
    const [hit] = hits(directHitAi(state));
    assert.equal(hit.direct, true);
    assert.equal(hit.damage, DAMAGE.direct);
    assert.equal(state.tanks.ai.hp, TANK.maxHp - DAMAGE.direct);
  });

  test("폭발 범위 피해는 거리에 비례해 5~20", () => {
    const damages = [18, 30, 45].map((dx) => {
      const state = flatBattle();
      dropShell(state, state.tanks.ai.x - dx, 395);
      const [hit] = hits(run(state, 0.5)).filter((h) => h.target === "ai");
      assert.ok(hit && !hit.direct);
      return hit.damage;
    });
    assert.ok(damages[0] > damages[1] && damages[1] > damages[2], damages.join(","));
    for (const d of damages) assert.ok(d >= DAMAGE.splashMin && d <= DAMAGE.splashMax, `${d}`);
    const far = flatBattle();
    dropShell(far, far.tanks.ai.x - 120, 395);
    assert.equal(hits(run(far, 0.5)).length, 0, "범위 밖은 피해 없음");
  });

  test("Power Shell ×1.4 = 35, Barrier는 다음 피격 피해 50% (한 번만)", () => {
    const state = flatBattle();
    assert.equal(hits(directHitAi(state, DAMAGE.powerShellScale))[0].damage, 35);
    const shielded = flatBattle();
    shielded.tanks.ai.barrier = true;
    const [blocked] = hits(directHitAi(shielded));
    assert.equal(blocked.blocked, true);
    assert.equal(blocked.damage, Math.round(DAMAGE.direct * DAMAGE.barrierScale));
    assert.equal(shielded.tanks.ai.barrier, false);
  });

  test("Double Shot: 두 발 발사, 각 60% 피해", () => {
    const state = flatBattle();
    state.tanks.player.inventory = ["doubleShot"];
    assert.ok(armItem(state, 0));
    const events = playerFire(state);
    assert.equal(state.projectiles.length, 1);
    assert.equal(state.pending.length, 1);
    events.push(...run(state, ITEM_RULES.doubleShotDelay + DT * 2));
    assert.equal(events.filter((e) => e.type === "fire").length, 2);
    for (const p of state.projectiles) assert.equal(p.damageScale, DAMAGE.doubleShotScale);
    const direct = flatBattle();
    assert.equal(hits(directHitAi(direct, DAMAGE.doubleShotScale))[0].damage, 15);
  });
});

describe("지형 파괴와 낙하", () => {
  test("폭발 위치에 구덩이가 생기고 지형 데이터가 바뀐다", () => {
    const state = flatBattle();
    dropShell(state, 480, 395);
    run(state, 0.3);
    assert.ok(state.terrain[480] > 425);
  });

  test("발밑이 깎이면 탱크가 떨어지고, 높이 떨어지면 낙하 피해", () => {
    const state = flatBattle();
    const ai = state.tanks.ai;
    for (let x = ai.x - 20; x <= ai.x + 20; x++) state.terrain[x] = 470;
    state.phase = "resolving";
    const events = run(state, 1.5);
    assert.equal(ai.y, 470);
    const fall = events.find((e) => e.type === "fallDamage");
    assert.ok(fall && fall.type === "fallDamage" && fall.damage >= DAMAGE.fallMin && fall.damage <= DAMAGE.fallMax);
  });

  test("낮게 떨어지면 피해 없음", () => {
    const state = flatBattle();
    const ai = state.tanks.ai;
    for (let x = ai.x - 20; x <= ai.x + 20; x++) state.terrain[x] = 400 + DAMAGE.fallSafe - 4;
    state.phase = "resolving";
    assert.equal(run(state, 1).filter((e) => e.type === "fallDamage").length, 0);
  });

  test("바닥이 뚫리면 화면 밖으로 떨어져 즉시 패배", () => {
    const state = flatBattle();
    const ai = state.tanks.ai;
    for (let x = ai.x - 20; x <= ai.x + 20; x++) state.terrain[x] = WORLD_H;
    state.phase = "resolving";
    const events = run(state, 2);
    assert.ok(events.some((e) => e.type === "fellOff"));
    assert.equal(state.phase, "gameOver");
    assert.equal(state.winner, "player");
    assert.equal(state.endReason, "fell");
  });
});

describe("승패", () => {
  test("HP가 0이 되는 즉시 끝나고 남은 포탄은 사라진다", () => {
    const state = flatBattle();
    state.tanks.ai.hp = 10;
    dropShell(state, state.tanks.ai.x, state.tanks.ai.y - 30);
    state.pending.push({ delay: 0.3, owner: "player", angle: 45, power: 60, damageScale: 1, windScale: 1 });
    const events = run(state, 1);
    assert.equal(events.filter((e) => e.type === "gameOver").length, 1);
    assert.equal(state.phase, "gameOver");
    assert.equal(state.projectiles.length + state.pending.length, 0);
    assert.equal(run(state, 2).length, 0, "끝난 뒤에는 아무 일도 일어나지 않는다");
  });

  test("한 발에 둘 다 쓰러지면 쏜 쪽 승리", () => {
    const state = flatBattle();
    state.tanks.ai.hp = 5;
    state.tanks.player.hp = 5;
    // 플레이어 탱크와 AI 탱크 사이가 아니라 두 탱크 모두 범위에 들도록 가깝게 둔다
    state.tanks.ai.x = state.tanks.player.x + 40;
    state.tanks.ai.y = 400;
    dropShell(state, state.tanks.player.x + 20, 395, "player");
    run(state, 0.5);
    assert.equal(state.winner, "player");
  });
});

describe("아이템", () => {
  test("한 턴에 하나만 고르고, 다시 누르면 취소, FIRE 때 소모된다", () => {
    const state = flatBattle();
    state.tanks.player.inventory = ["powerShell", "windShield"];
    assert.ok(armItem(state, 0));
    assert.ok(armItem(state, 1));
    assert.equal(state.armedSlot, 1, "다른 칸을 고르면 바뀐다(동시 사용 없음)");
    assert.ok(armItem(state, 1));
    assert.equal(state.armedSlot, null);
    armItem(state, 0);
    const events = playerFire(state);
    assert.ok(events.some((e) => e.type === "itemUsed" && e.item === "powerShell"));
    assert.deepEqual(state.tanks.player.inventory, ["windShield"]);
    assert.equal(state.projectiles[0].damageScale, DAMAGE.powerShellScale);
  });

  test("Repair Kit: 25 회복(최대 100), 경기당 2회, 가득 차면 쓸 수 없음", () => {
    const state = flatBattle();
    const tank = state.tanks.player;
    tank.inventory = ["repairKit", "repairKit", "repairKit"];
    assert.equal(armItem(state, 0), false, "HP가 가득 차면 쓸 수 없다");
    for (const hp of [50, 90]) {
      state.phase = "playerAim";
      state.turn = "player";
      tank.hp = hp;
      assert.ok(armItem(state, 0));
      playerFire(state);
      state.projectiles = [];
    }
    assert.equal(tank.hp, 100);
    assert.equal(tank.repairsUsed, 2);
    state.phase = "playerAim";
    tank.hp = 40;
    assert.equal(armItem(state, 0), false, "세 번째는 쓸 수 없다");
  });

  test("자기 턴에만 쓸 수 있다", () => {
    const state = flatBattle();
    state.tanks.player.inventory = ["barrier"];
    state.phase = "aiAim";
    state.turn = "ai";
    assert.equal(armItem(state, 0), false);
  });

  test("Wind Shield는 이번 포탄의 바람 영향을 30%로", () => {
    const state = flatBattle();
    state.tanks.player.inventory = ["windShield"];
    armItem(state, 0);
    playerFire(state);
    assert.equal(state.projectiles[0].windScale, ITEM_RULES.windShieldScale);
  });
});

describe("명중 에너지", () => {
  test("직접 +25, 범위 +10, 100이 되면 아이템 지급 후 초과분 이월", () => {
    const state = flatBattle();
    directHitAi(state);
    assert.equal(state.tanks.player.energy, ENERGY.direct);
    const splash = flatBattle();
    dropShell(splash, splash.tanks.ai.x - 30, 395);
    run(splash, 0.5);
    assert.equal(splash.tanks.player.energy, ENERGY.splash);

    const full = flatBattle();
    full.tanks.player.energy = 90;
    const events = directHitAi(full);
    assert.ok(events.some((e) => e.type === "itemGranted" && e.source === "energy"));
    assert.equal(full.tanks.player.inventory.length, 1);
    assert.equal(full.tanks.player.energy, 15);
  });

  test("칸이 가득 차 있으면 지급을 미루고 에너지는 100에서 대기", () => {
    const state = flatBattle();
    state.tanks.player.inventory = ["barrier", "barrier", "barrier"];
    state.tanks.player.energy = 90;
    directHitAi(state);
    assert.equal(state.tanks.player.inventory.length, ITEM_RULES.maxSlots);
    assert.equal(state.tanks.player.energy, ENERGY.threshold);
  });

  test("자기 탱크를 맞히면 에너지를 얻지 않는다", () => {
    const state = flatBattle();
    dropShell(state, state.tanks.player.x, state.tanks.player.y - 30);
    run(state, 0.5);
    assert.equal(state.tanks.player.energy, 0);
  });
});

describe("보급 상자", () => {
  test("상자가 없으면 3~4턴마다 두 탱크 사이(겹치지 않게)에 떨어진다", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const state = flatBattle(seed);
      state.crateIn = 3;
      let spawnedAt = -1;
      for (let turn = 0; turn < 6 && spawnedAt < 0; turn++) {
        setAim(state, 85, 10);
        if (state.phase === "playerAim") playerFire(state);
        const events = runTurn(state);
        if (events.some((e) => e.type === "crateSpawn")) spawnedAt = state.turnCount;
      }
      assert.ok(spawnedAt >= CRATE.minTurns && spawnedAt <= CRATE.minTurns + 1, `seed ${seed}: ${spawnedAt}`);
      const crate = state.crate!;
      assert.ok(crate.x >= state.tanks.player.x + CRATE.tankClearance && crate.x <= state.tanks.ai.x - CRATE.tankClearance);
    }
  });

  test("포탄으로 직접 맞히면 쏜 쪽이 아이템을 얻고 상자는 사라진다", () => {
    const state = flatBattle();
    state.crate = { x: 480, y: 400, vy: 0, landing: false };
    dropShell(state, 480, 380);
    const events = run(state, 0.4);
    assert.ok(events.some((e) => e.type === "crateCollected" && e.by === "player"));
    assert.equal(state.tanks.player.inventory.length, 1);
    assert.equal(state.crate, null);
    assert.ok(state.crateIn >= CRATE.minTurns && state.crateIn <= CRATE.maxTurns);
  });

  test("근처 폭발에 휘말리면 아이템 없이 부서진다", () => {
    const state = flatBattle();
    state.crate = { x: 480, y: 400, vy: 0, landing: false };
    dropShell(state, 505, 395);
    const events = run(state, 0.4);
    assert.ok(events.some((e) => e.type === "crateDestroyed"));
    assert.equal(state.tanks.player.inventory.length, 0);
  });
});

describe("일시정지·재대전", () => {
  test("일시정지 중에는 포탄도 AI도 멈춘다", () => {
    const state = flatBattle();
    playerFire(state);
    togglePause(state);
    const before = { ...state.projectiles[0] };
    assert.equal(run(state, 2).length, 0);
    assert.equal(state.projectiles[0].x, before.x);
    togglePause(state);
    run(state, 0.1);
    assert.notEqual(state.projectiles[0]?.x ?? -1, before.x);
  });

  test("같은 시드는 같은 전투를, 다른 시드는 다른 전장을 만든다 (재대전은 새 상태)", () => {
    const a = createBattle({ field: "frozenRidge", difficulty: "hard", seed: 42 }).state;
    const b = createBattle({ field: "frozenRidge", difficulty: "hard", seed: 42 }).state;
    const c = createBattle({ field: "frozenRidge", difficulty: "hard", seed: 43 }).state;
    assert.deepEqual([...a.terrain], [...b.terrain]);
    assert.equal(a.wind, b.wind);
    assert.notDeepEqual([...a.terrain], [...c.terrain]);
    a.tanks.player.hp = 1;
    assert.equal(b.tanks.player.hp, TANK.maxHp, "상태를 공유하지 않는다");
    assert.notEqual(a.battleId, c.battleId);
  });

  test("상점 아이템은 전투 시작 시 인벤토리에 들어간다 (최대 3개)", () => {
    const { state } = createBattle({ field: "greenHills", difficulty: "easy", seed: 7, loadout: ["aimAssist", "barrier"] });
    assert.deepEqual(state.tanks.player.inventory, ["aimAssist", "barrier"]);
    assert.deepEqual(state.tanks.ai.inventory, []);
  });
});
