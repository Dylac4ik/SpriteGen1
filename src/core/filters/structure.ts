import { RgbaImage } from '../image';
import { Rgba, clamp255 } from '../color';

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface OutlineOptions {
  mode: 'outer' | 'inner';
  color: Rgba;
  /** 'custom' uses `color`; 'darken' derives the color from the adjacent sprite pixel. */
  colorMode: 'custom' | 'darken';
  darkenAmount: number; // 0..1
  connectivity: 4 | 8;
  thickness: number; // 1..4
}

/**
 * Outer outline: paints transparent pixels that touch the sprite.
 * Inner outline: recolors sprite pixels that touch transparency or the image border.
 */
export function outline(img: RgbaImage, opts: OutlineOptions): RgbaImage {
  let current = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const neighbors = opts.connectivity === 8 ? N8 : N4;
  const { width, height } = img;
  const passes = Math.max(1, Math.min(4, Math.round(opts.thickness)));
  const opaqueAt = (data: Uint8ClampedArray, x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 0;

  const pick = (src: Uint8ClampedArray, ni: number): Rgba => {
    if (opts.colorMode === 'custom') return opts.color;
    const k = 1 - Math.max(0, Math.min(1, opts.darkenAmount));
    return [clamp255(src[ni] * k), clamp255(src[ni + 1] * k), clamp255(src[ni + 2] * k), 255];
  };

  for (let pass = 0; pass < passes; pass++) {
    const src = current.data;
    const out = new Uint8ClampedArray(src);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const isOpaque = src[i + 3] > 0;
        if (opts.mode === 'outer' && !isOpaque) {
          for (const [dx, dy] of neighbors) {
            if (opaqueAt(src, x + dx, y + dy)) {
              const c = pick(src, ((y + dy) * width + (x + dx)) * 4);
              out.set(c, i);
              break;
            }
          }
        } else if (opts.mode === 'inner' && isOpaque) {
          const edge = neighbors.some(([dx, dy]) => !opaqueAt(src, x + dx, y + dy));
          if (edge) out.set(pick(src, i), i);
        }
      }
    }
    current = { width, height, data: out };
    if (opts.mode === 'inner') break; // inner outline thickness via repeated passes would erode; keep 1px
  }
  return current;
}
