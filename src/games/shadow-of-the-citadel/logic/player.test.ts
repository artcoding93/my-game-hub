import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FIXED_DT, JUMP, LAND, LEDGE, MOVE, TILE } from "../config";
import { FLOOR_Y, TEST_SPOTS } from "../level";
import { createPlayer, NO_INPUT, stepPlayer, type Player, type PlayerEvent, type PlayerInput } from "./player";
import { allLedges, bodyHitsSolid, createWorld, hangPosition } from "./world";

const world = createWorld();
const spot = (key: string) => TEST_SPOTS.find((s) => s.key === key)!;

/** inputFor(step, player)가 돌려주는 입력으로 seconds만큼 진행. stop이 true를 돌려주면 멈춘다 */
function simulate(
  p: Player,
  seconds: number,
  inputFor: (p: Player, step: number) => Partial<PlayerInput>,
  stop?: (p: Player, events: PlayerEvent[]) => boolean,
): PlayerEvent[] {
  const all: PlayerEvent[] = [];
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const events: PlayerEvent[] = [];
    stepPlayer(p, { ...NO_INPUT, ...inputFor(p, i) }, world, FIXED_DT, events);
    all.push(...events);
    if (stop?.(p, events)) break;
  }
  return all;
}

const hold = (input: Partial<PlayerInput>) => () => input;

/** 점프 키: 첫 스텝에만 pressed, 계속 held */
function jumpOnce(extra: Partial<PlayerInput> = {}) {
  return (_p: Player, i: number): Partial<PlayerInput> => ({ ...extra, jumpPressed: i === 0, jumpHeld: true });
}

describe("지면 이동", () => {
  test("입력이 없으면 제자리에 서 있다", () => {
    const p = createPlayer(spot("1"));
    simulate(p, 2, hold({}));
    assert.equal(p.mode, "move");
    assert.ok(p.grounded);
    assert.equal(p.y, FLOOR_Y);
    assert.equal(p.x, spot("1").x);
  });

  test("걷기·달리기는 가속해서 최고 속도에 이르고, 손을 떼면 감속해서 멈춘다", () => {
    const p = createPlayer(spot("1"));
    simulate(p, 0.05, hold({ move: 1 }));
    assert.ok(p.vx > 0 && p.vx < MOVE.walkSpeed, "걷기 가속 중");
    simulate(p, 1, hold({ move: 1 }));
    assert.equal(p.vx, MOVE.walkSpeed);
    const x0 = p.x;
    simulate(p, 0.5, hold({}));
    assert.equal(p.vx, 0);
    assert.ok(p.x - x0 < 8, `걷다 멈추는 거리 ${p.x - x0}`);

    simulate(p, 1, hold({ move: 1, run: true }));
    assert.equal(p.vx, MOVE.runSpeed);
    const x1 = p.x;
    const events = simulate(p, 0.1, hold({}));
    assert.ok(events.some((e) => e.type === "skid"), "달리다 멈추면 미끄러짐");
    simulate(p, 1, hold({}));
    const slide = p.x - x1;
    assert.equal(p.vx, 0);
    assert.ok(slide > 25 && slide < 60, `미끄러지는 거리 ${slide.toFixed(1)}px`);
  });

  test("달리다 반대 방향을 누르면 제동 후 돌아서고, 느릴 때는 바로 돈다", () => {
    const p = createPlayer(spot("1"));
    simulate(p, 1, hold({ move: 1, run: true }));
    const events = simulate(p, 0.05, hold({ move: -1, run: true }));
    assert.ok(events.some((e) => e.type === "turn"));
    assert.equal(p.facing, 1, "제동 중에는 아직 앞을 본다");
    simulate(p, 0.3, hold({ move: -1, run: true }));
    assert.equal(p.facing, -1);
    assert.ok(p.vx < 0, "새 방향으로 가속");

    const q = createPlayer(spot("1"));
    simulate(q, 0.5, hold({ move: 1 }));
    simulate(q, 1 / 60, hold({ move: -1 }));
    assert.equal(q.facing, -1);
  });
});

