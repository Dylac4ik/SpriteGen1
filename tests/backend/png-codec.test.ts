import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { zlibSync } from 'fflate';
import { decodePng, encodePng, decodeBase64Png } from '../../src/backend/png';
import { base64ToBytes, bytesToBase64 } from '../../src/backend/base64';
import { MemorySecretStore } from '../../src/backend/memorySecrets';
import { createImage, getPixel, setPixel } from '../../src/core/image';

// --- minimal PNG writer for layouts pngjs cannot produce (palette, 1-bit, Adam7) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function buildPng(width: number, height: number, depth: number, colorType: number, rawRows: Uint8Array, extra: Uint8Array[] = [], interlace = 0): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([depth, colorType, 0, 0, interlace], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), ...extra, chunk('IDAT', zlibSync(rawRows)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe('PNG codec (fast-png based, platform-neutral)', () => {
  it('matches pngjs for gray, gray+alpha, RGB and RGBA at 8 and 16 bit', () => {
    for (const colorType of [0, 2, 4, 6] as const) {
      for (const bitDepth of [8, 16] as const) {
        const src = new PNG({ width: 5, height: 3, colorType, bitDepth, inputColorType: 6, inputHasAlpha: true });
        for (let i = 0; i < src.data.length; i += 4) src.data.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, i % 8 === 0 ? 0 : 200], i);
        const bytes = new Uint8Array(PNG.sync.write(src, { colorType, bitDepth, inputColorType: 6, inputHasAlpha: true }));
        const expected = PNG.sync.read(Buffer.from(bytes)); // pngjs' own reading → 8-bit RGBA
        const ours = decodePng(bytes);
        expect([ours.width, ours.height]).toEqual([5, 3]);
        expect(Array.from(ours.data), `colorType ${colorType} depth ${bitDepth}`).toEqual(Array.from(expected.data));
      }
    }
  });

  it('decodes palette images with tRNS transparency', () => {
    // 2x1: index 0 = opaque red, index 1 = fully transparent blue
    const plte = chunk('PLTE', new Uint8Array([255, 0, 0, 0, 0, 255]));
    const trns = chunk('tRNS', new Uint8Array([255, 0]));
    const img = decodePng(buildPng(2, 1, 8, 3, new Uint8Array([0, 0, 1]), [plte, trns]));
    expect(getPixel(img, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(img, 1, 0)[3]).toBe(0);
  });

  it('unpacks 1-bit grayscale rows', () => {
    // 10px wide → 2 bytes per row; pattern 1010101010
    const img = decodePng(buildPng(10, 1, 1, 0, new Uint8Array([0, 0b10101010, 0b10000000])));
    expect(Array.from({ length: 10 }, (_, x) => getPixel(img, x, 0)[0])).toEqual([255, 0, 255, 0, 255, 0, 255, 0, 255, 0]);
  });

  it('decodes Adam7-interlaced images', () => {
    // 1x1 interlaced image is a single pass containing one pixel.
    const img = decodePng(buildPng(1, 1, 8, 6, new Uint8Array([0, 10, 20, 30, 40]), [], 1));
    expect(getPixel(img, 0, 0)).toEqual([10, 20, 30, 40]);
  });

  it('round-trips RGBA exactly and writes color type 6, readable by pngjs', () => {
    const img = createImage(16, 16);
    setPixel(img, 3, 4, [1, 2, 3, 4]);
    setPixel(img, 15, 15, [255, 128, 0, 255]);
    const bytes = encodePng(img);
    expect(bytes[25]).toBe(6);
    expect(Buffer.from(decodePng(bytes).data).equals(Buffer.from(img.data))).toBe(true);
    expect(Buffer.from(PNG.sync.read(Buffer.from(bytes)).data).equals(Buffer.from(img.data))).toBe(true);
  });

  it('rejects corrupted data (CRC mismatch, truncation)', () => {
    const bytes = encodePng(createImage(8, 8, [9, 9, 9, 255]));
    const bad = new Uint8Array(bytes);
    bad[bad.length - 20] ^= 0xff;
    expect(() => decodePng(bad)).toThrow(/could not be decoded/);
    expect(() => decodePng(bytes.subarray(0, 30))).toThrow();
  });

  it('base64 helpers round-trip large buffers', () => {
    const data = new Uint8Array(200_000).map((_, i) => (i * 31) % 256);
    expect(Buffer.from(base64ToBytes(bytesToBase64(data))).equals(Buffer.from(data))).toBe(true);
    expect(bytesToBase64(data)).toBe(Buffer.from(data).toString('base64'));
    const img = createImage(8, 8, [5, 6, 7, 255]);
    expect(getPixel(decodeBase64Png(`data:image/png;base64,${bytesToBase64(encodePng(img))}`), 2, 2)).toEqual([5, 6, 7, 255]);
  });
});

describe('MemorySecretStore', () => {
  it('keeps keys for the session only and refuses persistence', async () => {
    const s = new MemorySecretStore({ OPENAI_API_KEY: 'env-key' });
    expect(s.canPersistSecurely()).toBe(false);
    await expect(s.set('k', 'v', true)).rejects.toMatchObject({ code: 'secure_storage_unavailable' });
    expect(await s.set('k', ' v ', false)).toBe('session');
    expect(await s.get('k')).toEqual({ value: 'v', source: 'session' });
    expect(await s.get('x', 'OPENAI_API_KEY')).toEqual({ value: 'env-key', source: 'env' });
    await s.delete('k');
    expect(await s.get('k')).toBeNull();
  });
});
