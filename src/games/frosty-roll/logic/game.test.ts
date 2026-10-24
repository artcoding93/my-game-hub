import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BALL, CHAIN_POINTS, ENEMY, ITEMS, PHASE, SNOW, TILE, WORLD_H, WORLD_W } from "../config";
import { STAGES } from "../stages";
import type { Enemy, GameEvent, GameState } from "../types";
import { ballInFront, createGame, freeze, kickBall, snowHit, stepGame } from "./game";
import { bodyHitsSolid } from "./physics";
import { count, DT, placeEnemy, placePlayer, playing, run } from "./testUtils";

const FLOOR = 15;

describe("스테이지 데이터", () => {
  test("5개 스테이지: 중급 2 + 고급 3, 마지막은 보스", () => {
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
    }
  });
});

describe("눈송이 → 눈덩이", () => {
  test("3번 맞히면 0% → 33% → 66% → 100%(눈덩이)가 되고, 갇힌 적은 움직이지 않는다", () => {
    const s = playing(0);
    s.enemies = [];
    const e = placeEnemy(s, "imp", 10, FLOOR);
    const levels: number[] = [];
    for (let i = 0; i < 3; i++) {
      snowHit(s, e, 1, 1, []);
      levels.push(e.snow);
    }
    assert.deepEqual(levels, [1, 2, 3]);
    assert.equal(e.state, "ball");
    assert.equal(e.w, BALL.size);
    const x = e.x;
    run(s, 1);
    assert.equal(e.x, x);
  });

  test("실제 조작: 눈송이를 쏘아 앞의 적을 눈덩이로 만든다", () => {
    const s = playing(0);
    s.enemies = [];
    placePlayer(s, 4, FLOOR, 1);
    const e = placeEnemy(s, "imp", 8, FLOOR);
    e.dir = -1;
    const events = run(s, 3, { fire: true }, () => e.state === "ball");
    assert.equal(e.state, "ball");
    assert.ok(count(events, "shoot") >= 3);
    assert.equal(count(events, "freeze"), 1);
  });

  test("Giant Flake는 한 번에 2단계 쌓인다", () => {
    const s = playing(0);
    s.enemies = [];
    const e = placeEnemy(s, "imp", 10, FLOOR);
    snowHit(s, e, SNOW.giantHit, 1, []);
    assert.equal(e.snow, 2);
  });

  test("더 맞히지 않으면 눈이 한 단계씩 녹는다", () => {
    const s = playing(0);
    s.enemies = [];
    placePlayer(s, 2, FLOOR);
    s.player.invulnerable = 99;
    const e = placeEnemy(s, "imp", 20, FLOOR);
    snowHit(s, e, 2, 1, []);
    run(s, SNOW.decayDelay + 0.1);
    assert.equal(e.snow, 1);
    run(s, SNOW.decayStep + 0.1);
    assert.equal(e.snow, 0);
  });
});

/** 플레이어 바로 앞에 눈덩이를 만들고 찬다 */
function kickReady(s: GameState, col: number, floorRow: number, dir: 1 | -1) {
  placePlayer(s, col, floorRow, dir);
  const ball = placeEnemy(s, "imp", col + dir, floorRow);
  freeze(s, ball, []);
  ball.x = dir > 0 ? s.player.x + s.player.w + 1 : s.player.x - ball.w - 1;
  return ball;
}

