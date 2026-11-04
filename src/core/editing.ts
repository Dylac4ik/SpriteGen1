import { RgbaImage, getPixel, setPixel } from './image';
import type { Rgba } from './color';

/** Integer points on the line from (x0,y0) to (x1,y1) inclusive (Bresenham). */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

/** Draws a 1px hard-edged line in place. */
export function drawLine(img: RgbaImage, x0: number, y0: number, x1: number, y1: number, color: Rgba): void {
  for (const [x, y] of linePoints(x0, y0, x1, y1)) setPixel(img, x, y, color);
}

function sameColor(a: Rgba, b: Rgba): boolean {
  if (a[3] === 0 && b[3] === 0) return true; // all fully transparent pixels count as equal
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** 4-connected exact-color flood fill. Returns a new image; input is not mutated. */
export function floodFill(src: RgbaImage, x: number, y: number, color: Rgba): RgbaImage {
  const img = { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return img;
  const target = getPixel(img, x, y);
  if (sameColor(target, color)) return img;
  const visited = new Uint8Array(img.width * img.height);
  const stack: number[] = [y * img.width + x];
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const px = p % img.width;
    const py = (p - px) / img.width;
    if (!sameColor(getPixel(img, px, py), target)) continue;
    setPixel(img, px, py, color);
    if (px > 0) stack.push(p - 1);
    if (px < img.width - 1) stack.push(p + 1);
    if (py > 0) stack.push(p - img.width);
    if (py < img.height - 1) stack.push(p + img.width);
  }
  return img;
}
