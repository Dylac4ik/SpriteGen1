import { RgbaImage } from '../image';
import { Rgba } from '../color';

function within(d: Uint8ClampedArray, i: number, key: Rgba, tolerance: number): boolean {
  return (
    d[i + 3] > 0 &&
    Math.abs(d[i] - key[0]) <= tolerance &&
    Math.abs(d[i + 1] - key[1]) <= tolerance &&
    Math.abs(d[i + 2] - key[2]) <= tolerance
  );
}

/** Most common opaque color along the image border, or null if the border is fully transparent. */
export function dominantBorderColor(img: RgbaImage): Rgba | null {
  const { width, height, data: d } = img;
  const counts = new Map<number, number>();
  const add = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (d[i + 3] === 0) return;
    // Bucket to 4 bits per channel so slightly noisy backgrounds still agree.
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) {
    add(x, 0);
    add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    add(0, y);
    add(width - 1, y);
  }
  if (counts.size === 0) return null;
  let bestKey = 0;
  let best = -1;
  for (const [k, n] of counts) if (n > best) [best, bestKey] = [n, k];
  // Average the actual colors within the winning bucket.
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  const scan = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (d[i + 3] === 0) return;
    const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    if (key !== bestKey) return;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  };
  for (let x = 0; x < width; x++) {
    scan(x, 0);
    scan(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    scan(0, y);
    scan(width - 1, y);
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255];
}

export interface RemoveBackgroundOptions {
  /** 'auto-edges': key color sampled from the border, removed contiguously from the edges. 'color': use `color`. */
  mode: 'auto-edges' | 'color';
  color?: Rgba;
  /** Max per-channel difference (0-255) still considered background. */
  tolerance: number;
  /** For 'color' mode: only remove regions connected to the image border. */
  contiguous: boolean;
}

/** Makes background pixels fully transparent. Returns a new image. */
export function removeBackground(img: RgbaImage, opts: RemoveBackgroundOptions): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const key = opts.mode === 'auto-edges' ? dominantBorderColor(img) : (opts.color ?? null);
  if (!key) return out;
  const { width, height } = img;
  const d = out.data;
  const tol = Math.max(0, Math.min(255, opts.tolerance));
  const clear = (i: number) => {
    d[i] = 0;
    d[i + 1] = 0;
    d[i + 2] = 0;
    d[i + 3] = 0;
  };
  const contiguous = opts.mode === 'auto-edges' || opts.contiguous;
  if (!contiguous) {
    for (let i = 0; i < d.length; i += 4) if (within(d, i, key, tol)) clear(i);
    return out;
  }
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    // Already-transparent pixels are passable so removal can continue around holes.
    if (d[i + 3] !== 0 && !within(d, i, key, tol)) continue;
    clear(i);
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) stack.push(p - 1);
    if (x < width - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - width);
    if (y < height - 1) stack.push(p + width);
  }
  return out;
}