describe("점프", () => {
  test("도약 준비 시간이 짧다 (제자리 0.1초, 달리기 0.06초 이내)", () => {
    const p = createPlayer(spot("1"));
    let launched = -1;
    simulate(p, 0.3, jumpOnce(), (q, ev) => {
      if (ev.some((e) => e.type === "jump")) launched = q.modeTime;
      return ev.some((e) => e.type === "jump");
    });
    assert.ok(p.mode === "air" && p.vy < 0);
    assert.ok(launched >= 0);

    const r = createPlayer(spot("1"));
    simulate(r, 1, hold({ move: 1, run: true }));
    let steps = 0;
    simulate(r, 0.3, (_q, i) => ({ move: 1, run: true, jumpPressed: i === 0, jumpHeld: true }), (q, ev) => (steps++, ev.some((e) => e.type === "jump")));
    assert.ok(steps * FIXED_DT <= JUMP.prepRun + 2 * FIXED_DT, `달리기 도약까지 ${(steps * FIXED_DT).toFixed(3)}s`);
  });

  test("짧은 틈은 걷기 점프로 건넌다", () => {
    const p = createPlayer(spot("2"));
    const edge = 28 * TILE;
    let jumped = false;
    simulate(
      p,
      4,
      (q) => {
        const press = !jumped && q.x + 10 >= edge - 2;
        if (press) jumped = true;
        return { move: 1, jumpPressed: press, jumpHeld: true };
      },
      (q) => q.x > 31 * TILE,
    );
    assert.ok(p.grounded && p.y === FLOOR_Y && p.x > 30 * TILE, `x=${p.x.toFixed(0)} y=${p.y.toFixed(0)}`);
  });

  test("넓은 틈은 달리기 점프로 건너고, 걷기 점프로는 건너지 못한다", () => {
    const tryGap = (run: boolean) => {
      const p = createPlayer(spot("3"));
      const edge = 36 * TILE;
      let jumped = false;
      const events = simulate(
        p,
        5,
        (q) => {
          const press = !jumped && q.x + 10 >= edge - 3;
          if (press) jumped = true;
          return { move: 1, run, jumpPressed: press, jumpHeld: true };
        },
        (q, ev) => ev.some((e) => e.type === "respawn") || (q.grounded && q.x > 40 * TILE) || q.mode === "hang",
      );
      return { p, events };
    };
    const running = tryGap(true);
    assert.ok(running.p.grounded && running.p.x > 40 * TILE, "달리기 점프 착지");
    const walking = tryGap(false);
    assert.ok(!(walking.p.grounded && walking.p.x > 40 * TILE), "걷기 점프로는 못 건넘");
  });

  test("거리가 조금 모자란 점프는 건너편 난간을 손으로 잡는다", () => {
    const p = createPlayer(spot("3"));
    p.x = 36 * TILE - 11;
    p.vx = 165;
    p.facing = 1;
    simulate(p, 2, (_q, i) => ({ move: 1, run: true, jumpPressed: i === 0, jumpHeld: true }), (q) => q.mode === "hang");
    assert.equal(p.mode, "hang");
    assert.deepEqual(p.ledge, { x: 40 * TILE, y: FLOOR_Y, dir: 1 });
    // 손 기준점(발 위치 + 매달림 깊이)이 난간 모서리에 정확히 맞는다
    assert.equal(p.y - LEDGE.hangDepth, FLOOR_Y);
    assert.equal(p.x + LEDGE.hangOffsetX, 40 * TILE);
  });

  test("천장이 낮은 회랑에서 점프하면 머리를 부딪히고 떨어진다", () => {
    const p = createPlayer(spot("7"));
    const events = simulate(p, 1.5, jumpOnce());
    assert.ok(events.some((e) => e.type === "bump"));
    assert.ok(p.grounded && p.y === FLOOR_Y);
  });

  test("발판 끝을 막 벗어난 직후에도 점프할 수 있다 (코요테 타임)", () => {
    const p = createPlayer(spot("2"));
    let leftAt = -1;
    const events = simulate(
      p,
      3,
      (q, i) => {
        if (leftAt < 0 && q.mode === "air") leftAt = i;
        const press = leftAt >= 0 && i === leftAt + 4;
        return { move: 1, run: true, jumpPressed: press, jumpHeld: true };
      },
      (_q, ev) => ev.some((e) => e.type === "jump"),
    );
    assert.ok(events.some((e) => e.type === "jump"));
  });
});

