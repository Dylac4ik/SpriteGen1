import { describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel } from '../../src/core/image';
import { cropToSquare, downscaleDominant, resizeNearest, scaleNearestInteger } from '../../src/core/resize';
import { SPRITE_SIZES } from '../../src/core/sizes';
import { colorSet, fromAscii, randomImage } from './helpers';

const C = { r: [255, 0, 0, 255], g: [0, 255, 0, 255], b: [0, 0, 255, 255], k: [0, 0, 0, 255] } as Record<string, [number, number, number, number]>;

describe('nearest-neighbor resizing', () => {
  it('integer upscaling replicates each pixel into an exact NxN block', () => {
    const src = fromAscii(['rg', 'b.'], C);
    const out = scaleNearestInteger(src, 4);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        expect(getPixel(out, x, y)).toEqual(getPixel(src, Math.floor(x / 4), Math.floor(y / 4)));
      }
  });

  it('never introduces new colors (no interpolation or smoothing)', () => {
    const src = randomImage(37, 23, 7);
    const before = colorSet(src, true);
    for (const [w, h] of [
      [8, 8],
      [100, 51],
      [512, 512],
      [3, 90],
    ]) {
      const out = resizeNearest(src, w, h);
      expect(out.width).toBe(w);
      expect(out.height).toBe(h);
      for (const c of colorSet(out, true)) expect(before.has(c)).toBe(true);
    }
  });

  it('downscaling samples block centers', () => {
    // 4x4 blocks of 2x2; the pixel at each block's center (offset 1,1) decides the result.
    const src = createImage(4, 4, [0, 0, 0, 255]);
    setPixel(src, 1, 1, [255, 0, 0, 255]);
    setPixel(src, 3, 1, [0, 255, 0, 255]);
    const out = resizeNearest(src, 2, 2);
    expect(getPixel(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(out, 1, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(out, 0, 1)).toEqual([0, 0, 0, 255]);
  });

  it('preserves alpha exactly', () => {
    const src = createImage(2, 2);
    setPixel(src, 0, 0, [10, 20, 30, 77]);
    const out = scaleNearestInteger(src, 8);
    expect(getPixel(out, 3, 3)).toEqual([10, 20, 30, 77]);
    expect(getPixel(out, 12, 12)[3]).toBe(0);
  });

  it('round-trips every sprite size through 1024 working resolution exactly', () => {
    for (const size of SPRITE_SIZES) {
      const src = randomImage(size, size, size);
      const up = scaleNearestInteger(src, 1024 / size);
      const down = resizeNearest(up, size, size);
      expect(Buffer.from(down.data).equals(Buffer.from(src.data))).toBe(true);
    }
  });

  it('does not mutate the source', () => {
    const src = randomImage(16, 16);
    const copy = new Uint8ClampedArray(src.data);
    resizeNearest(src, 8, 8);
    expect(Buffer.from(src.data).equals(Buffer.from(copy))).toBe(true);
  });
});

describe('dominant-color downscale', () => {
  it('picks the most frequent color in each block and ignores single-pixel noise', () => {
    const src = createImage(4, 4, [0, 0, 255, 255]);
    setPixel(src, 1, 1, [255, 0, 0, 255]); // center noise that nearest would pick
    const out = downscaleDominant(src, 2, 2);
    expect(getPixel(out, 0, 0)).toEqual([0, 0, 255, 255]);
  });

  it('makes mostly-transparent blocks transparent', () => {
    const src = createImage(4, 4);
    setPixel(src, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(downscaleDominant(src, 2, 2), 0, 0)[3]).toBe(0);
  });
});

describe('cropToSquare', () => {
  it('center-crops non-square images', () => {
    const src = createImage(6, 4);
    setPixel(src, 1, 0, [9, 9, 9, 255]);
    const out = cropToSquare(src);
    expect([out.width, out.height]).toEqual([4, 4]);
    expect(getPixel(out, 0, 0)).toEqual([9, 9, 9, 255]);
  });
});
