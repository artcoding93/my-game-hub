import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Board, Dir, Level } from "../types";
import { deadlockedBoxes, isSolved, step } from "./engine";
import { parseLevel } from "./level";

/* 규칙 엔진 테스트. 작은 시험용 지도로 규칙 하나씩 확인한다 */

const U: Dir = 0;
const R: Dir = 1;
const D: Dir = 2;
const L: Dir = 3;
const at = (lv: Level, x: number, y: number) => y * lv.cols + x;
function play(lv: Level, dirs: Dir[], board: Board = lv.start) {
  for (const d of dirs) board = step(lv, board, d).board;
  return board;
}
const kinds = (lv: Level, board: Board, dir: Dir) => step(lv, board, dir).box!.path.map((p) => p.kind);

describe("기본 규칙", () => {
  const lv = parseLevel(["#######", "#P-B--#", "#-----#", "#######"]);

  test("벽은 통과할 수 없다", () => {
    const r = step(lv, lv.start, U);
    assert.equal(r.moved, false);
    assert.equal(r.board, lv.start);
    assert.equal(step(lv, lv.start, L).moved, false);
  });

  test("앞의 상자를 한 칸 민다", () => {
    const b = play(lv, [R, R]);
    assert.equal(b.player, at(lv, 3, 1));
    assert.deepEqual(b.boxes, [at(lv, 4, 1)]);
  });

  test("상자 너머가 벽이면 밀 수 없다", () => {
    const b = play(lv, [R, R, R, R]);
    assert.deepEqual(b.boxes, [at(lv, 5, 1)]);
    assert.equal(step(lv, b, R).moved, false);
  });

  test("상자 두 개를 한 번에 밀 수 없다", () => {
    const two = parseLevel(["#######", "#PBB--#", "#######"]);
    const r = step(two, two.start, R);
    assert.equal(r.moved, false);
    assert.deepEqual(r.board.boxes, two.start.boxes);
  });

  test("당기기는 없다: 상자 옆에서 반대로 걸으면 상자는 그대로", () => {
    const b = play(lv, [R]);
    const back = step(lv, b, L);
    assert.ok(back.moved);
    assert.equal(back.box, null);
    assert.deepEqual(back.board.boxes, lv.start.boxes);
  });

  test("목표 판정: 모든 상자가 목표 위일 때만 클리어, 로봇이 목표 위에 서도 상관없다", () => {
    const g = parseLevel(["########", "#PB-o--#", "#-B-o--#", "########"]);
    let b = play(g, [R, R]);
    assert.equal(isSolved(g, b), false, "하나만 들어감");
    b = play(g, [L, L, D, R, R], b);
    assert.ok(isSolved(g, b));
    // 목표 위 상자를 밀어내면 다시 미완성
    const off = parseLevel(["#######", "#PX-o-#", "#######"]);
    assert.equal(isSolved(off, off.start), false, "상자 1개·목표 2개");
    const one = parseLevel(["######", "#PX--#", "######"]);
    assert.ok(isSolved(one, one.start));
    assert.equal(isSolved(one, step(one, one.start, R).board), false, "목표에서 벗어남");
    // 로봇이 목표 위에서 시작하는 지도도 목표로 센다
    const onGoal = parseLevel(["######", "#pB-o#", "######"]);
    assert.equal(onGoal.targets.size, 2);
  });
});