describe("눈덩이 굴리기와 연쇄", () => {
  test("눈덩이 하나로 적 3명을 연달아 쓰러뜨리면 점수가 커지고 3연쇄 보너스(별사탕)가 나온다", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.invulnerable = 99;
    const ball = kickReady(s, 3, FLOOR, 1);
    for (const col of [10, 15, 20]) placeEnemy(s, "imp", col, FLOOR).dir = -1;
    let chainText = false;
    const events = run(s, 6, (_s, i) => ({ kick: i === 0 }), (st) => {
      chainText ||= st.popups.some((p) => p.text === "3 CHAIN!" && p.big);
      return ball.state === "dead";
    });
    const kills = events.filter((e): e is Extract<GameEvent, { type: "kill" }> => e.type === "kill");
    assert.deepEqual(
      kills.map((k) => k.chain),
      [1, 2, 3],
    );
    assert.deepEqual(
      kills.map((k) => k.points),
      CHAIN_POINTS.slice(0, 3),
    );
    const shatter = events.find((e) => e.type === "shatter");
    assert.ok(shatter && shatter.type === "shatter" && shatter.chain === 3);
    assert.ok(s.items.some((i) => i.kind === "candy"), "3연쇄 별사탕");
    assert.ok(chainText, "3 CHAIN! 표시");
  });

  test("4연쇄 이상이면 보석이 나온다", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.invulnerable = 99;
    const ball = kickReady(s, 3, FLOOR, 1);
    for (const col of [9, 13, 17, 21, 25]) placeEnemy(s, "imp", col, FLOOR).dir = -1;
    const events = run(s, 8, (_s, i) => ({ kick: i === 0 }), () => ball.state === "dead");
    assert.ok(count(events, "kill") >= 4);
    assert.ok(s.items.some((i) => i.kind === "gem"));
  });

  test("발판 끝에서 떨어진 눈덩이는 아래층에서도 같은 방향으로 계속 굴러간다", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.invulnerable = 99;
    // 1번 스테이지 11행 발판 (7~24열)
    const ball = kickReady(s, 20, 11, 1);
    const below = placeEnemy(s, "imp", 28, FLOOR);
    below.dir = 1;
    let landedBelow = false;
    const events = run(
      s,
      6,
      (_s, i) => ({ kick: i === 0 }),
      () => {
        if (ball.state === "rolling" && ball.grounded && ball.y + ball.h === FLOOR * TILE && ball.dir === 1) landedBelow = true;
        return ball.state === "dead";
      },
    );
    assert.ok(landedBelow, "아래층(바닥)에 떨어져 계속 오른쪽으로 굴러감");
    assert.ok(count(events, "kill") >= 1, "떨어진 뒤 아래층 적을 쓰러뜨림");
  });

  test("벽에 2번 튕긴 뒤 다음 벽에서 부서진다", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.invulnerable = 99;
    const ball = kickReady(s, 10, FLOOR, 1);
    const events = run(s, 10, (_s, i) => ({ kick: i === 0 }), () => ball.state === "dead");
    assert.equal(count(events, "bounce"), BALL.maxBounces);
    assert.equal(count(events, "shatter"), 1);
  });

  test("눈덩이 여러 개가 동시에 굴러도 서로 튕기고, 벽을 뚫지 않고, 결국 모두 부서진다", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.invulnerable = 99;
    placePlayer(s, 15, 11);
    const balls: Enemy[] = [];
    for (const [col, dir] of [
      [4, 1],
      [26, -1],
      [12, 1],
    ] as const) {
      const b = placeEnemy(s, "imp", col, FLOOR);
      freeze(s, b, []);
      kickBall(s, b, dir, []);
      balls.push(b);
    }
    let maxStep = 0;
    const prev = balls.map((b) => b.x);
    const events = run(s, 10, {}, () => {
      balls.forEach((b, i) => {
        if (b.state === "rolling") {
          assert.ok(!bodyHitsSolid(s.level, b), "눈덩이가 벽 속");
          assert.ok(b.x >= 16 && b.x + b.w <= WORLD_W - 16);
          maxStep = Math.max(maxStep, Math.abs(b.x - prev[i]));
        }
        prev[i] = b.x;
      });
      return balls.every((b) => b.state === "dead");
    });
    assert.ok(balls.every((b) => b.state === "dead" || !s.enemies.includes(b)));
    assert.ok(count(events, "bounce") >= 2, "눈덩이끼리 부딪혀 튕김");
    assert.ok(maxStep < 12, `한 스텝 이동 ${maxStep.toFixed(1)}px (순간이동 없음)`);
  });

  test("굴러가는 눈덩이는 플레이어에게 피해를 주지 않는다", () => {
    const s = playing(0);
    s.enemies = [];
    placePlayer(s, 16, FLOOR, -1);
    s.player.invulnerable = 0;
    const b = placeEnemy(s, "imp", 6, FLOOR);
    freeze(s, b, []);
    kickBall(s, b, 1, []);
    const events = run(s, 3);
    assert.equal(count(events, "hurt"), 0);
    assert.equal(s.player.lives, 3);
  });

  test("눈덩이를 그대로 두면 금이 간 뒤 적이 탈출하고, 잠시 빨라진다", () => {
    const s = playing(0);
    s.enemies = [];
    placePlayer(s, 2, FLOOR);
    s.player.invulnerable = 99;
    const e = placeEnemy(s, "imp", 20, FLOOR);
    freeze(s, e, []);
    const events = run(s, BALL.escapeTime + 0.2);
    assert.deepEqual(
      events.filter((x) => x.type === "crack").map((x) => (x.type === "crack" ? x.level : 0)),
      [1, 2],
    );
    assert.equal(count(events, "escape"), 1);
    assert.equal(e.state, "active");
    assert.equal(e.w, ENEMY.imp.w);
    assert.ok(e.angry > 0);
    run(s, 0.6);
    assert.ok(Math.abs(e.vx) > ENEMY.imp.speed * 1.3, `화난 속도 ${e.vx}`);
  });

  test("갇힌 눈덩이에 눈송이를 더 맞히면 탈출이 늦춰진다", () => {
    const s = playing(0);
    s.enemies = [];
    const e = placeEnemy(s, "imp", 20, FLOOR);
    freeze(s, e, []);
    e.ballTime = 4;
    s.shots.push({ x: e.x - 2, y: e.y + 4, vx: 10, vy: 0, life: 1, w: 6, h: 6, giant: false });
    stepGame(s, { move: 0, jump: false, jumpHeld: false, fire: false, kick: false }, DT);
    assert.ok(e.ballTime < 3);
  });
});

