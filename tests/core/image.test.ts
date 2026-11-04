import { describe, expect, it } from 'vitest';
import { assertValidImage, cloneImage, createImage, getPixel, imagesEqual, normalizeImage, setPixel, uniqueColors } from '../../src/core/image';
import { SPRITE_SIZES, isSpriteSize } from '../../src/core/sizes';

describe('image model', () => {
  it('creates RGBA buffers with exact dimensions for every supported sprite size', () => {
    for (const size of SPRITE_SIZES) {
      const img = createImage(size, size);
      expect(img.width).toBe(size);
      expect(img.height).toBe(size);
      expect(img.data.length).toBe(size * size * 4);
      expect(img.data.every((v) => v === 0)).toBe(true); // fully transparent by default
    }
  });

  it('only accepts the seven required sizes', () => {
    expect(SPRITE_SIZES).toEqual([8, 16, 32, 64, 128, 256, 512]);
    expect(isSpriteSize(24)).toBe(false);
    expect(isSpriteSize(1024)).toBe(false);
    expect(isSpriteSize(64)).toBe(true);
  });

  it('rejects invalid dimensions and mismatched buffers', () => {
    expect(() => createImage(0, 8)).toThrow();
    expect(() => createImage(8.5, 8)).toThrow();
    expect(() => assertValidImage({ width: 8, height: 8, data: new Uint8ClampedArray(10) })).toThrow(/expected 256/);
    expect(() => assertValidImage({ width: 8, height: 8 })).toThrow();
  });

  it('normalizes Uint8Array from IPC without changing pixels', () => {
    const raw = new Uint8Array(16 * 16 * 4).map((_, i) => i % 256);
    const img = normalizeImage({ width: 16, height: 16, data: raw });
    expect(img.data).toBeInstanceOf(Uint8ClampedArray);
    expect(img.data[5]).toBe(5);
  });

  it('get/set pixel, clone and equality', () => {
    const a = createImage(4, 4);
    setPixel(a, 1, 2, [10, 20, 30, 255]);
    setPixel(a, 99, 99, [1, 1, 1, 1]); // out of bounds ignored
    expect(getPixel(a, 1, 2)).toEqual([10, 20, 30, 255]);
    const b = cloneImage(a);
    expect(imagesEqual(a, b)).toBe(true);
    setPixel(b, 0, 0, [1, 2, 3, 4]);
    expect(imagesEqual(a, b)).toBe(false);
    expect(getPixel(a, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('collapses fully transparent pixels in unique color counts', () => {
    const img = createImage(2, 1);
    img.data.set([255, 0, 0, 0, 0, 255, 0, 0]); // two transparent pixels with different RGB
    expect(uniqueColors(img)).toHaveLength(1);
  });
});