describe("컨베이어", () => {
  test("벨트에 올라간 상자는 화살표 방향으로 모서리를 돌아 계속 이동하고, 첫 일반 바닥에서 멈춘다", () => {
    const lv = parseLevel(["#######", "#>>>v-#", "#B--v-#", "#P--o-#", "#######"]);
    const r = step(lv, lv.start, U);
    assert.deepEqual(r.board.boxes, [at(lv, 4, 3)]);
    assert.deepEqual(kinds(lv, lv.start, U), ["push", "conveyor", "conveyor", "conveyor", "conveyor", "conveyor"]);
    assert.ok(isSolved(lv, r.board));
  });

  test("막히면 벨트 위에서 멈추고, 다음 턴에 저절로 움직이지 않는다", () => {
    const lv = parseLevel(["########", "#PB>>>B#", "#------#", "########"]);
    const r = step(lv, lv.start, R);
    assert.deepEqual(r.board.boxes, [at(lv, 5, 1), at(lv, 6, 1)], "앞 상자에 막혀 벨트 끝에서 멈춤");
    const later = play(lv, [D, R], r.board);
    assert.deepEqual(later.boxes, r.board.boxes);
  });

  test("로봇이 벨트 앞을 막으면 상자는 벨트 위에서 멈춘다 (로봇은 벨트에 밀리지 않는다)", () => {
    // 오른쪽으로 민 상자가 왼쪽으로 도는 벨트에 올라가면, 방금 상자 자리로 들어온 로봇에 막힌다
    const lv = parseLevel(["######", "#PB<-#", "######"]);
    const r = step(lv, lv.start, R);
    assert.equal(r.board.player, at(lv, 2, 1));
    assert.deepEqual(r.board.boxes, [at(lv, 3, 1)]);
    // 로봇이 비켜도 다시 밀기 전에는 움직이지 않는다
    assert.deepEqual(step(lv, r.board, L).board.boxes, [at(lv, 3, 1)]);
  });

  test("서로 마주 보는 벨트(순환)에서도 무한 루프 없이 멈추고, 결과는 항상 같다", () => {
    const lv = parseLevel(["######", "#PB><#", "######"]);
    const r = step(lv, lv.start, R);
    assert.ok(r.moved);
    assert.equal(r.box!.looped, true);
    assert.ok([at(lv, 3, 1), at(lv, 4, 1)].includes(r.board.boxes[0]));
    assert.deepEqual(step(lv, lv.start, R).board, r.board);
  });

  test("네 칸 순환 벨트도 멈춘다", () => {
    const lv = parseLevel(["#######", "#-----#", "#PB>v-#", "#--^<-#", "#######"]);
    const r = step(lv, lv.start, R);
    assert.ok(r.box!.looped);
    assert.deepEqual(r.box!.path.map((p) => p.cell).slice(0, 5), [at(lv, 3, 2), at(lv, 4, 2), at(lv, 4, 3), at(lv, 3, 3), at(lv, 3, 2)]);
    assert.ok(r.box!.path.length <= 6);
  });
});

describe("얼음", () => {
  test("얼음 위로 밀린 상자는 미끄러지다 얼음을 벗어난 첫 바닥에서 멈춘다", () => {
    const lv = parseLevel(["#########", "#PB~~~--#", "#-------#", "#########"]);
    assert.deepEqual(step(lv, lv.start, R).board.boxes, [at(lv, 6, 1)]);
    assert.deepEqual(kinds(lv, lv.start, R), ["push", "ice", "ice", "ice"]);
  });

  test("벽·상자 앞에서는 얼음 위에서 멈춘다", () => {
    const wall = parseLevel(["#######", "#PB~~~#", "#######"]);
    assert.deepEqual(step(wall, wall.start, R).board.boxes, [at(wall, 5, 1)]);
    const box = parseLevel(["########", "#PB~~~B#", "########"]);
    assert.deepEqual(step(box, box.start, R).board.boxes, [at(box, 5, 1), at(box, 6, 1)]);
  });

  test("얼음 위 목표는 그 칸에 멈췄을 때만 인정한다 (지나쳐 미끄러지면 안 됨)", () => {
    const pass = parseLevel(["########", "#PB~%~-#", "########"]);
    assert.equal(isSolved(pass, step(pass, pass.start, R).board), false);
    const stop = parseLevel(["######", "#PB~%#", "######"]);
    assert.ok(isSolved(stop, step(stop, stop.start, R).board));
  });

  test("로봇은 얼음에서 미끄러지지 않는다", () => {
    const ice = parseLevel(["######", "#P~~-#", "######"]);
    assert.equal(step(ice, ice.start, R).board.player, at(ice, 2, 1));
  });

  test("벨트가 상자를 얼음으로 보내면 벨트 방향으로 미끄러진다", () => {
    const lv = parseLevel(["########", "#PB>~~-#", "########"]);
    assert.deepEqual(kinds(lv, lv.start, R), ["push", "conveyor", "ice", "ice"]);
    assert.deepEqual(step(lv, lv.start, R).board.boxes, [at(lv, 6, 1)]);
  });
});