describe("착지", () => {
  test("높이에 따라 착지 반응이 커진다", () => {
    const land = (spotKey: string, move: 1 | -1, setup: (p: Player) => void) => {
      const p = createPlayer(spot(spotKey));
      setup(p);
      const events = simulate(p, 3, hold({ move }), (_q, ev) => ev.some((e) => e.type === "land"));
      return events.find((e) => e.type === "land");
    };
    // 높은 플랫폼(7행)에서 바닥으로 걸어 떨어지기: 8칸
    const heavy = land("6", 1, () => {});
    assert.equal(heavy?.type === "land" && heavy.level, "heavy");
    // 계단 1(13행)에서 바닥으로: 2칸
    const light = land("5", -1, (p) => {
      p.x = 52 * TILE;
      p.y = 13 * TILE;
      p.facing = -1;
    });
    assert.equal(light?.type === "land" && light.level, "light");
  });

  test("큰 착지 뒤 잠시 움직일 수 없고, 이후 정상으로 돌아온다", () => {
    const p = createPlayer(spot("6"));
    simulate(p, 3, hold({ move: 1 }), (q) => q.mode === "land");
    assert.equal(p.landLevel, "heavy");
    simulate(p, LAND.heavyTime - 0.05, hold({ move: 1 }));
    assert.equal(p.mode, "land");
    simulate(p, 0.2, hold({ move: 1 }));
    assert.equal(p.mode, "move");
  });
});

describe("난간", () => {
  test("떠 있는 석판 아래에서 제자리 점프로 잡고, ↑로 올라와 안전한 바닥에 선다", () => {
    const p = createPlayer(spot("4"));
    p.x = 44 * TILE - 10 - 4;
    simulate(p, 1.5, jumpOnce(), (q) => q.mode === "hang");
    assert.equal(p.mode, "hang");
    assert.deepEqual(p.ledge, { x: 44 * TILE, y: 11 * TILE, dir: 1 });
    // 매달린 동안은 떨어지지 않는다
    const y = p.y;
    simulate(p, 1, hold({}));
    assert.equal(p.mode, "hang");
    assert.equal(p.y, y);

    const events = simulate(p, 2, hold({ up: true }), (q) => q.mode === "move");
    assert.ok(events.some((e) => e.type === "climb") && events.some((e) => e.type === "climbEnd"));
    assert.equal(p.y, 11 * TILE);
    assert.equal(p.x, 44 * TILE + LEDGE.standX);
    assert.ok(p.grounded && !bodyHitsSolid(world, p.x, p.y));
  });

  test("↓로 손을 놓으면 다시 잡지 않고 아래 바닥에 착지한다", () => {
    const p = createPlayer(spot("4"));
    p.x = 44 * TILE - 14;
    simulate(p, 1.5, jumpOnce(), (q) => q.mode === "hang");
    const events = simulate(p, 2, (_q, i) => ({ down: i < 3 }), (q) => q.grounded);
    assert.ok(events.some((e) => e.type === "drop"));
    assert.ok(!events.some((e) => e.type === "grab"));
    assert.ok(p.grounded && p.y === FLOOR_Y);
  });

  test("계단 → 높은 플랫폼까지 점프·매달리기·올라오기로 오를 수 있다", () => {
    const p = createPlayer(spot("5"));
    // 계단 1(2칸)은 점프로 올라선다
    simulate(p, 2, (q, i) => ({ move: 1, jumpPressed: i === 20, jumpHeld: true }), (q) => q.grounded && q.y === 13 * TILE);
    assert.equal(p.y, 13 * TILE, "계단 1 위");
    // 계단 2, 높은 플랫폼: 벽 앞에서 제자리 점프 → 매달림 → 올라오기
    for (const top of [10, 7]) {
      simulate(p, 2, hold({ move: 1 }), (q) => q.vx === 0 && q.modeTime > 0.1);
      simulate(p, 1.5, jumpOnce(), (q) => q.mode === "hang");
      assert.equal(p.mode, "hang", `${top}행 난간 잡기`);
      simulate(p, 2, hold({ up: true }), (q) => q.mode === "move");
      assert.equal(p.y, top * TILE, `${top}행 위`);
    }
  });

  test("낮은 턱(2칸)이나 머리 위가 막힌 곳은 난간으로 잡지 않는다", () => {
    const ledges = allLedges(world);
    assert.ok(!ledges.some((l) => l.y === 13 * TILE && l.x === 50 * TILE), "계단 1 앞면(바로 아래 바닥)");
    for (const l of ledges) {
      const hang = hangPosition(l);
      assert.ok(!bodyHitsSolid(world, hang.x, hang.y), `매달린 자리 겹침 ${l.x},${l.y}`);
    }
    // 7가지 테스트 지형의 핵심 난간이 있다
    const has = (x: number, y: number, dir: 1 | -1) => ledges.some((l) => l.x === x && l.y === y && l.dir === dir);
    assert.ok(has(40 * TILE, FLOOR_Y, 1), "넓은 틈 건너편");
    assert.ok(has(44 * TILE, 11 * TILE, 1), "떠 있는 석판");
    assert.ok(has(54 * TILE, 10 * TILE, 1), "계단 2");
    assert.ok(has(58 * TILE, 7 * TILE, 1), "높은 플랫폼");
    assert.ok(has(66 * TILE, 12 * TILE, 1), "중간 받침");
  });
});

