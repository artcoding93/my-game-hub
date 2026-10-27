import { ANIM, TILE } from "../config";
import { neighbor, tileAt } from "../logic/engine";
import type { Push } from "../logic/solver";
import { DX, DY, type Board, type Dir, type Level, type StepResult } from "../types";
import { SpriteCache, type Pix } from "./pixels";
import { buildBelt, buildCrate, buildFloor, buildIce, buildLamp, buildPad, buildRobot, buildWall, PALETTE, type RobotFacing, type RobotPose } from "./sprites";

/*
 * 캔버스 그리기 (칸 수 × 16px 내부 해상도, CSS로 확대하며 픽셀을 보간하지 않는다).
 * 게임 상태(Board)를 읽기만 한다. 애니메이션은 "마지막 턴의 경로"를 시간에 따라 보여 주는 연출일 뿐이라,
 * 새 입력·Undo가 오면 곧바로 논리 상태로 맞춘 뒤(snap) 다음 연출을 시작한다(빠른 입력에도 상태가 어긋나지 않음).
 */

interface Segment {
  from: number;
  to: number;
  start: number;
  end: number;
  kind: "push" | "conveyor" | "ice" | "teleport";
}

interface Turn {
  t0: number;
  dir: Dir;
  playerFrom: number;
  playerTo: number;
  pushing: boolean;
  box: number;
  segments: Segment[];
  end: number;
}

export interface RenderOptions {
  hint: Push | null;
  deadlocks: readonly number[];
  /** 전체 클리어 축하 연출 */
  celebrate: boolean;
}

const sprites = new SpriteCache();

export class CargoRenderer {
  private level: Level | null = null;
  private tiles: HTMLCanvasElement | null = null;
  private turn: Turn | null = null;
  private facing: Dir = 2;
  private lampFlash = new Map<number, number>();
  private confetti: { x: number; y: number; vx: number; vy: number; c: string; life: number }[] = [];

  setLevel(level: Level) {
    if (this.level === level) return;
    this.level = level;
    this.tiles = null;
    this.turn = null;
    this.facing = 2;
    this.lampFlash.clear();
  }

  /** 새 턴: 이전 연출은 버리고 이번 턴 경로를 시간표로 만든다 */
  onStep(res: StepResult, now: number) {
    this.facing = res.dir;
    if (!res.moved) {
      this.turn = null;
      return;
    }
    const segments: Segment[] = [];
    let t = now;
    if (res.box) {
      let from = res.box.from;
      for (const step of res.box.path) {
        const dur = step.kind === "push" ? ANIM.walk : step.kind === "teleport" ? ANIM.teleport : ANIM.slide;
        segments.push({ from, to: step.cell, start: t, end: t + dur, kind: step.kind });
        from = step.cell;
        t += dur;
      }
      const last = res.box.path[res.box.path.length - 1].cell;
      if (this.level?.targets.has(last)) this.lampFlash.set(last, t);
    }
    this.turn = { t0: now, dir: res.dir, playerFrom: res.playerFrom, playerTo: res.board.player, pushing: Boolean(res.box), box: res.box?.box ?? -1, segments, end: Math.max(now + ANIM.walk, t) };
  }

  /** Undo·Redo·Restart: 연출 없이 논리 상태 그대로 */
  snap() {
    this.turn = null;
  }

  /** 아직 연출 중인지 (효과음 타이밍 등에 사용) */
  animating(now: number) {
    return this.turn !== null && now < this.turn.end;
  }

  private xy(cell: number) {
    const cols = this.level!.cols;
    return { x: (cell % cols) * TILE, y: Math.floor(cell / cols) * TILE };
  }

