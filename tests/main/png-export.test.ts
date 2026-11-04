import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { createImage, getPixel, setPixel } from '../../src/core/image';
import { SPRITE_SIZES } from '../../src/core/sizes';
import { decodeBase64Png, decodePng, encodePng, readPngDimensions, sniffImageFormat } from '../../src/main/png';
import { prepareSheetExport, prepareSpriteExport } from '../../src/main/exporter';
import { AppError } from '../../src/shared/errors';

function sprite(size: number) {
  const img = createImage(size, size);
  setPixel(img, 0, 0, [255, 0, 0, 255]);
  setPixel(img, 1, 0, [0, 255, 0, 128]);
  return img;
}

describe('PNG encode/decode', () => {
  it('round-trips RGBA exactly, including partial and zero alpha, for every size', () => {
    for (const size of SPRITE_SIZES) {
      const img = sprite(size);
      const png = encodePng(img);
      expect(sniffImageFormat(png)).toBe('png');
      expect(readPngDimensions(png)).toEqual({ width: size, height: size });
      const back = decodePng(png);
      expect(Buffer.from(back.data).equals(Buffer.from(img.data))).toBe(true);
    }
  });

  it('writes 8-bit RGBA (color type 6) so transparency is preserved', () => {
    const png = encodePng(sprite(8));
    expect(png[24]).toBe(8); // bit depth
    expect(png[25]).toBe(6); // color type RGBA
  });

  it('rejects non-PNG, truncated and oversized data with typed errors', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
    expect(() => decodePng(jpeg)).toThrow(/JPEG/);
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(AppError);
    const good = encodePng(sprite(16));
    expect(() => decodePng(good.subarray(0, good.length - 20))).toThrow(/could not be decoded/);
    const huge = new PNG({ width: 1, height: 1 });
    const buf = PNG.sync.write(huge);
    buf.writeUInt32BE(5000, 16); // forge IHDR width
    expect(() => decodePng(buf)).toThrow(/supported range/);
    expect(() => decodeBase64Png('not base64!!')).toThrow(/base64/);
  });
});

describe('sprite export', () => {
  it('exports the exact native size at scale 1 with transparency', () => {
    for (const size of SPRITE_SIZES) {
      const prep = prepareSpriteExport({ image: sprite(size), scale: 1, suggestedName: 'hero' });
      expect(prep.fileName).toBe('hero.png');
      const decoded = PNG.sync.read(prep.png);
      expect([decoded.width, decoded.height]).toEqual([size, size]);
      expect(decoded.data[7]).toBe(128); // alpha of pixel (1,0)
      expect(decoded.data[size * 4 * 2 + 3]).toBe(0); // transparent pixel stays transparent
    }
  });

  it('enlarged preview uses nearest-neighbor and is labeled in the file name', () => {
    const prep = prepareSpriteExport({ image: sprite(16), scale: 4, suggestedName: 'hero' });
    expect(prep.fileName).toBe('hero@4x.png');
    expect([prep.image.width, prep.image.height]).toEqual([64, 64]);
    expect(getPixel(prep.image, 3, 3)).toEqual([255, 0, 0, 255]);
    expect(getPixel(prep.image, 4, 0)).toEqual([0, 255, 0, 128]);
  });

  it('rejects non-sprite sizes, bad scales, oversize enlargements and broken buffers', () => {
    expect(() => prepareSpriteExport({ image: createImage(24, 24), scale: 1, suggestedName: 'x' })).toThrow(/square/);
    expect(() => prepareSpriteExport({ image: sprite(16), scale: 3, suggestedName: 'x' })).toThrow(/Scale/);
    expect(() => prepareSpriteExport({ image: sprite(512), scale: 32, suggestedName: 'x' })).toThrow(/maximum/);
    expect(() => prepareSpriteExport({ image: { width: 8, height: 8, data: new Uint8ClampedArray(3) }, scale: 1, suggestedName: 'x' })).toThrow();
  });

  it('sanitizes file names', () => {
    expect(prepareSpriteExport({ image: sprite(8), scale: 1, suggestedName: '../../etc/passwd' }).fileName).not.toMatch(/\//);
  });

  it('exports sprite sheets of equal-size variations', () => {
    const prep = prepareSheetExport({ images: [sprite(32), sprite(32), sprite(32)], columns: 2, scale: 1, suggestedName: 'walk' });
    expect(prep.fileName).toBe('walk-sheet.png');
    expect([prep.image.width, prep.image.height]).toEqual([64, 64]);
    expect(() => prepareSheetExport({ images: [sprite(32), sprite(16)], columns: 2, scale: 1, suggestedName: 'x' })).toThrow(/same size/);
  });
});
