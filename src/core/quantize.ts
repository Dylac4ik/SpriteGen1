import { RgbaImage, packRgba } from './image';
import { Rgb, colorDistanceSq } from './color';

/**
 * Median-cut palette extraction over opaque pixels (alpha > 0).
 * Uses a 5-bit-per-channel histogram so it is fast even on 1024x1024 model output.
 * If the image already has <= maxColors distinct colors, those exact colors are returned.
 */
export function medianCutPalette(img: RgbaImage, maxColors: number): Rgb[] {
  const k = Math.max(1, Math.floor(maxColors));
  const d = img.data;

  // Exact path for already-limited images (keeps colors bit-exact).
  const exact = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = packRgba(d[i], d[i + 1], d[i + 2], 255);
    exact.set(key, (exact.get(key) ?? 0) + 1);
    if (exact.size > k) break;
  }
  if (exact.size <= k) {
    return [...exact.keys()].map((key) => [(key >>> 24) & 255, (key >>> 16) & 255, (key >>> 8) & 255]);
  }

  const hist = new Uint32Array(32 * 32 * 32);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
  }
  const bins: number[] = [];
  for (let i = 0; i < hist.length; i++) if (hist[i] > 0) bins.push(i);
  if (bins.length === 0) return [];

  type Box = { bins: number[] };
  const boxes: Box[] = [{ bins }];
  const channel = (bin: number, c: number) => (c === 0 ? bin >> 10 : c === 1 ? (bin >> 5) & 31 : bin & 31);

  while (boxes.length < k) {
    // Split the box with the largest (range * population).
    let bestIdx = -1;
    let bestScore = -1;
    let bestChannel = 0;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      if (box.bins.length < 2) continue;
      let pop = 0;
      const min = [31, 31, 31];
      const max = [0, 0, 0];
      for (const bin of box.bins) {
        pop += hist[bin];
        for (let c = 0; c < 3; c++) {
          const v = channel(bin, c);
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
      }
      const ranges = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
      const ch = ranges[1] >= ranges[0] && ranges[1] >= ranges[2] ? 1 : ranges[0] >= ranges[2] ? 0 : 2;
      const score = ranges[ch] * Math.sqrt(pop);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = b;
        bestChannel = ch;
      }
    }
    if (bestIdx < 0) break;
    const box = boxes[bestIdx];
    box.bins.sort((a, b) => channel(a, bestChannel) - channel(b, bestChannel));
    let total = 0;
    for (const bin of box.bins) total += hist[bin];
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < box.bins.length - 1; i++) {
      acc += hist[box.bins[i]];
      if (acc >= total / 2) {
        cut = i + 1;
        break;
      }
      cut = i + 1;
    }
    boxes.splice(bestIdx, 1, { bins: box.bins.slice(0, cut) }, { bins: box.bins.slice(cut) });
  }

  // Average the actual pixel colors falling in each box.
  const binToBox = new Int32Array(hist.length).fill(-1);
  boxes.forEach((box, idx) => box.bins.forEach((bin) => (binToBox[bin] = idx)));
  const sums = boxes.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const box = binToBox[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)];
    const s = sums[box];
    s[0] += d[i];
    s[1] += d[i + 1];
    s[2] += d[i + 2];
    s[3]++;
  }
  return sums.filter((s) => s[3] > 0).map((s) => [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])]);
}

/** Refines a palette with a few Lloyd (k-means) iterations over opaque pixels. */
export function kmeansRefine(img: RgbaImage, palette: Rgb[], iterations = 6): Rgb[] {
  if (palette.length === 0) return palette;
  let pal = palette.map((c) => [...c] as Rgb);
  const d = img.data;
  // Subsample large images for speed.
  const pixelCount = d.length / 4;
  const step = Math.max(1, Math.floor(pixelCount / 65536));
  for (let it = 0; it < iterations; it++) {
    const sums = pal.map(() => [0, 0, 0, 0]);
    for (let p = 0; p < pixelCount; p += step) {
      const i = p * 4;
      if (d[i + 3] === 0) continue;
      const idx = nearestPaletteIndex(pal, d[i], d[i + 1], d[i + 2]);
      const s = sums[idx];
      s[0] += d[i];
      s[1] += d[i + 1];
      s[2] += d[i + 2];
      s[3]++;
    }
    let moved = false;
    pal = pal.map((c, idx) => {
      const s = sums[idx];
      if (s[3] === 0) return c;
      const n: Rgb = [Math.round(s[0] / s[3]), Math.round(s[1] / s[3]), Math.round(s[2] / s[3])];
      if (n[0] !== c[0] || n[1] !== c[1] || n[2] !== c[2]) moved = true;
      return n;
    });
    if (!moved) break;
  }
  return pal;
}

export function nearestPaletteIndex(palette: readonly Rgb[], r: number, g: number, b: number): number {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dist = colorDistanceSq(r, g, b, c[0], c[1], c[2]);
    if (dist < bestD) {
      bestD = dist;
      best = i;
      if (dist === 0) break;
    }
  }
  return best;
}

/** Maps every opaque pixel to its nearest palette color (no dithering). Alpha is preserved. */
export function mapToPalette(img: RgbaImage, palette: readonly Rgb[]): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  if (palette.length === 0) return out;
  const d = out.data;
  const cache = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearestPaletteIndex(palette, d[i], d[i + 1], d[i + 2]);
      cache.set(key, idx);
    }
    const c = palette[idx];
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
  return out;
}

export function buildPalette(img: RgbaImage, colors: number, method: 'median-cut' | 'k-means'): Rgb[] {
  const base = medianCutPalette(img, colors);
  return method === 'k-means' && base.length >= colors ? kmeansRefine(img, base) : base;
}
