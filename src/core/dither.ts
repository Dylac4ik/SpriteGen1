import { RgbaImage } from './image';
import { Rgb, clamp255 } from './color';
import { nearestPaletteIndex } from './quantize';

export const DITHER_ALGORITHMS = [
  'floyd-steinberg',
  'atkinson',
  'sierra-lite',
  'bayer-2',
  'bayer-4',
  'bayer-8',
] as const;
export type DitherAlgorithm = (typeof DITHER_ALGORITHMS)[number];

export const DITHER_LABELS: Record<DitherAlgorithm, string> = {
  'floyd-steinberg': 'Floyd–Steinberg (error diffusion)',
  atkinson: 'Atkinson (error diffusion, lighter)',
  'sierra-lite': 'Sierra Lite (error diffusion)',
  'bayer-2': 'Ordered Bayer 2×2',
  'bayer-4': 'Ordered Bayer 4×4',
  'bayer-8': 'Ordered Bayer 8×8',
};

type Kernel = { dx: number; dy: number; w: number }[];
const KERNELS: Record<string, { kernel: Kernel; divisor: number }> = {
  'floyd-steinberg': {
    kernel: [
      { dx: 1, dy: 0, w: 7 },
      { dx: -1, dy: 1, w: 3 },
      { dx: 0, dy: 1, w: 5 },
      { dx: 1, dy: 1, w: 1 },
    ],
    divisor: 16,
  },
  atkinson: {
    kernel: [
      { dx: 1, dy: 0, w: 1 },
      { dx: 2, dy: 0, w: 1 },
      { dx: -1, dy: 1, w: 1 },
      { dx: 0, dy: 1, w: 1 },
      { dx: 1, dy: 1, w: 1 },
      { dx: 0, dy: 2, w: 1 },
    ],
    divisor: 8,
  },
  'sierra-lite': {
    kernel: [
      { dx: 1, dy: 0, w: 2 },
      { dx: -1, dy: 1, w: 1 },
      { dx: 0, dy: 1, w: 1 },
    ],
    divisor: 4,
  },
};

function bayerMatrix(n: 2 | 4 | 8): number[][] {
  let m = [
    [0, 2],
    [3, 1],
  ];
  while (m.length < n) {
    const size = m.length;
    const next: number[][] = Array.from({ length: size * 2 }, () => new Array<number>(size * 2).fill(0));
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + size] = v + 2;
        next[y + size][x] = v + 3;
        next[y + size][x + size] = v + 1;
      }
    }
    m = next;
  }
  return m;
}

/**
 * Maps opaque pixels to the palette using the chosen dithering algorithm.
 * Transparent pixels are left untouched and never receive diffused error.
 * Output contains only palette colors (for opaque pixels).
 */
export function ditherToPalette(img: RgbaImage, palette: readonly Rgb[], algorithm: DitherAlgorithm): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  if (palette.length === 0) return out;
  const { width, height } = img;
  const d = out.data;

  if (algorithm.startsWith('bayer')) {
    const n = Number(algorithm.split('-')[1]) as 2 | 4 | 8;
    const m = bayerMatrix(n);
    const cells = n * n;
    const spread = 255 / Math.max(2, Math.cbrt(palette.length));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (d[i + 3] === 0) continue;
        const t = (m[y % n][x % n] + 0.5) / cells - 0.5;
        const idx = nearestPaletteIndex(palette, clamp255(d[i] + t * spread), clamp255(d[i + 1] + t * spread), clamp255(d[i + 2] + t * spread));
        const c = palette[idx];
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
      }
    }
    return out;
  }

  const spec = KERNELS[algorithm];
  const err = new Float32Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    err[p * 3] = d[p * 4];
    err[p * 3 + 1] = d[p * 4 + 1];
    err[p * 3 + 2] = d[p * 4 + 2];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (d[i + 3] === 0) continue;
      const r = clamp255(err[p * 3]);
      const g = clamp255(err[p * 3 + 1]);
      const b = clamp255(err[p * 3 + 2]);
      const c = palette[nearestPaletteIndex(palette, r, g, b)];
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      const er = r - c[0];
      const eg = g - c[1];
      const eb = b - c[2];
      for (const k of spec.kernel) {
        const nx = x + k.dx;
        const ny = y + k.dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (d[np * 4 + 3] === 0) continue;
        const f = k.w / spec.divisor;
        err[np * 3] += er * f;
        err[np * 3 + 1] += eg * f;
        err[np * 3 + 2] += eb * f;
      }
    }
  }
  return out;
}
