import { describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel, uniqueColors } from '../../src/core/image';
import { DEFAULT_CONVERSION, pixelize } from '../../src/core/pixelize';
import { scaleNearestInteger } from '../../src/core/resize';
import { SPRITE_SIZES } from '../../src/core/sizes';
import { proceduralSprite } from '../../src/core/procedural';
import { randomImage } from './helpers';

describe('pixel-art conversion pipeline', () => {
  it('produces exactly the requested native size from 1024px model output for every size', () => {
    const src = randomImage(1024, 1024, 42);
    for (const size of SPRITE_SIZES) {
      const { image } = pixelize(src, { targetSize: size, transparentRequested: true, providerHasNativeTransparency: true }, DEFAULT_CONVERSION);
      expect([image.width, image.height]).toEqual([size, size]);
    }
  });

  it('handles non-square and smaller-than-target output with notes', () => {
    const wide = pixelize(randomImage(300, 200, 1), { targetSize: 64, transparentRequested: false, providerHasNativeTransparency: false }, DEFAULT_CONVERSION);
    expect(wide.image.width).toBe(64);
    expect(wide.notes.join(' ')).toMatch(/center-cropped/);
    const small = pixelize(randomImage(128, 128, 1), { targetSize: 512, transparentRequested: false, providerHasNativeTransparency: false }, DEFAULT_CONVERSION);
    expect(small.image.width).toBe(512);
    expect(small.notes.join(' ')).toMatch(/enlarged with nearest-neighbor/);
  });

  it('recovers a clean pixel sprite from noisy upscaled output', () => {
    const sprite = proceduralSprite({ prompt: 'red slime', negativePrompt: '', seed: 3, grid: 16, transparent: true });
    const big = scaleNearestInteger(sprite, 64);
    for (let i = 0; i < big.data.length; i += 4) if (big.data[i + 3]) big.data[i] = Math.min(255, big.data[i] + ((i / 4) % 5) - 2);
    const { image } = pixelize(big, { targetSize: 16, transparentRequested: true, providerHasNativeTransparency: true }, { ...DEFAULT_CONVERSION, paletteMode: 'off' });
    // alpha mask is preserved exactly
    for (let i = 3; i < image.data.length; i += 4) expect(image.data[i] > 0).toBe(sprite.data[i] > 0);
  });

  it('binarizes alpha (hard edges only)', () => {
    const src = createImage(64, 64, [200, 0, 0, 90]);
    const { image } = pixelize(src, { targetSize: 8, transparentRequested: true, providerHasNativeTransparency: true }, DEFAULT_CONVERSION);
    for (let i = 3; i < image.data.length; i += 4) expect([0, 255]).toContain(image.data[i]);
  });

  it('removes a solid background when transparency is requested but not native', () => {
    const src = createImage(256, 256, [240, 240, 240, 255]);
    for (let y = 96; y < 160; y++) for (let x = 96; x < 160; x++) setPixel(src, x, y, [30, 120, 200, 255]);
    const ctx = { targetSize: 16 as const, transparentRequested: true, providerHasNativeTransparency: false };
    const { image, notes } = pixelize(src, ctx, DEFAULT_CONVERSION);
    expect(getPixel(image, 0, 0)[3]).toBe(0);
    expect(getPixel(image, 8, 8)[3]).toBe(255);
    expect(notes.join(' ')).toMatch(/Background removed/);
    // not removed when the provider produced native transparency
    const native = pixelize(src, { ...ctx, providerHasNativeTransparency: true }, DEFAULT_CONVERSION);
    expect(getPixel(native.image, 0, 0)[3]).toBe(255);
  });

  it('limits colors with a custom palette and supports dominant downscale', () => {
    const src = randomImage(512, 512, 8, false);
    const { image } = pixelize(src, { targetSize: 32, transparentRequested: false, providerHasNativeTransparency: false }, { ...DEFAULT_CONVERSION, paletteMode: 'custom', paletteColors: 6, downscale: 'dominant' });
    expect(uniqueColors(image).length).toBeLessThanOrEqual(6);
  });
});

describe('procedural mock sprite', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = proceduralSprite({ prompt: 'blue knight', negativePrompt: '', seed: 1, grid: 32, transparent: true });
    const b = proceduralSprite({ prompt: 'blue knight', negativePrompt: '', seed: 1, grid: 32, transparent: true });
    const c = proceduralSprite({ prompt: 'blue knight', negativePrompt: '', seed: 2, grid: 32, transparent: true });
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    expect(Buffer.from(a.data).equals(Buffer.from(c.data))).toBe(false);
  });

  it('respects transparency and fills a background otherwise', () => {
    const t = proceduralSprite({ prompt: 'slime', negativePrompt: '', seed: 5, grid: 16, transparent: true });
    const o = proceduralSprite({ prompt: 'slime', negativePrompt: '', seed: 5, grid: 16, transparent: false });
    expect(getPixel(t, 0, 0)[3]).toBe(0);
    expect(getPixel(o, 0, 0)[3]).toBe(255);
  });
});
