import { describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel } from '../../src/core/image';
import { composeSpriteSheet, spriteSheetLayout } from '../../src/core/spritesheet';
import { drawLine, floodFill, linePoints } from '../../src/core/editing';
import { sanitizeParams } from '../../src/core/params';
import { isValidSeed, MAX_SEED, mulberry32, variationSeed } from '../../src/core/random';

describe('sprite sheet', () => {
  it('packs sprites 1:1 into a grid with transparent empty cells', () => {
    const imgs = [0, 1, 2].map((i) => createImage(16, 16, [i * 50, 0, 0, 255]));
    const sheet = composeSpriteSheet(imgs, 2);
    expect([sheet.width, sheet.height]).toEqual([32, 32]);
    expect(getPixel(sheet, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(getPixel(sheet, 16, 0)).toEqual([50, 0, 0, 255]);
    expect(getPixel(sheet, 0, 16)).toEqual([100, 0, 0, 255]);
    expect(getPixel(sheet, 20, 20)[3]).toBe(0);
  });
  it('rejects mixed sizes and computes layouts', () => {
    expect(() => composeSpriteSheet([createImage(8, 8), createImage(16, 16)], 2)).toThrow();
    expect(spriteSheetLayout(5, 32, 32, 4)).toMatchObject({ columns: 4, rows: 2, width: 128, height: 64 });
  });
});

describe('editing tools', () => {
  it('draws continuous hard-edged lines', () => {
    expect(linePoints(0, 0, 3, 1)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    const img = createImage(4, 4);
    drawLine(img, 0, 0, 3, 3, [1, 2, 3, 255]);
    expect(getPixel(img, 2, 2)).toEqual([1, 2, 3, 255]);
  });
  it('flood fill fills a contiguous region only and treats all transparent pixels as one color', () => {
    const img = createImage(4, 1);
    setPixel(img, 2, 0, [9, 9, 9, 255]);
    img.data.set([5, 5, 5, 0], 4); // transparent with different RGB
    const out = floodFill(img, 0, 0, [255, 0, 0, 255]);
    expect(getPixel(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(out, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(out, 3, 0)[3]).toBe(0);
    expect(getPixel(img, 0, 0)[3]).toBe(0); // input untouched
  });
  it('can fill with transparency', () => {
    const img = createImage(2, 2, [10, 10, 10, 255]);
    const out = floodFill(img, 0, 0, [0, 0, 0, 0]);
    expect(getPixel(out, 1, 1)[3]).toBe(0);
  });
});

describe('params and seeds', () => {
  it('sanitizes values against specs', () => {
    const specs = [
      { kind: 'range' as const, key: 'n', label: 'n', min: 0, max: 10, step: 2, default: 4 },
      { kind: 'select' as const, key: 's', label: 's', options: [{ value: 'a', label: 'A' }], default: 'a' },
      { kind: 'color' as const, key: 'c', label: 'c', default: '#000000' },
    ];
    expect(sanitizeParams(specs, { n: 7, s: 'zzz', c: 'red', extra: 1 })).toEqual({ n: 8, s: 'a', c: '#000000' });
    expect(sanitizeParams(specs, { n: -5, c: '#ABCDEF' })).toEqual({ n: 0, s: 'a', c: '#abcdef' });
  });
  it('seeds are deterministic, validated and wrap for variations', () => {
    expect(mulberry32(5)()).toBe(mulberry32(5)());
    expect(isValidSeed(MAX_SEED)).toBe(true);
    expect(isValidSeed(MAX_SEED + 1)).toBe(false);
    expect(isValidSeed(-1)).toBe(false);
    expect(variationSeed(MAX_SEED, 1)).toBe(0);
  });
});
