import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BUBBLE, FIXED_DT, PLAYER, TILE } from "./config";
import { BubbleController } from "./controller";
import { CONTROL_HINTS, KEY_TO_ACTION } from "./input";
import { clearEnemies } from "./logic/testUtils";
import type { GameEvent } from "./types";

/*
 * 키보드 조작 테스트: 실제 화면과 같은 경로(키 코드 → KEY_TO_ACTION → InputState → 컨트롤러 고정 스텝)로 검사한다.
 * keydown은 useBubblePop처럼 event.code로 찾고, 키 반복(repeat) 이벤트는 무시한다.
 */

class Sim {
  readonly c = new BubbleController();
  events: GameEvent[] = [];

  constructor(col = 15) {
    this.c.start({ seed: 1, startStage: 0 });
    const s = this.c.state!;
    s.phase = "play";
    clearEnemies(s);
    s.player.invulnerable = 1e9;
    s.player.x = (col + 0.5) * TILE - s.player.w / 2;
  }

  get p() {
    return this.c.state!.player;
  }

  /** useBubblePop의 keydown/keyup 처리와 같은 규칙 */
  down(code: string, repeat = false) {
    const action = KEY_TO_ACTION[code];
    assert.ok(action, `${code}는 게임 키`);
    if (!repeat) this.c.input.press(code, action);
  }

  up(code: string) {
    this.c.input.release(code);
  }

  frames(n: number, each?: (i: number) => void) {
    for (let i = 0; i < n; i++) {
      each?.(i);
      this.events.push(...this.c.update(FIXED_DT));
    }
  }

  count(type: GameEvent["type"]) {
    return this.events.filter((e) => e.type === type).length;
  }
}

describe("키 배치", () => {
  test("← → 이동, ↑·Z 점프, Space·X 발사 (Space는 더 이상 점프가 아니다)", () => {
    assert.deepEqual(KEY_TO_ACTION, { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "jump", KeyZ: "jump", Space: "fire", KeyX: "fire" });
    assert.deepEqual(
      CONTROL_HINTS.map((c) => `${c.keys} : ${c.action}`),
      ["← → : Move", "↑ / Z : Jump", "Space / X : Shoot Bubble", "P / Esc : Pause"],
    );
  });
});

describe("1·2·3·4. 점프와 발사", () => {
  for (const code of ["ArrowUp", "KeyZ"]) {
    test(`${code}로 점프 (발사는 하지 않음)`, () => {
      const sim = new Sim();
      sim.down(code);
      sim.frames(3);
      assert.equal(sim.count("jump"), 1);
      assert.ok(sim.p.vy < 0 && !sim.p.grounded);
      assert.equal(sim.count("shoot"), 0);
    });
  }
  for (const code of ["Space", "KeyX"]) {
    test(`${code}로 버블 발사 (점프는 하지 않음)`, () => {
      const sim = new Sim();
      sim.down(code);
      sim.frames(2);
      sim.up(code);
      assert.equal(sim.count("shoot"), 1);
      assert.equal(sim.count("jump"), 0);
      assert.equal(sim.c.state!.bubbles.length, 1);
      assert.ok(sim.p.grounded);
    });
  }
});

describe("5·6·7. 동시 조작", () => {
  test("오른쪽으로 달리며 점프", () => {
    const sim = new Sim();
    const x0 = sim.p.x;
    sim.down("ArrowRight");
    sim.frames(10);
    sim.down("ArrowUp");
    sim.frames(15);
    assert.equal(sim.count("jump"), 1);
    assert.ok(sim.p.x > x0 + 20, "이동 유지");
    assert.ok(!sim.p.grounded);
  });

  test("왼쪽으로 달리며 발사 (방울은 왼쪽으로)", () => {
    const sim = new Sim();
    const x0 = sim.p.x;
    sim.down("ArrowLeft");
    sim.frames(5);
    sim.down("Space");
    sim.frames(10);
    assert.ok(sim.p.x < x0 - 10);
    assert.ok(sim.count("shoot") >= 1);
    assert.equal(sim.c.state!.bubbles[0].dir, -1);
  });

  test("점프 중에 발사", () => {
    const sim = new Sim();
    sim.down("ArrowUp");
    sim.frames(8);
    assert.ok(!sim.p.grounded);
    sim.down("KeyX");
    sim.frames(2);
    assert.equal(sim.count("shoot"), 1);
    assert.ok(!sim.p.grounded, "공중에서 발사");
  });

  test("이동 + 점프 + 발사를 한꺼번에", () => {
    const sim = new Sim();
    sim.down("ArrowRight");
    sim.down("KeyZ");
    sim.down("Space");
    sim.frames(6);
    assert.equal(sim.count("jump"), 1);
    assert.equal(sim.count("shoot"), 1);
    assert.ok(sim.p.vx > 0);
  });
});