describe("순간이동", () => {
  test("장치에 들어간 상자는 짝 장치로 옮겨져 그 자리에서 멈춘다 (되돌아가지 않음)", () => {
    const lv = parseLevel(["#########", "#PB1#-1-#", "#---#---#", "#########"]);
    const r = step(lv, lv.start, R);
    assert.deepEqual(r.board.boxes, [at(lv, 6, 1)]);
    assert.deepEqual(r.box!.path.map((p) => p.kind), ["push", "teleport"]);
  });

  test("도착 장치가 상자로 막혀 있으면 들어간 장치 위에서 멈춘다", () => {
    const lv = parseLevel(["##########", "#PB1##-1-#", "#----#---#", "##########"]);
    const blocked = { player: lv.start.player, boxes: [...lv.start.boxes, at(lv, 7, 1)] };
    assert.deepEqual(step(lv, blocked, R).board.boxes, [at(lv, 3, 1), at(lv, 7, 1)]);
  });

  test("도착 장치에 로봇이 서 있으면 이동하지 않는다", () => {
    // 장치 두 개가 붙어 있고 상자가 첫 장치 위에 있을 때: 밀면 로봇이 첫 장치(=도착 장치)로 들어오므로 전송이 막힌다
    const lv = parseLevel(["######", "#P11-#", "######"]);
    const board = { player: at(lv, 1, 1), boxes: [at(lv, 2, 1)] };
    const r = step(lv, board, R);
    assert.equal(r.board.player, at(lv, 2, 1));
    assert.deepEqual(r.board.boxes, [at(lv, 3, 1)]);
    assert.deepEqual(r.box!.path.map((p) => p.kind), ["push"]);
  });

  test("순간이동 장치 너머가 얼음이어도 도착하면 멈춘다 (우선순위: 순간이동 > 컨베이어 > 얼음)", () => {
    const lv = parseLevel(["##########", "#PB1##1~-#", "#----#---#", "##########"]);
    assert.deepEqual(step(lv, lv.start, R).board.boxes, [at(lv, 6, 1)]);
  });

  test("벨트가 상자를 장치로 보내면 순간이동한다 (한 턴 안의 연쇄)", () => {
    const lv = parseLevel(["###########", "#PB>>1#-1-#", "#-----#---#", "###########"]);
    const r = step(lv, lv.start, R);
    assert.deepEqual(r.board.boxes, [at(lv, 8, 1)]);
    assert.deepEqual(r.box!.path.map((p) => p.kind), ["push", "conveyor", "conveyor", "teleport"]);
  });

  test("짝이 없는 장치는 지도 오류", () => {
    assert.throws(() => parseLevel(["#####", "#P1-#", "#####"]));
  });
});

describe("데드락 경고", () => {
  test("목표가 아닌 일반 바닥의 벽 구석만 경고한다", () => {
    const dead = parseLevel(["######", "#B---#", "#-P--#", "######"]);
    assert.deepEqual(deadlockedBoxes(dead, dead.start), [0]);
    const onTarget = parseLevel(["######", "#X---#", "#-P--#", "######"]);
    assert.deepEqual(deadlockedBoxes(onTarget, onTarget.start), []);
    const wallOnly = parseLevel(["######", "#-B--#", "#-P--#", "######"]);
    assert.deepEqual(deadlockedBoxes(wallOnly, wallOnly.start), [], "벽에 붙기만 한 상자는 경고하지 않음");
  });

  test("실제로 밀어서 구석에 넣으면 경고한다", () => {
    const lv = parseLevel(["######", "#----#", "#-BP-#", "#----#", "######"]);
    const into = play(lv, [L]);
    assert.deepEqual(into.boxes, [at(lv, 1, 2)]);
    assert.deepEqual(deadlockedBoxes(lv, into), [], "왼쪽 벽에만 붙음");
    const corner = play(lv, [D, L, U], into);
    assert.deepEqual(corner.boxes, [at(lv, 1, 1)]);
    assert.deepEqual(deadlockedBoxes(lv, corner), [0]);
  });
});