describe("조작", () => {
  test("이동·점프·공격을 같은 순간에 눌러도 모두 반영된다 (동시 터치)", () => {
    const s = playing(0);
    s.enemies = [];
    placeEnemy(s, "imp", 28, 3);
    placePlayer(s, 5, FLOOR, 1);
    stepGame(s, { move: 1, jump: true, jumpHeld: true, fire: true, kick: false }, DT);
    assert.ok(s.player.vx > 0, "이동");
    assert.ok(s.player.vy < 0, "점프");
    assert.equal(s.shots.length, 1, "공격");
  });

  test("간편 조작: 공격 키만으로 앞의 눈덩이를 찬다 (눈송이는 나가지 않음)", () => {
    const s = playing(0, 7, true);
    s.enemies = [];
    const ball = kickReady(s, 5, FLOOR, 1);
    assert.equal(ballInFront(s), ball);
    stepGame(s, { move: 0, jump: false, jumpHeld: false, fire: true, kick: false }, DT);
    assert.equal(ball.state, "rolling");
    assert.equal(s.shots.length, 0);
  });

  test("기본 조작: 공격 키는 눈송이, 밀기 키로 찬다", () => {
    const s = playing(0);
    s.enemies = [];
    const ball = kickReady(s, 5, FLOOR, 1);
    stepGame(s, { move: 0, jump: false, jumpHeld: false, fire: true, kick: false }, DT);
    assert.equal(ball.state, "ball");
    stepGame(s, { move: 0, jump: false, jumpHeld: false, fire: false, kick: true }, DT);
    assert.equal(ball.state, "rolling");
  });

  test("멈춘 눈덩이를 걸어서 밀면 천천히 밀리고 플레이어는 통과하지 못한다", () => {
    const s = playing(0);
    s.enemies = [];
    const ball = kickReady(s, 5, FLOOR, 1);
    const x0 = ball.x;
    run(s, 1, { move: 1 });
    assert.ok(ball.x > x0 + 15, "밀림");
    assert.ok(s.player.x + s.player.w <= ball.x + 0.5, "통과 안 함");
  });
});

