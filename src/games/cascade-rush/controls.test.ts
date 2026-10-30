import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { GAME_CONFIG } from "./config";
import { CascadeController } from "./controller";
import { InputState, KEY_TO_MOVE, KEY_TO_PRESS, PAUSE_KEYS, SOFT_DROP_KEYS } from "./input";
import { emptyBoard } from "./logic/board";

/** 컨트롤러를 READY 뒤 조작 상태로 만든다 */
function playingController(mode: "rush" | "endless" = "rush") {
  const c = new CascadeController(1);
  c.start(mode, 11);
  for (let t = 0; t < GAME_CONFIG.readyTime + 0.05; t += 1 / 60) c.update(1 / 60);
  assert.equal(c.state.phase, "playing");
  return c;
}

describe("PC 키 배치", () => {
  test("← → 이동, ↓ 빠른 낙하, ↑·X 시계 회전, Z 반시계, Space 즉시 낙하, P·Esc 일시정지", () => {
    assert.deepEqual(KEY_TO_MOVE, { ArrowLeft: -1, ArrowRight: 1 });
    assert.ok(SOFT_DROP_KEYS.has("ArrowDown"));
    assert.deepEqual(KEY_TO_PRESS, { ArrowUp: "rotateCW", KeyX: "rotateCW", KeyZ: "rotateCCW", Space: "hardDrop" });
    assert.deepEqual([...PAUSE_KEYS].sort(), ["Escape", "KeyP"]);
  });
});

describe("14. 모바일 조작 (터치 버튼과 키보드가 같은 입력 상태를 씀)", () => {
  test("◀ 버튼을 누르고 있으면 반복 이동, 떼면 멈춘다", () => {
    const c = playingController();
    c.input.pressMove("t-left", -1);
    for (let i = 0; i < 30; i++) c.update(1 / 60);
    assert.equal(c.state.active!.x, 0);
    c.input.release("t-left");
    c.input.pressMove("t-right", 1);
    c.update(1 / 60);
    assert.equal(c.state.active!.x, 1);
    c.input.release("t-right");
    for (let i = 0; i < 30; i++) c.update(1 / 60);
    assert.equal(c.state.active!.x, 1);
  });

  test("멀티터치: 이동 버튼을 누른 채 회전·DROP을 눌러도 둘 다 처리된다", () => {
    const c = playingController();
    c.input.pressMove("t-right", 1);
    c.input.trigger("rotateCW");
    c.update(1 / 60);
    assert.deepEqual([c.state.active!.x, c.state.active!.orientation], [3, 1]);
    c.input.trigger("hardDrop");
    c.update(1 / 60);
    assert.ok(c.state.board.flat().some((cell) => cell !== 0));
  });

  test("두 입력원이 같은 방향을 누르다 하나만 떼면 다른 하나는 유지된다", () => {
    const input = new InputState();
    input.pressMove("ArrowLeft", -1);
    input.pressMove("t-left", -1);
    input.release("ArrowLeft");
    assert.equal(input.take().move, -1);
    input.pressMove("t-right", 1);
    assert.equal(input.take().move, 1, "마지막으로 누른 방향이 이긴다");
    input.setSoftDrop("t-soft", true);
    input.setSoftDrop("ArrowDown", true);
    input.release("t-soft");
    assert.equal(input.take().softDrop, true);
  });

  test("DROP을 아주 빠르게 연타해도 한 스텝에 한 번만 처리되고, 쌍이 겹치거나 중복 배치되지 않는다", () => {
    const c = playingController("endless");
    for (let i = 0; i < 40; i++) {
      c.input.trigger("hardDrop");
      c.input.trigger("hardDrop");
      c.update(1 / 60);
      const filled = c.state.board.flat().filter((cell) => cell !== 0).length;
      assert.ok(filled % 1 === 0 && filled <= 72);
      if (c.state.phase !== "playing") break;
    }
    const s = c.state;
    // 고정된 크리스털 수 = 2 × 고정된 쌍 수 − 터진 수 − 천장 위로 넘쳐 사라진 수 (넘침이 없다면 정확히 일치)
    const placed = s.board.flat().filter((cell) => cell !== 0).length + s.crystals;
    assert.ok(placed <= (s.pairs - (s.active ? 1 : 0)) * 2);
  });

  test("게임이 끝나면 누르고 있던 버튼·남은 회전이 지워진다", () => {
    const c = playingController();
    c.input.pressMove("t-left", -1);
    c.input.setSoftDrop("t-soft", true);
    c.input.trigger("rotateCW");
    c.input.trigger("rotateCW");
    c.state.timeLeft = 0.01;
    c.update(1 / 30);
    assert.equal(c.state.phase, "over");
    assert.deepEqual(c.input.take(), { move: 0, softDrop: false, rotateCW: false, rotateCCW: false, hardDrop: false });
  });

  test("일시정지 중 버튼 입력은 쌓이지 않는다", () => {
    const c = playingController();
    c.togglePause();
    c.input.trigger("hardDrop");
    c.togglePause();
    c.update(1 / 60);
    assert.ok(c.state.board.flat().every((cell) => cell === 0));
  });
});

describe("구현 품질", () => {
  test("프레임레이트와 무관한 낙하 속도: 30fps와 144fps에서 같은 위치·남은 시간", () => {
    const run = (fps: number) => {
      const c = playingController();
      for (let i = 0; i < 3 * fps; i++) c.update(1 / fps);
      return { y: c.state.active!.y, time: c.state.timeLeft };
    };
    const [slow, fast] = [run(30), run(144)];
    assert.equal(slow.y, fast.y);
    // 고정 스텝 누적의 부동소수점 오차로 최대 한 스텝(1/60초) 차이만 허용
    assert.ok(Math.abs(slow.time - fast.time) <= 1 / 60 + 1e-9, `${slow.time} ${fast.time}`);
  });

  test("한 프레임이 아주 길어도(탭 전환 등) 한 번에 5스텝 이상 진행하지 않는다", () => {
    const c = playingController();
    const before = c.state.timeLeft;
    c.update(10);
    assert.ok(before - c.state.timeLeft < 0.1);
  });

  test("HUD: 남은 시간·점수·다음 쌍·속도, 결과 화면에서 모드 선택으로", () => {
    const c = playingController();
    const hud = c.getHud();
    assert.equal(hud.seconds, 120);
    assert.equal(hud.next.length, 2);
    assert.equal(hud.speed, 1);
    c.state.board = emptyBoard();
    c.state.timeLeft = 0.01;
    c.update(1 / 30);
    assert.equal(c.getHud().phase, "over");
    assert.equal(c.getHud().endReason, "time");
    c.toTitle();
    assert.equal(c.getHud().phase, "title");
  });

  test("Endless HUD에는 남은 시간이 없다", () => {
    const c = playingController("endless");
    assert.equal(c.getHud().seconds, null);
  });
});
