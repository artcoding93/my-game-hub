import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { INPUT } from "./config";
import { commandFor, DirectionRepeater, KEY_TO_DIR } from "./input";

const key = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({ code, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

describe("키 배치", () => {
  test("방향키·WASD 이동, Z·Ctrl+Z Undo, Y·Ctrl+Y·Ctrl+Shift+Z Redo, R 재시작, Esc 메뉴", () => {
    assert.deepEqual([KEY_TO_DIR.ArrowUp, KEY_TO_DIR.KeyD, KEY_TO_DIR.KeyS, KEY_TO_DIR.ArrowLeft], [0, 1, 2, 3]);
    assert.equal(commandFor(key("KeyZ")), "undo");
    assert.equal(commandFor(key("KeyZ", { ctrlKey: true })), "undo");
    assert.equal(commandFor(key("KeyZ", { metaKey: true, shiftKey: true })), "redo");
    assert.equal(commandFor(key("KeyY")), "redo");
    assert.equal(commandFor(key("KeyY", { ctrlKey: true })), "redo");
    assert.equal(commandFor(key("KeyR")), "restart");
    assert.equal(commandFor(key("KeyR", { ctrlKey: true })), null, "Ctrl+R(새로고침)은 가로채지 않음");
    assert.equal(commandFor(key("Escape")), "menu");
  });
});

describe("방향 반복 입력", () => {
  test("누르면 정확히 한 칸, 누르고 있으면 지연 후 일정 간격으로 반복", () => {
    const r = new DirectionRepeater();
    assert.equal(r.press("k", 1, 0), 1);
    assert.equal(r.poll(INPUT.repeatDelay - 0.01), null, "지연 전에는 반복 없음");
    assert.equal(r.poll(INPUT.repeatDelay), 1);
    assert.equal(r.poll(INPUT.repeatDelay + INPUT.repeatInterval / 2), null);
    assert.equal(r.poll(INPUT.repeatDelay + INPUT.repeatInterval), 1);
    r.release("k", 1);
    assert.equal(r.poll(5), null, "떼면 멈춤");
  });

  test("운영체제 키 반복(같은 키 keydown 반복)은 새 입력이 아니다", () => {
    const r = new DirectionRepeater();
    r.press("ArrowRight", 1, 0);
    assert.equal(r.press("ArrowRight", 1, 0.03), null);
  });

  test("두 방향을 누르면 마지막 방향, 하나를 떼면 남은 방향으로", () => {
    const r = new DirectionRepeater();
    r.press("a", 1, 0);
    assert.equal(r.press("b", 2, 0.1), 2);
    assert.equal(r.poll(0.1 + INPUT.repeatDelay), 2);
    r.release("b", 1);
    assert.equal(r.poll(1 + INPUT.repeatDelay), 1);
  });

  test("한참 멈췄다가(탭 전환 등) 돌아와도 몰아서 여러 칸 움직이지 않는다", () => {
    const r = new DirectionRepeater();
    r.press("a", 0, 0);
    let moves = 0;
    if (r.poll(10) !== null) moves++;
    if (r.poll(10) !== null) moves++;
    assert.equal(moves, 1);
  });
});