describe("피해·아이템", () => {
  test("적에 닿으면 목숨 1개를 잃고 잠시 무적, Star Shield는 1회 막는다", () => {
    const s = playing(0);
    s.enemies = [];
    placePlayer(s, 10, FLOOR);
    s.player.invulnerable = 0;
    const e = placeEnemy(s, "imp", 10, FLOOR);
    let events = run(s, 0.1);
    assert.equal(count(events, "hurt"), 1);
    assert.equal(s.player.lives, 2);
    events = run(s, 0.5);
    assert.equal(count(events, "hurt"), 0, "무적 중");
    s.player.invulnerable = 0;
    s.player.shield = true;
    placePlayer(s, e.x / TILE, FLOOR);
    s.player.x = e.x;
    events = run(s, 0.1);
    assert.equal(count(events, "shieldBlock"), 1);
    assert.equal(s.player.lives, 2);
    assert.equal(s.player.shield, false);
  });

  test("66% 이상 눈이 쌓인 적은 닿아도 피해가 없다", () => {
    const s = playing(0);
    s.enemies = [];
    placePlayer(s, 10, FLOOR);
    s.player.invulnerable = 0;
    const e = placeEnemy(s, "imp", 10, FLOOR);
    e.snow = 2;
    e.sinceHit = -10;
    const events = run(s, 0.3);
    assert.equal(count(events, "hurt"), 0);
  });

  test("아이템은 과하게 나오지 않는다 (화면에 1개, 스테이지당 3개, 9초 간격)", () => {
    const s = playing(0, 1234);
    s.enemies = [];
    s.player.invulnerable = 999;
    let maxOnField = 0;
    for (let round = 0; round < 40; round++) {
      const ball = kickReady(s, 3, FLOOR, 1);
      for (const col of [9, 14, 19]) placeEnemy(s, "imp", col, FLOOR);
      run(s, 4, (_s, i) => ({ kick: i === 0 }), (st) => {
        maxOnField = Math.max(maxOnField, st.items.filter((i) => i.kind !== "candy" && i.kind !== "gem").length);
        return ball.state === "dead";
      });
      s.enemies = s.enemies.filter((e) => e.state === "dead");
    }
    assert.ok(s.itemsThisStage <= ITEMS.perStage, `${s.itemsThisStage}`);
    assert.ok(maxOnField <= 1);
  });

  test("아이템 효과: 신발은 빨라지고, 목숨은 최대 5개", () => {
    const s = playing(0);
    s.enemies = [placeEnemy(s, "imp", 28, 3)];
    s.enemies[0].state = "ball";
    placePlayer(s, 5, FLOOR);
    s.items.push({ id: 99, kind: "boots", x: s.player.x, y: s.player.y, w: 12, h: 12, vx: 0, vy: 0, grounded: true, onPlatform: -1, life: 5 });
    run(s, 0.05);
    assert.ok(s.player.speedBoost > 0);
    run(s, 0.6, { move: 1 });
    assert.ok(s.player.vx > 90);
    s.player.lives = 5;
    s.items.push({ id: 100, kind: "life", x: s.player.x, y: s.player.y, w: 12, h: 12, vx: 0, vy: 0, grounded: true, onPlatform: -1, life: 5 });
    run(s, 0.05);
    assert.equal(s.player.lives, 5);
  });
});