describe("8·9·10. 중복·반복 방지", () => {
  test("↑와 Z를 같은 순간에, 또는 조금 늦게 눌러도 점프는 한 번", () => {
    const same = new Sim();
    same.down("ArrowUp");
    same.down("KeyZ");
    same.frames(60);
    assert.equal(same.count("jump"), 1);
    const late = new Sim();
    late.down("ArrowUp");
    late.frames(5);
    late.down("KeyZ");
    late.frames(60);
    assert.equal(late.count("jump"), 1, "이미 누르고 있는 점프에 두 번째 키는 새 입력이 아니다");
  });

  test("Space와 X를 함께 눌러도 발사 간격(쿨다운)은 하나", () => {
    const one = new Sim(4);
    one.down("Space");
    one.frames(120);
    const both = new Sim(4);
    both.down("Space");
    both.down("KeyX");
    both.frames(120, (i) => {
      // 번갈아 떼었다 누르기까지 해 본다
      if (i % 10 === 5) {
        both.up("KeyX");
        both.down("KeyX");
      }
    });
    assert.ok(one.count("shoot") >= 5, `연사 ${one.count("shoot")}`);
    assert.equal(both.count("shoot"), one.count("shoot"), `두 키 ${both.count("shoot")} vs 한 키 ${one.count("shoot")}`);
    // 연속 발사 간격이 쿨다운보다 짧지 않다
    assert.ok(both.count("shoot") <= Math.floor(2 / BUBBLE.cooldown) + 1);
  });

  test("점프 키를 3초 동안 누르고 있어도(키 반복 이벤트 포함) 한 번만 뛴다", () => {
    const sim = new Sim();
    sim.down("ArrowUp");
    sim.frames(180, (i) => {
      if (i % 2 === 0) sim.down("ArrowUp", true); // 운영체제 키 반복
    });
    assert.equal(sim.count("jump"), 1);
    assert.ok(sim.p.grounded, "착지 후 그대로 서 있다");
    sim.up("ArrowUp");
    sim.down("ArrowUp");
    sim.frames(3);
    assert.equal(sim.count("jump"), 2, "다시 누르면 점프");
  });
});

describe("11. Jump Buffer · Coyote Time", () => {
  test(`설정: Jump Buffer ${PLAYER.jumpBuffer * 1000}ms (100~150), Coyote ${PLAYER.coyote * 1000}ms (80~120)`, () => {
    assert.ok(PLAYER.jumpBuffer >= 0.1 && PLAYER.jumpBuffer <= 0.15);
    assert.ok(PLAYER.coyote >= 0.08 && PLAYER.coyote <= 0.12);
  });

  /** 점프 후 착지까지의 프레임 수 */
  function landingFrame() {
    const sim = new Sim();
    sim.down("ArrowUp");
    sim.frames(1);
    sim.up("ArrowUp");
    let n = 1;
    while (!sim.p.grounded && n < 200) {
      sim.frames(1);
      n++;
    }
    return n;
  }

  for (const [early, expect] of [
    [0.05, true],
    [0.1, true],
    [0.25, false],
  ] as const) {
    test(`착지 ${early * 1000}ms 전에 누르면 ${expect ? "착지하자마자 점프" : "점프하지 않음 (너무 이름)"}`, () => {
      const land = landingFrame();
      const pressAt = land - Math.round(early / FIXED_DT);
      const sim = new Sim();
      sim.down("ArrowUp");
      sim.frames(1);
      sim.up("ArrowUp");
      sim.frames(pressAt - 1);
      sim.down("KeyZ");
      sim.frames(1);
      sim.up("KeyZ");
      sim.frames(Math.round(early / FIXED_DT) + 6);
      assert.equal(sim.count("jump"), expect ? 2 : 1);
    });
  }

  /** 발판 오른쪽 끝(달빛 정원 왼쪽 아래 발판, 12행)에서 걸어 나가 떨어진 뒤 delay초에 점프 키 */
  function ledge(delay: number) {
    const sim = new Sim();
    const s = sim.c.state!;
    s.player.x = 12 * TILE + 2;
    s.player.y = 12 * TILE - s.player.h;
    s.player.vy = 0;
    s.player.grounded = true;
    sim.down("ArrowRight");
    let n = 0;
    while (s.player.grounded && n++ < 120) sim.frames(1);
    assert.ok(!s.player.grounded, "발판 끝에서 떨어짐");
    sim.frames(Math.round(delay / FIXED_DT));
    sim.down("ArrowUp");
    sim.frames(2);
    return sim.count("jump");
  }

  test("발판 끝에서 떨어진 직후(50ms·80ms)에는 점프할 수 있고, 한참 뒤(200ms)에는 안 된다", () => {
    assert.equal(ledge(0.05), 1);
    assert.equal(ledge(0.08), 1);
    assert.equal(ledge(0.2), 0);
  });

  test("Coyote Time으로 공중 이단 점프가 생기지 않는다", () => {
    const sim = new Sim();
    sim.down("ArrowUp");
    sim.frames(2);
    sim.up("ArrowUp");
    sim.down("KeyZ");
    sim.frames(2);
    assert.equal(sim.count("jump"), 1);
  });
});

describe("12. 모바일 터치 (기존 방식 유지)", () => {
  test("터치 버튼(포인터마다 다른 이름)도 키보드와 같은 결과", () => {
    const run = (left: string, jump: string, fire: string) => {
      const sim = new Sim();
      sim.c.input.press(left, "right");
      sim.frames(5);
      sim.c.input.press(jump, "jump");
      sim.c.input.press(fire, "fire");
      sim.frames(40);
      sim.c.input.release(fire);
      sim.c.input.release(jump);
      sim.frames(20);
      const p = sim.p;
      return { x: p.x, y: p.y, jumps: sim.count("jump"), shots: sim.count("shoot") };
    };
    const keys = run("ArrowRight", "ArrowUp", "Space");
    const touch = run("touch-1", "touch-2", "touch-3");
    assert.deepEqual(touch, keys);
    assert.ok(keys.jumps === 1 && keys.shots >= 2);
  });
});
