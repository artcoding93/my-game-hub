import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BOSS, BUBBLE, COMBO_POINTS, EXTRA_LIFE_EVERY, ITEMS, PLAYER, TILE, WORLD_H, WORLD_W } from "../config";
import { STAGES } from "../stages";
import type { Enemy, GameState } from "../types";
import { captureEnemy, createGame, escapeTime, popBubble, spawnItem, stepGame } from "./game";
import { bodyHitsSolid } from "./physics";
import { clearEnemies, count, DT, placeBubble, placeEnemy, placePlayer, playing, run } from "./testUtils";

const FLOOR = 15;

/** 적을 그 자리에서 방울에 가둔다 (테스트용) */
function trap(s: GameState, e: Enemy) {
  const b = placeBubble(s, e.x + e.w / 2, e.y + e.h / 2);
  captureEnemy(s, b, e, []);
  return b;
}

describe("스테이지 데이터", () => {
  test("5개 스테이지: 중급 2 + 고급 3, 마지막은 보스, 시작 위치가 벽 속이 아니다", () => {
    assert.equal(STAGES.length, 5);
    assert.deepEqual(
      STAGES.map((s) => s.tier),
      ["중급", "중급", "고급", "고급", "고급"],
    );
    for (const [i, stage] of STAGES.entries()) {
      const s = playing(i);
      assert.ok(s.enemies.length >= 4, `${stage.name}: 적 ${s.enemies.length}`);
      assert.equal(s.boss !== null, i === 4, stage.name);
      for (const e of s.enemies) assert.ok(!bodyHitsSolid(s.level, e), `${stage.name}: 적이 벽 속에서 시작`);
      assert.ok(!bodyHitsSolid(s.level, s.player));
      assert.ok(stage.gather.length >= 1);
    }
    assert.ok(STAGES[1].movingPlatforms.length >= 2, "장난감 공장: 움직이는 발판");
    assert.ok(STAGES[2].wind, "바람의 탑: 바람");
    assert.ok(STAGES[3].speedScale > STAGES[1].speedScale, "별빛 미로: 빠른 적");
    assert.ok(STAGES[4].enhanced, "시계탑: 강화 적");
  });
});

describe("방울 발사와 포획", () => {
  test("실제 조작: 방울을 쏘면 앞으로 날아가 닿은 적을 가둔다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 4, FLOOR, 1);
    const e = placeEnemy(s, "cogling", 8, FLOOR);
    e.dir = -1;
    const events = run(s, 2, (_s, i) => ({ fire: i === 0 }), () => e.state === "trapped");
    assert.equal(e.state, "trapped");
    assert.equal(count(events, "shoot"), 1);
    assert.equal(count(events, "capture"), 1);
    assert.equal(s.bubbles[0].captive, e);
  });

  test("방울은 약 5칸 날아간 뒤 천천히 떠올라 천장에 닿는다 (발판은 통과)", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 14, FLOOR, 1);
    run(s, 1 / 60, { fire: true });
    const b = s.bubbles[0];
    const startX = b.x;
    run(s, BUBBLE.shotTime + 0.05);
    const travel = b.x - startX;
    assert.ok(travel > 60 && travel < 100, `발사 거리 ${travel}`);
    assert.equal(b.phase, "float");
    const y0 = b.y;
    run(s, 1);
    assert.ok(b.y < y0 - 10, "떠오름");
    run(s, 7);
    assert.ok(b.y < 40, `천장 근처 ${b.y}`);
  });

  test("떠오른 방울은 천장에서 모이는 지점으로 미끄러지고, 서로 겹치지 않는다", () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    const a = placeBubble(s, 200, 40);
    const b = placeBubble(s, 201, 60);
    run(s, 6);
    for (const x of [a, b]) assert.ok(Math.abs(x.x + x.w / 2 - 104) < 30, `gather ${x.x}`);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    assert.ok(d >= BUBBLE.size * 0.8, `겹침 ${d}`);
  });

  test("바람 스테이지에서는 방울이 바람 방향으로 밀린다", () => {
    const s = playing(2);
    clearEnemies(s);
    s.player.invulnerable = 99;
    s.stageTime = 0;
    s.wind = 1;
    const b = placeBubble(s, 200, 150);
    const x0 = b.x;
    run(s, 1);
    assert.ok(b.x > x0 + 20, `바람에 밀림 ${b.x - x0}`);
  });

  test("빈 방울은 시간이 지나면 저절로 터지고 점수는 없다", () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    placeBubble(s, 200, 100).age = 0;
    const score = s.score;
    const events = run(s, BUBBLE.life + 0.2);
    assert.equal(s.bubbles.length, 0);
    assert.equal(count(events, "fizz"), 1);
    assert.equal(s.score, score);
  });

  test("갇힌 적을 그대로 두면 경고 뒤 탈출하고, 화가 나서 빨라진다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 2, FLOOR);
    s.player.invulnerable = 99;
    const e = placeEnemy(s, "cogling", 20, FLOOR);
    trap(s, e);
    const events = run(s, escapeTime(e) + 0.1);
    assert.equal(count(events, "warn"), 1);
    assert.equal(count(events, "escape"), 1);
    assert.equal(e.state, "active");
    assert.ok(e.angry > 0);
    assert.equal(s.bubbles.length, 0);
    assert.ok(!bodyHitsSolid(s.level, e));
  });
});

