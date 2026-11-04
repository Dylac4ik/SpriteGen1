import { RgbaImage, assertDimensions, createImage, packRgba, unpackRgba } from './image';

/**
 * Nearest-neighbor resize. Each destination pixel copies exactly one source pixel
 * (the one under the destination pixel's center). Never blends, never smooths,
 * never introduces colors that are not present in the source.
 */
export function resizeNearest(src: RgbaImage, width: number, height: number): RgbaImage {
  assertDimensions(width, height);
  if (width === src.width && height === src.height) {
    return { width, height, data: new Uint8ClampedArray(src.data) };
  }
  const out = createImage(width, height);
  const sd = src.data;
  const od = out.data;
  const xMap = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    xMap[x] = Math.min(src.width - 1, Math.floor(((x + 0.5) * src.width) / width));
  }
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor(((y + 0.5) * src.height) / height));
    const srow = sy * src.width;
    const orow = y * width;
    for (let x = 0; x < width; x++) {
      const si = (srow + xMap[x]) * 4;
      const oi = (orow + x) * 4;
      od[oi] = sd[si];
      od[oi + 1] = sd[si + 1];
      od[oi + 2] = sd[si + 2];
      od[oi + 3] = sd[si + 3];
    }
  }
  return out;
}

/** Integer nearest-neighbor enlargement: every source pixel becomes a factor x factor block. */
export function scaleNearestInteger(src: RgbaImage, factor: number): RgbaImage {
  if (!Number.isInteger(factor) || factor < 1) throw new Error(`Scale factor must be a positive integer, got ${factor}`);
  if (factor === 1) return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  return resizeNearest(src, src.width * factor, src.height * factor);
}

/**
 * "Dominant color" downscale: each destination pixel takes the most frequent exact
 * color of its source block (ties broken by first occurrence). Like nearest-neighbor it
 * never creates new colors and keeps hard edges, but it is far less sensitive to
 * single-pixel noise. A block becomes transparent when most of it is transparent.
 */
export function downscaleDominant(src: RgbaImage, width: number, height: number): RgbaImage {
  assertDimensions(width, height);
  if (width > src.width || height > src.height) {
    throw new Error('downscaleDominant can only shrink images');
  }
  const out = createImage(width, height);
  const sd = src.data;
  const counts = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * src.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * src.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / width));
      counts.clear();
      let transparent = 0;
      let total = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          total++;
          if (sd[i + 3] === 0) {
            transparent++;
            continue;
          }
          const key = packRgba(sd[i], sd[i + 1], sd[i + 2], sd[i + 3]);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      const oi = (y * width + x) * 4;
      if (transparent * 2 > total || counts.size === 0) {
        out.data[oi + 3] = 0;
        continue;
      }
      let bestKey = 0;
      let best = -1;
      for (const [key, n] of counts) {
        if (n > best) {
          best = n;
          bestKey = key;
        }
      }
      const [r, g, b, a] = unpackRgba(bestKey);
      out.data[oi] = r;
      out.data[oi + 1] = g;
      out.data[oi + 2] = b;
      out.data[oi + 3] = a;
    }
  }
  return out;
}

/** Center-crops to the largest centered square. Returns a copy. */
export function cropToSquare(src: RgbaImage): RgbaImage {
  if (src.width === src.height) return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
  const side = Math.min(src.width, src.height);
  const ox = Math.floor((src.width - side) / 2);
  const oy = Math.floor((src.height - side) / 2);
  const out = createImage(side, side);
  for (let y = 0; y < side; y++) {
    const start = ((y + oy) * src.width + ox) * 4;
    out.data.set(src.data.subarray(start, start + side * 4), y * side * 4);
  }
  return out;
}
