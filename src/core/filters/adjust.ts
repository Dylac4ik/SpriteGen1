import { RgbaImage } from '../image';
import { clamp255, hslToRgb, luma, rgbToHsl } from '../color';

/** Applies a per-pixel RGB transform to opaque pixels only; alpha is never changed. */
function mapOpaque(img: RgbaImage, fn: (r: number, g: number, b: number) => [number, number, number]): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]);
    d[i] = clamp255(r);
    d[i + 1] = clamp255(g);
    d[i + 2] = clamp255(b);
  }
  return out;
}

/** amount in [-100, 100]; 0 = unchanged. */
export function brightness(img: RgbaImage, amount: number): RgbaImage {
  if (amount === 0) return mapOpaque(img, (r, g, b) => [r, g, b]);
  const delta = (amount / 100) * 255;
  return mapOpaque(img, (r, g, b) => [r + delta, g + delta, b + delta]);
}

/** amount in [-100, 100]; 0 = unchanged. */
export function contrast(img: RgbaImage, amount: number): RgbaImage {
  const c = Math.max(-254, Math.min(254, (amount / 100) * 255));
  const f = (259 * (c + 255)) / (255 * (259 - c));
  return mapOpaque(img, (r, g, b) => [f * (r - 128) + 128, f * (g - 128) + 128, f * (b - 128) + 128]);
}

/** amount in [-100, 100]; -100 = grayscale, 0 = unchanged. */
export function saturation(img: RgbaImage, amount: number): RgbaImage {
  const s = 1 + amount / 100;
  return mapOpaque(img, (r, g, b) => {
    const l = luma(r, g, b);
    return [l + (r - l) * s, l + (g - l) * s, l + (b - l) * s];
  });
}

/** degrees in [-180, 180]. */
export function hueShift(img: RgbaImage, degrees: number): RgbaImage {
  if (degrees === 0) return mapOpaque(img, (r, g, b) => [r, g, b]);
  const cache = new Map<number, [number, number, number]>();
  return mapOpaque(img, (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (!v) {
      const [h, s, l] = rgbToHsl(r, g, b);
      v = hslToRgb(h + degrees, s, l);
      cache.set(key, v);
    }
    return v;
  });
}

/** gamma > 0; 1 = unchanged, > 1 brightens midtones. */
export function gamma(img: RgbaImage, g: number): RgbaImage {
  const inv = 1 / Math.max(0.01, g);
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp255(255 * Math.pow(i / 255, inv));
  return mapOpaque(img, (r, gg, b) => [lut[r], lut[gg], lut[b]]);
}

/** levels per channel in [2, 256]. */
export function posterize(img: RgbaImage, levels: number): RgbaImage {
  const n = Math.max(2, Math.min(256, Math.round(levels)));
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp255((Math.round((i / 255) * (n - 1)) / (n - 1)) * 255);
  return mapOpaque(img, (r, g, b) => [lut[r], lut[g], lut[b]]);
}

/**
 * 3x3 cross sharpen on opaque pixels. Transparent neighbors are treated as the center
 * pixel so the sprite edge does not pick up halo artifacts from invisible RGB values.
 */
export function sharpen(img: RgbaImage, amount: number): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  if (amount <= 0) return out;
  const { width, height, data: s } = img;
  const d = out.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (s[i + 3] === 0) continue;
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      for (let c = 0; c < 3; c++) {
        const center = s[i + c];
        let sum = 0;
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            sum += center;
            continue;
          }
          const ni = (ny * width + nx) * 4;
          sum += s[ni + 3] === 0 ? center : s[ni + c];
        }
        d[i + c] = clamp255(center + amount * (4 * center - sum));
      }
    }
  }
  return out;
}

/** Binarizes alpha: alpha >= threshold becomes 255, otherwise the pixel becomes fully transparent. */
export function alphaThreshold(img: RgbaImage, threshold: number): RgbaImage {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= threshold) d[i + 3] = 255;
    else {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }
  return out;
}