describe("터뜨리기·연쇄·콤보", () => {
  test("플레이어가 갇힌 적 방울에 닿으면 터지고, 적이 쓰러지며 보너스가 나온다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 10, FLOOR);
    const e = placeEnemy(s, "cogling", 14, FLOOR);
    const b = trap(s, e);
    b.x = s.player.x + 20;
    b.y = s.player.y - 2;
    const events = run(s, 1.5, { move: 1 }, () => e.state === "dead");
    assert.equal(e.state, "dead");
    assert.equal(count(events, "kill"), 1);
    assert.ok(s.items.some((it) => it.kind === "candy"));
  });

  test("닿아 있는 방울은 연쇄로 함께 터지고, 이어 없앤 적 수만큼 콤보 점수가 커진다", () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    placePlayer(s, 2, FLOOR);
    const bubbles = [0, 1, 2, 3].map((k) => {
      const e = placeEnemy(s, "cogling", 10 + k, FLOOR);
      const b = trap(s, e);
      b.x = 160 + k * (BUBBLE.captiveSize + 1);
      b.y = 120;
      return b;
    });
    // 빈 방울도 하나 끼워 둔다 (연쇄를 잇는다)
    const empty = placeBubble(s, 160 + 4 * (BUBBLE.captiveSize + 1) + 8, 130);
    const events: ReturnType<typeof run> = [];
    popBubble(s, bubbles[0], events);
    events.push(...run(s, 1));
    const kills = events.filter((e) => e.type === "kill");
    assert.deepEqual(
      kills.map((k) => (k.type === "kill" ? k.combo : 0)),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      kills.map((k) => (k.type === "kill" ? k.points : 0)),
      COMBO_POINTS.slice(0, 4),
    );
    assert.ok(!s.bubbles.includes(empty), "빈 방울도 연쇄로 터짐");
    assert.ok(s.items.some((it) => it.kind === "gem"), "콤보 3 이상은 보석");
    assert.equal(s.stats.bestCombo, 4);
  });

  test("떨어져 있는 방울은 함께 터지지 않는다", () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    const a = placeBubble(s, 100, 120);
    const b = placeBubble(s, 200, 120);
    popBubble(s, a, []);
    run(s, 0.5);
    assert.ok(s.bubbles.includes(b));
  });
});

