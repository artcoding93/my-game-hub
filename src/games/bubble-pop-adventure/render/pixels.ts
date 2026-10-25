/*
 * 작은 픽셀 캔버스 도우미. 도형(타원·사각형·점)을 정수 픽셀 격자에 칠한 뒤 바깥쪽에 1px 외곽선을 자동으로 두른다.
 * 모든 캐릭터·적·방울·아이템 그림을 이 방식으로 만든다(외부 이미지·원작 스프라이트 없음).
 */

export class Pix {
  readonly w: number;
  readonly h: number;
  private data: (string | null)[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Array(w * h).fill(null);
  }

  set(x: number, y: number, c: string) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.data[y * this.w + x] = c;
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.data[y * this.w + x];
  }

  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** 픽셀 중심이 타원 안이면 칠한다 */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  /** 꼭짓점 세 개 삼각형 */
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: string) {
    const minX = Math.floor(Math.min(ax, bx, cx));
    const maxX = Math.ceil(Math.max(ax, bx, cx));
    const minY = Math.floor(Math.min(ay, by, cy));
    const maxY = Math.ceil(Math.max(ay, by, cy));
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area;
        const w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) this.set(x, y, c);
      }
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) this.set(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
  }

  /** 칠한 픽셀 바깥(상하좌우로 맞닿은 빈칸)에 외곽선 */
  outline(c: string) {
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== null) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.data[y * this.w + x] = c;
  }

  /** 칠한 픽셀을 모두 한 색으로 (피격 번쩍임) */
  silhouette(c: string): Pix {
    const out = new Pix(this.w, this.h);
    this.data.forEach((v, i) => {
      if (v) out.data[i] = c;
    });
    return out;
  }

  toCanvas(flip = false): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.w;
    canvas.height = this.h;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.data[y * this.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(flip ? this.w - 1 - x : x, y, 1, 1);
      }
    }
    return canvas;
  }
}

/** 이름별로 한 번만 만들고 좌우 반전본까지 저장한다 */
export class SpriteCache {
  private map = new Map<string, HTMLCanvasElement>();

  get(key: string, flip: boolean, build: () => Pix): HTMLCanvasElement {
    const k = `${key}|${flip ? 1 : 0}`;
    let c = this.map.get(k);
    if (!c) {
      c = build().toCanvas(flip);
      this.map.set(k, c);
    }
    return c;
  }
}