describe("안정성", () => {
  test("짧은 틈으로 걸어 떨어지면 건너편 난간을 붙잡는다", () => {
    const p = createPlayer(spot("2"));
    simulate(p, 5, hold({ move: 1 }), (q) => q.mode === "hang");
    assert.equal(p.mode, "hang");
    assert.deepEqual(p.ledge, { x: 30 * TILE, y: FLOOR_Y, dir: 1 });
  });

  test("틈으로 떨어지면(↓: 잡지 않음) 테스트 위치로 돌아온다", () => {
    const p = createPlayer(spot("2"));
    const events = simulate(p, 5, hold({ move: 1, down: true }), (_q, ev) => ev.some((e) => e.type === "respawn"));
    assert.ok(events.some((e) => e.type === "respawn"));
    assert.equal(p.x, spot("2").x);
    assert.equal(p.y, spot("2").y);
  });

  test("무작위 입력 3분 동안 지형을 관통하지 않고 값이 깨지지 않는다", () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const s of TEST_SPOTS) {
      const p = createPlayer(s);
      let input: PlayerInput = { ...NO_INPUT };
      simulate(p, 25, (_q, i) => {
        if (i % 30 === 0) {
          const r = rand();
          input = {
            move: r < 0.35 ? 1 : r < 0.7 ? -1 : 0,
            run: rand() < 0.5,
            jumpPressed: rand() < 0.3,
            jumpHeld: rand() < 0.7,
            up: rand() < 0.3,
            down: rand() < 0.1,
          };
        } else input = { ...input, jumpPressed: false };
        return input;
      }, (q) => {
        assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.vx) && Number.isFinite(q.vy));
        if (q.mode !== "climb") assert.ok(!bodyHitsSolid(world, q.x, q.y), `관통 ${s.key}: ${q.mode} ${q.x.toFixed(1)},${q.y.toFixed(1)}`);
        return false;
      });
    }
  });

  test("고정 스텝: 화면 프레임 간격이 달라도 같은 위치에 도착한다", () => {
    const runWithFrames = (frameDt: number) => {
      const p = createPlayer(spot("1"));
      let acc = 0;
      let step = 0;
      while (step < 240) {
        acc += frameDt;
        while (acc >= FIXED_DT - 1e-9 && step < 240) {
          const events: PlayerEvent[] = [];
          stepPlayer(p, { ...NO_INPUT, move: 1, run: step > 60, jumpPressed: step === 120, jumpHeld: true }, world, FIXED_DT, events);
          acc -= FIXED_DT;
          step++;
        }
      }
      return { x: p.x, y: p.y, step };
    };
    assert.deepEqual(runWithFrames(1 / 30), runWithFrames(1 / 144));
  });
});