describe("방울 발판", () => {
  test("점프 키를 누른 채 위에서 밟으면 터지지 않고 튕겨 오른다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 14, FLOOR);
    const p = s.player;
    const b = placeBubble(s, p.x + p.w / 2, 170);
    b.age = 0;
    p.y = b.y - p.h - 6;
    p.vy = 120;
    p.grounded = false;
    const events = run(s, 0.25, { jumpHeld: true }, (_s, ev) => ev.some((e) => e.type === "bubbleBounce"));
    assert.equal(count(events, "bubbleBounce"), 1);
    assert.ok(p.vy < -340, `튕김 ${p.vy}`);
    assert.ok(s.bubbles.includes(b), "방울 유지");
    // 튕긴 높이: 방울 윗면보다 한참 위로 올라간다
    const top = b.y;
    run(s, 0.3, { jumpHeld: true });
    assert.ok(p.y + p.h < top - 40);
  });

  test("점프 키 없이 떨어지면 방울이 터진다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 14, FLOOR);
    const p = s.player;
    const b = placeBubble(s, p.x + p.w / 2, 170);
    p.y = b.y - p.h - 6;
    p.vy = 120;
    p.grounded = false;
    const events = run(s, 0.3);
    assert.equal(count(events, "pop"), 1);
    assert.ok(!s.bubbles.includes(b));
  });

  test("방울을 밟아 튕기면 보통 점프로 닿지 않는 위층 발판에 올라설 수 있다", () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    // 바닥(발 y=240)에서 가운데 발판(윗면 y=128)까지 112px: 보통 점프(약 74px)로는 닿지 않는다
    placePlayer(s, 15, FLOOR);
    const p = s.player;
    const normal = playing(0);
    clearEnemies(normal);
    placePlayer(normal, 15, FLOOR);
    let peak = normal.player.y;
    run(normal, 1, (st, i) => {
      peak = Math.min(peak, st.player.y);
      return { jump: i === 0, jumpHeld: true };
    });
    assert.ok(peak + normal.player.h > 128 + 30, "보통 점프로는 닿지 않음");
    // 바닥 위 방울 하나를 밟고 튕긴다
    const b = placeBubble(s, p.x + p.w / 2, 200);
    p.y = b.y - p.h - 4;
    p.vy = 60;
    p.grounded = false;
    run(s, 1.5, { jumpHeld: true });
    assert.ok(p.grounded, "착지");
    assert.ok(Math.abs(p.y + p.h - 128) < 1, `위층 발판에 섬 (발 y=${(p.y + p.h).toFixed(1)})`);
  });
});

describe("조작", () => {
  test("이동·점프·발사를 같은 순간에 눌러도 모두 반영된다 (동시 터치)", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 10, FLOOR, -1);
    const x = s.player.x;
    const events = run(s, 0.2, (_s, i) => ({ move: 1, jump: i === 0, jumpHeld: true, fire: i === 0 }));
    assert.ok(s.player.x > x);
    assert.equal(s.player.facing, 1);
    assert.equal(count(events, "jump"), 1);
    assert.equal(count(events, "shoot"), 1);
  });

  test("발사 키를 누르고 있으면 쿨다운 간격으로 연사, Rapid Bubble은 두 배 빠르다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 3, FLOOR);
    s.player.invulnerable = 99;
    const normal = count(run(s, 1.95, { fire: true }), "shoot");
    const r = playing(0);
    clearEnemies(r);
    placePlayer(r, 3, FLOOR);
    r.player.rapid = ITEMS.duration;
    const rapid = count(run(r, 1.95, { fire: true }), "shoot");
    assert.ok(normal >= 5 && normal <= 7, `보통 ${normal}`);
    assert.ok(rapid >= normal * 1.7, `연사 ${rapid}`);
  });

  test("벽에 붙어 쏘아도 방울이 벽 속에 생기지 않는다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 1, FLOOR, -1);
    s.player.x = 16.5;
    run(s, 1 / 60, { fire: true });
    assert.equal(s.bubbles.length, 1);
    assert.ok(!bodyHitsSolid(s.level, s.bubbles[0]));
  });

  test("화면의 방울 수에는 상한이 있다 (가장 오래된 빈 방울부터 터짐)", () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    for (let k = 0; k < BUBBLE.maxOnScreen + 4; k++) placeBubble(s, 40 + k * 18, 100);
    placePlayer(s, 3, FLOOR);
    run(s, 1 / 60, { fire: true });
    assert.ok(s.bubbles.length <= BUBBLE.maxOnScreen + 4);
  });
});