describe("스테이지 진행", () => {
  test("적을 모두 없애면 스테이지가 끝나고, 중급 2판을 깨면 체크포인트가 열린다", () => {
    const s = playing(0);
    s.enemies = [];
    let events = run(s, 0.05);
    const clear = events.find((e) => e.type === "stageClear");
    assert.ok(clear && clear.type === "stageClear" && !clear.checkpoint && clear.bonus > 0);
    events = run(s, PHASE.clear + 0.1);
    assert.equal(s.stageIndex, 1);
    assert.equal(s.phase, "intro");
    run(s, PHASE.intro + 0.05);
    s.enemies = [];
    events = run(s, 0.05);
    const clear2 = events.find((e) => e.type === "stageClear");
    assert.ok(clear2 && clear2.type === "stageClear" && clear2.checkpoint);
    assert.ok(s.checkpointReached);
  });

  test("굴러가는 눈덩이가 남아 있으면 클리어를 기다린다 (연쇄가 끝까지 이어짐)", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.invulnerable = 99;
    const ball = kickReady(s, 3, FLOOR, 1);
    stepGame(s, { move: 0, jump: false, jumpHeld: false, fire: false, kick: true }, DT);
    assert.equal(ball.state, "rolling");
    assert.equal(s.phase, "play");
    run(s, 8, {}, (st) => st.phase !== "play");
    assert.equal(s.phase, "clear");
  });

  test("목숨을 모두 잃으면 게임 오버", () => {
    const s = playing(0);
    s.enemies = [];
    s.player.lives = 1;
    s.player.invulnerable = 0;
    placePlayer(s, 10, FLOOR);
    placeEnemy(s, "imp", 10, FLOOR);
    const events = run(s, PHASE.dying + 0.5);
    assert.equal(count(events, "gameOver"), 1);
    assert.equal(s.phase, "gameover");
  });

  test("같은 시드·입력이면 같은 게임이 된다", () => {
    const play = () => {
      const s = createGame({ seed: 42 });
      run(s, 12, (_s, i) => ({ move: i % 200 < 100 ? 1 : -1, jump: i % 70 === 0, jumpHeld: true, fire: i % 20 < 3 }));
      return JSON.stringify({ score: s.score, p: [s.player.x, s.player.y], e: s.enemies.map((e) => [e.x, e.y, e.state]) });
    };
    assert.equal(play(), play());
  });
});

describe("보스", () => {
  test("눈송이는 보스에게 통하지 않는다", () => {
    const s = playing(4);
    const boss = s.boss!;
    s.enemies = [];
    placePlayer(s, Math.floor((boss.x - 30) / TILE), FLOOR, 1);
    s.player.invulnerable = 99;
    const events = run(s, 1.5, { fire: true });
    assert.ok(count(events, "tink") >= 1);
    assert.equal(boss.hp, 3);
  });

  test("굴린 눈덩이로 3번 맞히면 보스가 쓰러지고 게임 클리어", () => {
    const s = playing(4);
    s.enemies = [];
    s.player.invulnerable = 999;
    const boss = s.boss!;
    let hits = 0;
    for (let attempt = 0; attempt < 12 && boss.hp > 0; attempt++) {
      run(s, 0.1, {}, () => boss.invulnerable <= 0);
      while (boss.invulnerable > 0) run(s, 0.1);
      // 보스에서 6칸 떨어진 곳에서 보스 쪽으로 찬다
      const bcol = Math.floor((boss.x + boss.w / 2) / TILE);
      const dir: 1 | -1 = bcol > 15 ? 1 : -1;
      const col = Math.min(Math.max(bcol - dir * 7, 2), 29);
      const ball = kickReady(s, col, FLOOR, dir);
      const events = run(s, 4, (_s, i) => ({ kick: i === 0 }), () => ball.state === "dead");
      hits += count(events, "bossHit");
    }
    assert.equal(hits, 3);
    assert.equal(boss.hp, 0);
    const events = run(s, 8, {}, (st) => st.phase === "victory");
    assert.equal(s.phase, "victory");
    assert.ok(count(events, "victory") === 1);
  });

  test("보스는 정해진 간격으로 예고 후 톱니를 던지고, 졸개를 소환한다", () => {
    const s = playing(4);
    s.player.invulnerable = 999;
    const events = run(s, 14);
    assert.ok(count(events, "bossTelegraph") >= 2);
    assert.equal(count(events, "bossTelegraph"), count(events, "bossThrow"));
    assert.ok(count(events, "minion") >= 1);
  });
});

