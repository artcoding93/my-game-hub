import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RACE } from "./config";
import { TurboKartController } from "./controller";
import { PLAYER } from "./logic/game";

/*
 * 실제 화면 루프(컨트롤러 + 입력 상태)로 조작 일관성을 검사한다.
 * 물리는 고정 1/60초로만 진행하므로 화면 프레임 수가 달라도, 키보드든 터치든 같은 결과가 나와야 한다.
 */

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** 출발 후 가속 → 오른쪽 0.5초 → 놓고 1초. source: 키 코드 또는 터치 포인터 이름 */
function maneuver(frameDt: number, source = "ArrowRight") {
  const c = new TurboKartController();
  c.startRace({ track: "greenValley", difficulty: "easy", seed: 3 });
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += frameDt) c.update(frameDt);
  };
  c.input.press("KeyW", "throttle");
  run(RACE.countdown + 2);
  const kart = c.race!.state.karts[PLAYER];
  const h0 = kart.heading;
  c.input.press(source, "right");
  run(0.5);
  c.input.release(source);
  const atRelease = kart.heading;
  run(1);
  return { turned: wrap(kart.heading - h0), afterRelease: wrap(kart.heading - atRelease), yaw: kart.yawRate, x: kart.x, y: kart.y };
}

describe("9. 프레임 수와 무관한 조작감", () => {
  test("30·60·120FPS에서 같은 조작이면 같은 만큼 돌고, 놓으면 멈춘다", () => {
    const r = [1 / 30, 1 / 60, 1 / 120].map((dt) => maneuver(dt));
    for (const x of r) {
      // 입력이 들어가는 순간이 고정 스텝 경계에 맞춰지므로 1스텝(1/60초) 차이만 허용
      assert.ok(Math.abs(x.turned - r[1].turned) < 0.06, `회전량 ${r.map((y) => y.turned.toFixed(3)).join(" / ")}`);
      assert.ok(Math.abs(x.yaw) < 0.01, "놓은 뒤 1초: 회전 없음");
      assert.ok(x.turned > 0.3, `회전 ${x.turned}`);
    }
  });
});

describe("10. 모바일 터치", () => {
  test("터치 조향 버튼은 키보드와 똑같이 움직인다", () => {
    const key = maneuver(1 / 60, "ArrowRight");
    const touch = maneuver(1 / 60, "t-right");
    assert.deepEqual(touch, key);
  });

  test("양쪽 버튼을 동시에 누르면 조향 0, 하나를 떼면 남은 쪽으로 (멀티터치)", () => {
    const c = new TurboKartController();
    c.input.press("t-left", "left");
    c.input.press("t-right", "right");
    assert.equal(c.input.take().steer, 0);
    c.input.release("t-left");
    assert.equal(c.input.take().steer, 1);
  });

  test("드리프트 입력은 없다 (자동 드리프트)", () => {
    const c = new TurboKartController();
    assert.ok(!("drift" in c.input.take()));
  });
});
