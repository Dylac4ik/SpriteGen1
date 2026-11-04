import { describe, expect, it } from 'vitest';
import { createImage, getPixel, setPixel, uniqueColors } from '../../src/core/image';
import { FILTERS, FILTER_TYPES, createFilterStep, sanitizeFilterStep } from '../../src/core/filters';
import { alphaThreshold, brightness, contrast, gamma, hueShift, posterize, saturation, sharpen } from '../../src/core/filters/adjust';
import { outline } from '../../src/core/filters/structure';
import { removeBackground } from '../../src/core/filters/background';
import { CachedPipeline, applyPipeline } from '../../src/core/pipeline';
import { DITHER_ALGORITHMS, ditherToPalette } from '../../src/core/dither';
import { buildPalette, mapToPalette, medianCutPalette } from '../../src/core/quantize';
import { randomImage } from './helpers';

const solid = (rgba: [number, number, number, number], w = 4, h = 4) => createImage(w, h, rgba);

describe('color adjustment filters', () => {
  it('are identity at neutral values', () => {
    const img = randomImage(16, 16, 3);
    for (const out of [brightness(img, 0), contrast(img, 0), saturation(img, 0), hueShift(img, 0), gamma(img, 1)]) {
      expect(Buffer.from(out.data).equals(Buffer.from(img.data))).toBe(true);
    }
  });

  it('brightness raises and lowers values with clamping', () => {
    expect(getPixel(brightness(solid([100, 100, 100, 255]), 20), 0, 0)).toEqual([151, 151, 151, 255]);
    expect(getPixel(brightness(solid([250, 10, 0, 255]), 100), 0, 0)).toEqual([255, 255, 255, 255]);
    expect(getPixel(brightness(solid([5, 5, 5, 255]), -100), 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('contrast pushes values away from mid-gray', () => {
    const [r] = getPixel(contrast(solid([200, 200, 200, 255]), 50), 0, 0);
    const [r2] = getPixel(contrast(solid([60, 60, 60, 255]), 50), 0, 0);
    expect(r).toBeGreaterThan(200);
    expect(r2).toBeLessThan(60);
  });

  it('saturation -100 yields grayscale', () => {
    const [r, g, b] = getPixel(saturation(solid([200, 40, 90, 255]), -100), 0, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('hue shift of 120° maps red to green', () => {
    expect(getPixel(hueShift(solid([255, 0, 0, 255]), 120), 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('gamma > 1 brightens midtones but keeps black and white', () => {
    const out = gamma(solid([128, 0, 255, 255]), 2);
    const [r, g, b] = getPixel(out, 0, 0);
    expect(r).toBeGreaterThan(128);
    expect(g).toBe(0);
    expect(b).toBe(255);
  });

  it('never change transparent pixels or alpha', () => {
    const img = createImage(2, 1);
    setPixel(img, 0, 0, [10, 20, 30, 0]);
    setPixel(img, 1, 0, [10, 20, 30, 128]);
    for (const out of [brightness(img, 50), contrast(img, 50), saturation(img, 50), hueShift(img, 90), gamma(img, 2), posterize(img, 2), sharpen(img, 2)]) {
      expect(getPixel(out, 0, 0)).toEqual([10, 20, 30, 0]);
      expect(getPixel(out, 1, 0)[3]).toBe(128);
    }
  });
});

describe('sharpen', () => {
  it('increases contrast at edges and leaves flat areas unchanged', () => {
    const img = createImage(3, 1, [100, 100, 100, 255]);
    setPixel(img, 1, 0, [150, 150, 150, 255]);
    const out = sharpen(img, 1);
    expect(getPixel(out, 1, 0)[0]).toBeGreaterThan(150);
    const flat = sharpen(solid([80, 80, 80, 255]), 2);
    expect(getPixel(flat, 1, 1)).toEqual([80, 80, 80, 255]);
  });
});

describe('posterize and palette reduction', () => {
  it('posterize limits each channel to N levels', () => {
    const out = posterize(randomImage(32, 32, 9, false), 3);
    const levels = new Set<number>();
    for (let i = 0; i < out.data.length; i += 4) levels.add(out.data[i]);
    expect([...levels].sort((a, b) => a - b)).toEqual([0, 128, 255]);
  });

  it('palette reduction yields at most N colors', () => {
    const img = randomImage(64, 64, 11);
    for (const n of [2, 4, 8, 16, 32]) {
      for (const method of ['median-cut', 'k-means'] as const) {
        const out = mapToPalette(img, buildPalette(img, n, method));
        expect(uniqueColors(out).filter((c) => c !== 0).length).toBeLessThanOrEqual(n);
      }
    }
  });

  it('median cut keeps exact colors when the image already fits the palette', () => {
    const img = createImage(2, 1);
    setPixel(img, 0, 0, [12, 34, 56, 255]);
    setPixel(img, 1, 0, [200, 100, 50, 255]);
    const pal = medianCutPalette(img, 8);
    expect(pal).toHaveLength(2);
    expect(pal).toContainEqual([12, 34, 56]);
  });

  it('every dithering algorithm outputs only palette colors and preserves transparency', () => {
    const img = randomImage(24, 24, 5);
    const palette: [number, number, number][] = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
    ];
    const allowed = new Set(palette.map(([r, g, b]) => `${r},${g},${b}`));
    for (const algo of DITHER_ALGORITHMS) {
      const out = ditherToPalette(img, palette, algo);
      for (let i = 0; i < out.data.length; i += 4) {
        expect(out.data[i + 3]).toBe(img.data[i + 3]);
        if (out.data[i + 3] === 0) continue;
        expect(allowed.has(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`)).toBe(true);
      }
    }
  });

  it('error diffusion produces a mix of colors for a mid-gray field', () => {
    const out = ditherToPalette(solid([128, 128, 128, 255], 16, 16), [
      [0, 0, 0],
      [255, 255, 255],
    ], 'floyd-steinberg');
    const colors = uniqueColors(out);
    expect(colors.length).toBe(2);
  });
});

describe('outline', () => {
  const sprite = () => {
    const img = createImage(5, 5);
    setPixel(img, 2, 2, [200, 50, 50, 255]);
    return img;
  };

  it('outer 4-connected outline adds exactly the orthogonal neighbors', () => {
    const out = outline(sprite(), { mode: 'outer', color: [0, 0, 0, 255], colorMode: 'custom', darkenAmount: 0.5, connectivity: 4, thickness: 1 });
    const filled: string[] = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (getPixel(out, x, y)[3]) filled.push(`${x},${y}`);
    expect(filled.sort()).toEqual(['1,2', '2,1', '2,2', '2,3', '3,2'].sort());
    expect(getPixel(out, 2, 1)).toEqual([0, 0, 0, 255]);
    expect(getPixel(out, 2, 2)).toEqual([200, 50, 50, 255]);
  });

  it('outer 8-connected outline also adds corners; thickness grows it', () => {
    const o8 = outline(sprite(), { mode: 'outer', color: [0, 0, 0, 255], colorMode: 'custom', darkenAmount: 0, connectivity: 8, thickness: 1 });
    expect(getPixel(o8, 1, 1)[3]).toBe(255);
    const thick = outline(sprite(), { mode: 'outer', color: [0, 0, 0, 255], colorMode: 'custom', darkenAmount: 0, connectivity: 4, thickness: 2 });
    expect(getPixel(thick, 2, 0)[3]).toBe(255);
  });

  it('inner outline recolors edge pixels without growing the sprite', () => {
    const img = createImage(4, 4, [0, 0, 0, 0]);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) setPixel(img, x, y, [100, 100, 100, 255]);
    const out = outline(img, { mode: 'inner', color: [255, 0, 0, 255], colorMode: 'custom', darkenAmount: 0, connectivity: 4, thickness: 1 });
    expect(getPixel(out, 3, 3)[3]).toBe(0);
    expect(getPixel(out, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(getPixel(out, 1, 1)).toEqual([100, 100, 100, 255]);
  });

  it('darken mode derives the outline from the neighbor color', () => {
    const out = outline(sprite(), { mode: 'outer', color: [0, 0, 0, 255], colorMode: 'darken', darkenAmount: 0.5, connectivity: 4, thickness: 1 });
    expect(getPixel(out, 2, 1)).toEqual([100, 25, 25, 255]);
  });
});

describe('background removal and alpha cleanup', () => {
  it('auto mode removes the border color contiguously but keeps enclosed regions', () => {
    // white border, red ring, white hole inside the ring
    const img = createImage(7, 7, [255, 255, 255, 255]);
    for (let i = 1; i < 6; i++) {
      setPixel(img, i, 1, [255, 0, 0, 255]);
      setPixel(img, i, 5, [255, 0, 0, 255]);
      setPixel(img, 1, i, [255, 0, 0, 255]);
      setPixel(img, 5, i, [255, 0, 0, 255]);
    }
    const out = removeBackground(img, { mode: 'auto-edges', tolerance: 10, contiguous: true });
    expect(getPixel(out, 0, 0)[3]).toBe(0);
    expect(getPixel(out, 1, 1)[3]).toBe(255);
    expect(getPixel(out, 3, 3)[3]).toBe(255); // enclosed white survives
  });

  it('color mode (non-contiguous) removes every matching pixel within tolerance', () => {
    const img = createImage(3, 1, [0, 255, 0, 255]);
    setPixel(img, 1, 0, [250, 250, 250, 255]);
    const out = removeBackground(img, { mode: 'color', color: [0, 250, 0, 255], tolerance: 8, contiguous: false });
    expect(getPixel(out, 0, 0)[3]).toBe(0);
    expect(getPixel(out, 2, 0)[3]).toBe(0);
    expect(getPixel(out, 1, 0)[3]).toBe(255);
  });

  it('alpha threshold binarizes alpha', () => {
    const img = createImage(3, 1);
    img.data.set([10, 10, 10, 127, 20, 20, 20, 128, 30, 30, 30, 255]);
    const out = alphaThreshold(img, 128);
    expect([out.data[3], out.data[7], out.data[11]]).toEqual([0, 255, 255]);
    expect(out.data[0]).toBe(0);
  });
});

describe('filter registry and pipeline', () => {
  it('every filter type has a definition with valid defaults and runs on every size', () => {
    for (const type of FILTER_TYPES) {
      const step = createFilterStep(type);
      expect(step.type).toBe(type);
      const out = FILTERS[type].apply(randomImage(8, 8, 4), step.params);
      expect([out.width, out.height]).toEqual([8, 8]);
    }
  });

  it('applies steps in order and order matters', () => {
    const img = solid([100, 100, 100, 255]);
    const a = createFilterStep('brightness', { amount: 50 });
    const b = createFilterStep('posterize', { levels: 2 });
    const ab = getPixel(applyPipeline(img, [a, b]), 0, 0)[0];
    const ba = getPixel(applyPipeline(img, [b, a]), 0, 0)[0];
    expect(ab).toBe(255);
    expect(ba).toBe(128);
  });

  it('skips disabled steps and never mutates the input', () => {
    const img = randomImage(8, 8, 1);
    const copy = new Uint8ClampedArray(img.data);
    const out = applyPipeline(img, [{ ...createFilterStep('brightness', { amount: 90 }), enabled: false }]);
    expect(Buffer.from(out.data).equals(Buffer.from(copy))).toBe(true);
    applyPipeline(img, [createFilterStep('brightness', { amount: 90 }), createFilterStep('outline')]);
    expect(Buffer.from(img.data).equals(Buffer.from(copy))).toBe(true);
  });

  it('cached pipeline reuses unchanged prefix results', () => {
    const img = randomImage(16, 16, 2);
    const p = new CachedPipeline();
    const s1 = createFilterStep('paletteReduce', { colors: 4 });
    const s2 = createFilterStep('brightness', { amount: 10 });
    const first = p.run(img, [s1, s2]);
    const s2b = { ...s2, params: { amount: 20 } };
    const second = p.run(img, [s1, s2b]);
    expect(Buffer.from(second.data).equals(Buffer.from(applyPipeline(img, [s1, s2b]).data))).toBe(true);
    expect(first).not.toBe(second);
  });

  it('sanitizes untrusted steps (clamps params, rejects unknown types)', () => {
    expect(sanitizeFilterStep({ type: 'evil', params: {} })).toBeNull();
    const s = sanitizeFilterStep({ id: 'x', type: 'paletteReduce', enabled: true, params: { colors: 9999, method: 'bogus' } })!;
    expect(s.params.colors).toBe(64);
    expect(s.params.method).toBe('median-cut');
  });
});