describe("피해·아이템", () => {
  test("적에 닿으면 목숨 1개를 잃고 잠시 무적, Star Shield는 1회 막는다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 10, FLOOR);
    s.player.invulnerable = 0;
    s.player.shield = true;
    const e = placeEnemy(s, "cogling", 10, FLOOR);
    let events = run(s, 1 / 60);
    assert.equal(count(events, "shieldBlock"), 1);
    assert.equal(s.player.lives, PLAYER.lives);
    s.player.invulnerable = 0;
    e.x = s.player.x;
    events = run(s, 1 / 60);
    assert.equal(count(events, "hurt"), 1);
    assert.equal(s.player.lives, PLAYER.lives - 1);
    assert.ok(s.player.invulnerable > 1.5);
  });

  test("갇힌 적은 닿아도 피해가 없다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 10, FLOOR);
    s.player.invulnerable = 0;
    const e = placeEnemy(s, "cogling", 10, FLOOR);
    e.state = "trapped";
    const events = run(s, 0.2);
    assert.equal(count(events, "hurt"), 0);
  });

  test("Time Freeze 동안 적과 갇힌 방울의 탈출 시간이 멈춘다", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 2, FLOOR);
    s.player.invulnerable = 99;
    const e = placeEnemy(s, "zipwind", 20, FLOOR);
    const t = placeEnemy(s, "cogling", 24, FLOOR);
    const b = trap(s, t);
    spawnItem(s, "freeze", s.player.x + 6, s.player.y + 6, []);
    run(s, 0.6);
    assert.ok(s.freeze > 0);
    const x = e.x;
    const ct = b.captiveTime;
    run(s, 2);
    assert.equal(e.x, x);
    assert.equal(b.captiveTime, ct);
  });

  test("아이템 효과: Giant Bubble은 큰 방울, Lucky Star는 추가 점수", () => {
    const s = playing(0);
    clearEnemies(s);
    placePlayer(s, 10, FLOOR);
    spawnItem(s, "giant", s.player.x + 6, s.player.y + 6, []);
    run(s, 0.6);
    assert.ok(s.player.giant > 0);
    run(s, 1 / 60, { fire: true });
    assert.equal(s.bubbles[0].w, BUBBLE.giantSize);
    const score = s.score;
    spawnItem(s, "lucky", s.player.x + 6, s.player.y + 6, []);
    run(s, 0.6);
    assert.ok(s.score - score >= 5000);
  });

  test("아이템은 과하게 나오지 않는다 (화면에 1개, 스테이지당 3개, 8초 간격)", () => {
    const s = playing(0, 3);
    clearEnemies(s);
    s.player.invulnerable = 1e9;
    placePlayer(s, 2, FLOOR);
    let spawned = 0;
    for (let k = 0; k < 60; k++) {
      const e = placeEnemy(s, "cogling", 20, FLOOR);
      const b = trap(s, e);
      const ev: ReturnType<typeof run> = [];
      popBubble(s, b, ev);
      spawned += ev.filter((x) => x.type === "itemSpawn" && x.kind !== "candy" && x.kind !== "gem").length;
      run(s, 1);
      s.items = s.items.filter((it) => it.kind !== "candy" && it.kind !== "gem");
    }
    assert.ok(spawned >= 1 && spawned <= ITEMS.perStage, `아이템 ${spawned}`);
  });

  test(`${EXTRA_LIFE_EVERY}점마다 목숨이 하나 늘어난다`, () => {
    const s = playing(0);
    clearEnemies(s);
    s.player.invulnerable = 99;
    s.score = EXTRA_LIFE_EVERY - 10;
    spawnItem(s, "candy", s.player.x + 6, s.player.y + 6, []);
    const events = run(s, 0.6);
    assert.equal(count(events, "extraLife"), 1);
    assert.equal(s.player.lives, PLAYER.lives + 1);
  });
});

