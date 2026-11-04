import { RgbaImage, createImage, setPixel } from '../../src/core/image';

/** Builds an image from rows of single-char codes mapped to colors ('.' = transparent). */
export function fromAscii(rows: string[], colors: Record<string, [number, number, number, number]>): RgbaImage {
  const img = createImage(rows[0].length, rows.length);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      setPixel(img, x, y, colors[ch]);
    }),
  );
  return img;
}

export function randomImage(w: number, h: number, seed = 1, alpha = true): RgbaImage {
  const img = createImage(w, h);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) >>> 16) & 255;
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = rnd();
    img.data[i + 1] = rnd();
    img.data[i + 2] = rnd();
    img.data[i + 3] = alpha ? (rnd() > 60 ? 255 : 0) : 255;
  }
  return img;
}

export function colorSet(img: RgbaImage, includeTransparent = false): Set<number> {
  const s = new Set<number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0 && !includeTransparent) continue;
    s.add(((img.data[i] << 24) | (img.data[i + 1] << 16) | (img.data[i + 2] << 8) | img.data[i + 3]) >>> 0);
  }
  return s;
}
