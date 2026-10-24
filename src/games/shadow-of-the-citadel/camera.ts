import { CAMERA, MOVE, TILE, VIEW } from "./config";
import type { Player } from "./logic/player";

/*
 * 2D 사이드뷰 카메라 (그리기 전용, 규칙에 영향 없음).
 * - 가로: 진행 방향으로 여유 공간(속도에 비례)을 두고 지수 보간으로 따라간다.
 * - 세로: 땅·난간에 있을 때의 발 높이를 기준으로 삼고, 점프 중에는 일정 범위를 벗어날 때만 따라가 흔들리지 않는다.
 */
export class Camera {
  /** 화면 가운데의 월드 좌표 */
  x = 0;
  y = 0;
  private lookAhead = 0;
  private baseY = 0;
  private readonly worldWidth: number;
  private readonly worldHeight: number;

  constructor(worldWidth: number, worldHeight: number) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  get viewWidth() {
    return VIEW.width / VIEW.zoom;
  }

  get viewHeight() {
    return VIEW.height / VIEW.zoom;
  }

  snap(player: Player) {
    this.lookAhead = player.facing * CAMERA.lookAheadMin;
    this.baseY = player.y;
    this.x = this.clampX(player.x + this.lookAhead);
    this.y = this.clampY(this.baseY - CAMERA.focusAbove);
  }

  update(dt: number, player: Player, x: number, y: number) {
    const speed = Math.min(1, Math.abs(player.vx) / MOVE.runSpeed);
    const ahead = player.facing * (CAMERA.lookAheadMin + (CAMERA.lookAheadMax - CAMERA.lookAheadMin) * speed);
    this.lookAhead += (ahead - this.lookAhead) * (1 - Math.exp(-dt * CAMERA.lookAheadRate));

    const settled = player.mode !== "air";
    if (settled) this.baseY = y;
    else if (y > this.baseY + TILE * 0.5 || y < this.baseY - CAMERA.airDeadZoneUp) this.baseY += (y - this.baseY) * (1 - Math.exp(-dt * 6));

    this.x += (this.clampX(x + this.lookAhead) - this.x) * (1 - Math.exp(-dt * CAMERA.followX));
    this.y += (this.clampY(this.baseY - CAMERA.focusAbove) - this.y) * (1 - Math.exp(-dt * CAMERA.followY));

    // 빨리 떨어지거나 높이 올라가도 캐릭터가 화면 밖으로 나가지 않게 한다 (발은 아래 가장자리에서 48px, 머리는 위에서 24px 안쪽)
    // 화면 가운데 y의 허용 범위: [발 - halfH + 48, 머리(발 - 80) + halfH - 24]
    const halfH = this.viewHeight / 2;
    this.y = this.clampY(Math.min(Math.max(this.y, y - halfH + 48), y + halfH - 104));
    const halfW = this.viewWidth / 2;
    this.x = this.clampX(Math.min(Math.max(this.x, x - halfW + 60), x + halfW - 60));
  }

  private clampX(x: number) {
    const half = this.viewWidth / 2;
    return Math.min(Math.max(x, half), this.worldWidth - half);
  }

  private clampY(y: number) {
    const half = this.viewHeight / 2;
    return Math.min(Math.max(y, half), this.worldHeight - half);
  }
}