describe("적 안정성", () => {
  for (const [i, stage] of STAGES.entries()) {
    test(`${stage.name}: 90초 동안 적이 벽에 끼거나 화면 밖으로 떨어지지 않고 계속 움직인다`, () => {
      const s = playing(i, 99 + i);
      s.player.invulnerable = 1e9;
      const travel = new Map<number, number>();
      const last = new Map<number, number>();
      run(s, 90, {}, (st) => {
        for (const e of st.enemies) {
          if (e.state !== "active") continue;
          assert.ok(!bodyHitsSolid(st.level, e), `${e.kind} 벽 속 (${e.x.toFixed(0)},${e.y.toFixed(0)})`);
          assert.ok(e.x >= 16 && e.x + e.w <= WORLD_W - 16 && e.y < WORLD_H, `${e.kind} 화면 밖`);
          travel.set(e.id, (travel.get(e.id) ?? 0) + Math.abs(e.x - (last.get(e.id) ?? e.x)));
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
   * 봇: 남은 적 하나를 눈덩이로 만들고(명중 처리), 그 옆에 서서 차는 것을 반복한다.
   * 보스 스테이지에서는 보스 쪽으로 찬다. 규칙상 막히는 상태(클리어 불가) 없이 끝나는지 검사한다.
   */
  for (const [i, stage] of STAGES.entries()) {
    test(`${stage.name}`, () => {
      const s = playing(i, 500 + i);
      s.player.invulnerable = 1e9;
      const initial = s.enemies.length;
      let guard = 0;
      while (s.phase === "play" && guard++ < 200) {
        const target = s.enemies.find((e) => e.state === "active" || e.state === "ball");
        if (!target) {
          run(s, 0.5);
          continue;
        }
        if (target.state === "active") {
          while (target.state === "active") snowHit(s, target, 1, 1, []);
        }
        run(s, 1.5, {}, () => target.grounded);
        if (target.state !== "ball") continue;
        const boss = s.boss && s.boss.state !== "dead" && s.boss.state !== "dying" ? s.boss : null;
        let dir: 1 | -1 = target.x < WORLD_W / 2 ? 1 : -1;
        if (boss) dir = boss.x > target.x ? 1 : -1;
        const p = s.player;
        p.facing = dir;
        p.y = target.y + target.h - p.h;
        p.x = dir > 0 ? target.x - p.w - 1 : target.x + target.w + 1;
        p.vx = p.vy = 0;
        if (bodyHitsSolid(s.level, p)) {
          dir = dir === 1 ? -1 : 1;
          p.facing = dir;
          p.x = dir > 0 ? target.x - p.w - 1 : target.x + target.w + 1;
        }
        run(s, 6, (_s, k) => ({ kick: k === 0 }), () => target.state === "dead");
      }
      run(s, 6, {}, (st) => st.phase !== "play");
      assert.ok(s.stats.kills >= initial, `쓰러뜨린 적 ${s.stats.kills} / ${initial}`);
      if (i === STAGES.length - 1) assert.equal(s.boss?.hp, 0);
      assert.ok(s.phase === "clear" || s.phase === "victory", `${stage.name}: ${s.phase}, 남은 적 ${s.enemies.filter((e) => e.state !== "dead").length}, 보스 ${s.boss?.hp}`);
    });
  }
});