describe("스테이지 진행", () => {
  test("적을 모두 없애면 스테이지가 끝나고, 중급 2판을 깨면 체크포인트가 열린다", () => {
    for (const i of [0, 1]) {
      const s = playing(i);
      s.player.invulnerable = 999;
      for (const e of [...s.enemies]) popBubble(s, trap(s, e), []);
      const events = run(s, 0.2);
      const clear = events.find((e) => e.type === "stageClear");
      assert.ok(clear && clear.type === "stageClear");
      assert.equal(clear.checkpoint, i === 1);
      run(s, 4);
      assert.equal(s.stageIndex, i + 1);
      assert.equal(s.phase, "intro");
    }
  });

  test("갇힌 적이 남아 있으면 클리어되지 않는다", () => {
    const s = playing(0);
    s.player.invulnerable = 999;
    const [first, ...rest] = s.enemies;
    for (const e of rest) popBubble(s, trap(s, e), []);
    trap(s, first);
    run(s, 1);
    assert.equal(s.phase, "play");
  });

  test("목숨을 모두 잃으면 게임 오버, 새 게임은 1스테이지·목숨 3개로 시작", () => {
    const s = playing(0);
    s.player.lives = 1;
    s.player.invulnerable = 0;
    const e = s.enemies[0];
    placePlayer(s, Math.floor((e.x + e.w / 2) / TILE), Math.round((e.y + e.h) / TILE));
    run(s, 0.1);
    assert.equal(s.phase, "dying");
    const events = run(s, 2);
    assert.equal(s.phase, "gameover");
    assert.equal(count(events, "gameOver"), 1);
    const again = createGame({ seed: 1 });
    assert.equal(again.stageIndex, 0);
    assert.equal(again.player.lives, PLAYER.lives);
  });

  test("체크포인트에서 시작하면 고급 1(바람의 탑)부터", () => {
    const s = createGame({ seed: 1, startStage: 2 });
    assert.equal(s.stage.theme, "tower");
    assert.ok(s.checkpointReached);
  });

  test("같은 시드·입력이면 같은 게임이 된다", () => {
    const play = () => {
      const s = playing(2, 42);
      run(s, 12, (_s, i) => ({ move: i % 120 < 60 ? 1 : -1, fire: i % 20 === 0, jump: i % 90 === 0, jumpHeld: i % 90 < 20 }));
      return [s.score, s.player.x, s.player.y, s.enemies.map((e) => `${e.x.toFixed(3)},${e.y.toFixed(3)}`).join("|"), s.bubbles.length];
    };
    assert.deepEqual(play(), play());
  });
});

describe("보스 (Chime Queen)", () => {
  test("잡은 적을 터뜨리면 별빛 조각이 여왕에게 날아가 1 피해를 준다", () => {
    const s = playing(4);
    s.player.invulnerable = 999;
    const boss = s.boss!;
    const e = s.enemies[0];
    const b = trap(s, e);
    const events: ReturnType<typeof run> = [];
    popBubble(s, b, events);
    assert.equal(count(events, "spark"), 1);
    events.push(...run(s, 3, {}, () => boss.hp < BOSS.hp));
    assert.equal(boss.hp, BOSS.hp - 1);
    assert.equal(count(events, "bossHit"), 1);
  });

  test("방울은 여왕에게 통하지 않는다 (가둘 수 없음)", () => {
    const s = playing(4);
    clearEnemies(s);
    s.player.invulnerable = 999;
    const boss = s.boss!;
    s.player.x = boss.x - 20;
    s.player.y = boss.y + 4;
    s.player.facing = 1;
    run(s, 1, { fire: true });
    assert.equal(boss.hp, BOSS.hp);
  });

  test("여왕은 예고 후 음표를 쏘고, 졸개를 소환한다", () => {
    const s = playing(4);
    s.player.invulnerable = 999;
    const events = run(s, 14);
    assert.ok(count(events, "bossTelegraph") >= 2);
    assert.equal(count(events, "bossTelegraph"), count(events, "bossShoot"));
    assert.ok(count(events, "minion") >= 1);
    for (const e of s.enemies) if (e.minion) assert.ok(!bodyHitsSolid(s.level, e));
  });

  test(`여왕을 ${BOSS.hp}번 맞히면 쓰러지고 게임 클리어`, () => {
    const s = playing(4);
    s.player.invulnerable = 1e9;
    const boss = s.boss!;
    let guard = 0;
    while (boss.hp > 0 && guard++ < 200) {
      const target = s.enemies.find((e) => e.state === "active");
      if (!target) {
        run(s, 0.5);
        continue;
      }
      popBubble(s, trap(s, target), []);
      run(s, 1.5, {}, () => s.sparks.length === 0);
    }
    assert.equal(boss.hp, 0);
    const events = run(s, 10, {}, (st) => st.phase === "victory");
    assert.equal(s.phase, "victory");
    assert.equal(count(events, "victory"), 1);
  });
});