  private buildTiles(level: Level) {
    const c = document.createElement("canvas");
    c.width = level.cols * TILE;
    c.height = level.rows * TILE;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let cell = 0; cell < level.tiles.length; cell++) {
      const t = level.tiles[cell];
      const { x, y } = this.xy(cell);
      const v = (cell * 7 + Math.floor(cell / level.cols) * 3) % 11;
      if (t.kind === "void") continue;
      if (t.kind === "wall") {
        const below = tileAt(level, neighbor(level, cell, 2)).kind;
        ctx.drawImage(sprites.get(`wall${below !== "wall" && below !== "void" ? 1 : 0}-${v % 4}`, false, () => buildWall(below !== "wall" && below !== "void", v)), x, y);
        continue;
      }
      if (t.kind === "ice") ctx.drawImage(sprites.get(`ice${v % 6}`, false, () => buildIce(v)), x, y);
      else ctx.drawImage(sprites.get(`floor${v}`, false, () => buildFloor(v)), x, y);
    }
    return c;
  }

  render(ctx: CanvasRenderingContext2D, board: Board, now: number, opts: RenderOptions) {
    const level = this.level;
    if (!level) return;
    ctx.imageSmoothingEnabled = false;
    if (!this.tiles) this.tiles = this.buildTiles(level);
    ctx.drawImage(this.tiles, 0, 0);

    // 움직이는 특수 타일과 목표 표시등
    const beltPhase = Math.floor(now * 8) % 4;
    for (let cell = 0; cell < level.tiles.length; cell++) {
      const t = level.tiles[cell];
      const { x, y } = this.xy(cell);
      if (t.kind === "conveyor") this.drawRotated(ctx, sprites.get(`belt${beltPhase}`, false, () => buildBelt(beltPhase)), x, y, t.dir);
      else if (t.kind === "teleport") {
        const spin = Math.floor(now * 4) % 6;
        ctx.drawImage(sprites.get(`pad${t.pair}-${spin}`, false, () => buildPad(t.pair, (spin * Math.PI) / 3)), x, y);
      }
    }
    const turn = this.turn && now < this.turn.end ? this.turn : null;
    const boxCells = this.visualBoxes(board, turn, now);
    for (const cell of level.targets) {
      const { x, y } = this.xy(cell);
      const covered = board.boxes.includes(cell);
      const pulse = Math.floor(now * 2) % 2 === 0;
      ctx.drawImage(sprites.get(`lamp${covered ? 1 : 0}${pulse ? 1 : 0}`, false, () => buildLamp(covered, pulse)), x, y);
    }

    // 상자
    boxCells.forEach((v, i) => {
      if (v.alpha <= 0) return;
      const lit = !turn || turn.box !== i || now >= turn.end ? level.targets.has(board.boxes[i]) : false;
      const img = sprites.get(`crate${i % 2}${lit ? 1 : 0}`, false, () => buildCrate(i % 2 === 1, lit));
      ctx.globalAlpha = v.alpha;
      ctx.drawImage(img, Math.round(v.x), Math.round(v.y));
      ctx.globalAlpha = 1;
      if (opts.deadlocks.includes(i) && Math.floor(now * 3) % 2 === 0) this.drawWarning(ctx, v.x, v.y);
    });

    // 목표 도착 빛
    for (const [cell, t] of this.lampFlash) {
      const age = now - t;
      if (age < 0) continue;
      if (age > ANIM.lamp) {
        this.lampFlash.delete(cell);
        continue;
      }
      const { x, y } = this.xy(cell);
      const r = 4 + (age / ANIM.lamp) * 10;
      ctx.globalAlpha = 1 - age / ANIM.lamp;
      ctx.strokeStyle = PALETTE.lampOnGlow;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x + 8 - r), Math.round(y + 8 - r), Math.round(r * 2), Math.round(r * 2));
      ctx.globalAlpha = 1;
    }

    // 로봇
    this.drawRobot(ctx, board, turn, now);

    // 힌트: 다음에 밀 상자 테두리 + 방향 화살표
    if (opts.hint) {
      const v = boxCells[opts.hint.box];
      if (v) {
        const on = Math.floor(now * 4) % 2 === 0;
        ctx.strokeStyle = on ? "#7cf5ff" : "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(v.x) + 0.5, Math.round(v.y) + 0.5, TILE - 1, TILE - 1);
        const ax = v.x + 8 + DX[opts.hint.dir] * 12;
        const ay = v.y + 8 + DY[opts.hint.dir] * 12;
        ctx.fillStyle = "#7cf5ff";
        for (let k = 0; k < 3; k++) {
          const px = ax - DX[opts.hint.dir] * k;
          const py = ay - DY[opts.hint.dir] * k;
          const w = 3 - k;
          ctx.fillRect(Math.round(px - (DY[opts.hint.dir] !== 0 ? w : 0)), Math.round(py - (DX[opts.hint.dir] !== 0 ? w : 0)), DY[opts.hint.dir] !== 0 ? w * 2 + 1 : 1, DX[opts.hint.dir] !== 0 ? w * 2 + 1 : 1);
        }
      }
    }

    if (opts.celebrate) this.drawConfetti(ctx, level);
  }

  /** 상자들의 화면 위치 (연출 중인 상자만 경로를 따라 이동) */
  private visualBoxes(board: Board, turn: Turn | null, now: number) {
    return board.boxes.map((cell, i) => {
      const p = this.xy(cell);
      if (!turn || turn.box !== i) return { x: p.x, y: p.y, alpha: 1 };
      const seg = turn.segments.find((s) => now < s.end) ?? turn.segments[turn.segments.length - 1];
      const a = this.xy(seg.from);
      const b = this.xy(seg.to);
      const k = Math.min(1, Math.max(0, (now - seg.start) / (seg.end - seg.start)));
      if (seg.kind === "teleport") {
        // 사라졌다가 짝 장치에서 나타난다
        return k < 0.5 ? { x: a.x, y: a.y, alpha: 1 - k * 2 } : { x: b.x, y: b.y, alpha: (k - 0.5) * 2 };
      }
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, alpha: 1 };
    });
  }

  private drawRobot(ctx: CanvasRenderingContext2D, board: Board, turn: Turn | null, now: number) {
    let { x, y } = this.xy(board.player);
    let pose: RobotPose = "idle";
    let frame = Math.floor(now * 2) % 2;
    if (turn) {
      const k = Math.min(1, (now - turn.t0) / ANIM.walk);
      const a = this.xy(turn.playerFrom);
      const b = this.xy(turn.playerTo);
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      pose = turn.pushing ? "push" : "walk";
      frame = Math.floor(now * 16) % 2;
    }
    const facing: RobotFacing = this.facing === 0 ? "up" : this.facing === 2 ? "down" : "side";
    const img = sprites.get(`robot-${facing}-${pose}-${frame}`, this.facing === 3, () => buildRobot(facing, pose, frame));
    ctx.drawImage(img, Math.round(x), Math.round(y));
  }

  private drawRotated(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, dir: Dir) {
    ctx.save();
    ctx.translate(x + 8, y + 8);
    ctx.rotate(((dir - 1) * Math.PI) / 2);
    ctx.drawImage(img, -8, -8);
    ctx.restore();
  }

  private drawWarning(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillStyle = "#ff4d5e";
    ctx.fillRect(Math.round(x) + 6, Math.round(y) + 2, 4, 7);
    ctx.fillRect(Math.round(x) + 6, Math.round(y) + 11, 4, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(x) + 7, Math.round(y) + 3, 2, 5);
    ctx.fillRect(Math.round(x) + 7, Math.round(y) + 12, 2, 1);
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, level: Level) {
    const w = level.cols * TILE;
    const h = level.rows * TILE;
    if (this.confetti.length < 80) {
      const colors = ["#4ce07a", "#ffbe55", "#45d6ff", "#ff6fd2", "#ffffff"];
      for (let i = 0; i < 3; i++)
        this.confetti.push({ x: Math.random() * w, y: -4, vx: (Math.random() - 0.5) * 20, vy: 20 + Math.random() * 30, c: colors[Math.floor(Math.random() * colors.length)], life: 0 });
    }
    for (const p of this.confetti) {
      p.life += 1 / 60;
      p.x += p.vx / 60;
      p.y += p.vy / 60;
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    this.confetti = this.confetti.filter((p) => p.y < h + 4);
  }

  /** 시작 화면 등 React에서 쓰는 로봇 그림 */
  static robotPreview(scale = 4): HTMLCanvasElement {
    return scaled(buildRobot("down", "idle", 0), scale);
  }

  /** 게임 방법 화면의 타일 예시 그림 */
  static tilePreview(kind: "crate" | "lamp" | "lit" | "belt" | "ice" | "pad" | "wall", scale = 3): HTMLCanvasElement {
    const pix: Pix =
      kind === "crate" ? buildCrate(false, false) : kind === "lit" ? buildCrate(true, true) : kind === "lamp" ? buildLamp(false, true) : kind === "belt" ? buildBelt(0) : kind === "ice" ? buildIce(1) : kind === "pad" ? buildPad(1, 0) : buildWall(true, 0);
    return scaled(pix, scale);
  }
}

function scaled(pix: Pix, scale: number) {
  const src = pix.toCanvas();
  const c = document.createElement("canvas");
  c.width = src.width * scale;
  c.height = src.height * scale;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