describe("적 안정성", () => {
  for (const [i, stage] of STAGES.entries()) {
    test(`${stage.name}: 90초 동안 적이 벽에 끼거나 화면 밖으로 나가지 않고 계속 움직인다`, () => {
      const s = playing(i, 99 + i);
      s.player.invulnerable = 1e9;
      const travel = new Map<number, number>();
      const last = new Map<number, number>();
      run(s, 90, {}, (st) => {
        for (const e of st.enemies) {
          if (e.state !== "active") continue;
          assert.ok(!bodyHitsSolid(st.level, e), `${e.kind} 벽 속 (${e.x.toFixed(0)},${e.y.toFixed(0)})`);
          assert.ok(e.x >= 16 && e.x + e.w <= WORLD_W - 16 && e.y < WORLD_H && e.y >= 16, `${e.kind} 화면 밖`);
          travel.set(e.id, (travel.get(e.id) ?? 0) + Math.hypot(e.x - (last.get(e.id) ?? e.x)));
          last.set(e.id, e.x);
        }
        return false;
      });
      for (const e of s.enemies) if (e.state === "active") assert.ok((travel.get(e.id) ?? 0) > 60, `${e.kind} 거의 안 움직임 ${travel.get(e.id)}`);
    });
  }
});

describe("자동 플레이로 모든 스테이지 클리어", () => {
  /**
   * 봇: 남은 적 하나 옆으로 가서 그 적을 향해 실제로 방울을 쏘고(발사·포획 규칙 그대로),
   * 갇힌 방울 옆으로 가서 몸으로 닿아 터뜨린다(실제 접촉 규칙). 위치 이동만 순간이동으로 대신한다.
   * 막히는 상태(클리어 불가) 없이 끝나는지, 보스 스테이지는 여왕까지 쓰러지는지 검사한다.
   */
  for (const [i, stage] of STAGES.entries()) {
    test(stage.name, () => {
      const s = playing(i, 500 + i);
      s.player.invulnerable = 1e9;
      const initial = s.enemies.length;
      const p = s.player;
      let guard = 0;
      while (s.phase === "play" && guard++ < 400) {
        const trapped = s.bubbles.find((b) => b.captive && b.popIn < 0);
        if (trapped) {
          // 방울 바로 옆(같은 높이)에 서서 걸어 들어가 터뜨린다
          p.x = trapped.x - p.w - 2;
          p.y = trapped.y + trapped.h / 2 - p.h / 2;
          if (bodyHitsSolid(s.level, p)) p.x = trapped.x + trapped.w + 2;
          p.vx = p.vy = 0;
          const side = p.x < trapped.x ? 1 : -1;
          run(s, 0.5, { move: side }, () => !s.bubbles.includes(trapped));
          continue;
        }
        const target = s.enemies.find((e) => e.state === "active");
        if (!target) {
          run(s, 0.3);
          continue;
        }
        // 적 옆 2칸 거리, 같은 높이(비행 요정은 공중)에서 적을 바라보고 쏜다
        const dir: 1 | -1 = target.x > WORLD_W / 2 ? 1 : -1;
        p.facing = dir;
        p.x = target.x + target.w / 2 - dir * 28 - p.w / 2;
        p.y = target.y + target.h / 2 - p.h / 2;
        p.vx = p.vy = 0;
        if (bodyHitsSolid(s.level, p)) {
          p.facing = dir === 1 ? -1 : 1;
          p.x = target.x + target.w / 2 + dir * 28 - p.w / 2;
        }
        if (bodyHitsSolid(s.level, p)) {
          run(s, 0.3);
          continue;
        }
        run(s, 0.4, (_s, k) => ({ fire: k === 0 }), () => target.state !== "active");
        run(s, 0.3);
      }
      run(s, 8, {}, (st) => st.phase !== "play");
      assert.ok(s.stats.kills >= initial, `쓰러뜨린 적 ${s.stats.kills} / ${initial}`);
      if (i === STAGES.length - 1) assert.equal(s.boss?.hp, 0);
      assert.ok(s.phase === "clear" || s.phase === "victory", `${stage.name}: ${s.phase}, 남은 적 ${s.enemies.filter((e) => e.state !== "dead").length}, 보스 ${s.boss?.hp}`);
    });
  }
});

describe("고정 스텝", () => {
  test("stepGame은 dt만큼만 진행한다", () => {
    const s = playing(0);
    const t = s.time;
    stepGame(s, { move: 0, jump: false, jumpHeld: false, fire: false }, DT);
    assert.ok(Math.abs(s.time - t - DT) < 1e-9);
  });
});
