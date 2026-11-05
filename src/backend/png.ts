import { decode, encode, convertIndexedToRgb } from 'fast-png';
import { RgbaImage, assertValidImage } from '@core/image';
import { MAX_DECODE_DIMENSION } from '@core/sizes';
import { AppError } from '@shared/errors';
import { base64ToBytes, isBase64 } from './base64';

/*
 * PNG codec shared by the desktop main process and the mobile app. It is pure JavaScript
 * (fast-png + fflate), so it runs identically in Node/Electron and in a phone's WebView,
 * and it works on exact 8-bit RGBA values (no canvas premultiplication round-trips).
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

export function sniffImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === 'GIF') return 'gif';
  return 'unknown';
}

/** Reads width/height from the IHDR chunk without decoding pixel data. */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (sniffImageFormat(bytes) !== 'png' || bytes.length < 24) throw new AppError('unsupported_output', 'Data is not a PNG image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Converts any decoded PNG layout (gray, gray+alpha, RGB, RGBA, palette; 1–16 bit) to 8-bit RGBA. */
function toRgba8(png: ReturnType<typeof decode>): Uint8ClampedArray {
  const { width, height } = png;
  const n = width * height;
  const out = new Uint8ClampedArray(n * 4);
  if (png.palette) {
    const rgb = convertIndexedToRgb(png);
    const ch = rgb.length / n; // 3 (RGB) or 4 (RGBA when tRNS is present)
    for (let p = 0; p < n; p++) {
      out[p * 4] = rgb[p * ch];
      out[p * 4 + 1] = rgb[p * ch + 1];
      out[p * 4 + 2] = rgb[p * ch + 2];
      out[p * 4 + 3] = ch === 4 ? rgb[p * ch + 3] : 255;
    }
    return out;
  }
  const { channels, depth, data } = png;
  const max = (1 << depth) - 1;
  const to8 = depth === 8 ? (v: number) => v : depth === 16 ? (v: number) => Math.round(v / 257) : (v: number) => Math.round((v / max) * 255);
  // Sub-byte grayscale (1/2/4-bit) arrives packed per row; unpack it.
  let samples: ArrayLike<number> = data;
  if (depth < 8) {
    const unpacked = new Uint8Array(n * channels);
    const rowBytes = Math.ceil((width * channels * depth) / 8);
    for (let y = 0; y < height; y++) {
      for (let i = 0; i < width * channels; i++) {
        const bit = i * depth;
        const byte = data[y * rowBytes + (bit >> 3)];
        unpacked[y * width * channels + i] = (byte >> (8 - depth - (bit & 7))) & max;
      }
    }
    samples = unpacked;
  }
  const trns = png.transparency;
  for (let p = 0; p < n; p++) {
    const s = p * channels;
    let r: number, g: number, b: number, a: number;
    if (channels === 1 || channels === 2) {
      r = g = b = samples[s];
      a = channels === 2 ? samples[s + 1] : trns && trns[0] === samples[s] ? 0 : max;
    } else {
      r = samples[s];
      g = samples[s + 1];
      b = samples[s + 2];
      a = channels === 4 ? samples[s + 3] : trns && trns[0] === r && trns[1] === g && trns[2] === b ? 0 : max;
    }
    out[p * 4] = to8(r);
    out[p * 4 + 1] = to8(g);
    out[p * 4 + 2] = to8(b);
    out[p * 4 + 3] = to8(a);
  }
  return out;
}

/**
 * Decodes and validates a PNG (any bit depth / color type) into 8-bit RGBA.
 * Rejects non-PNG data, oversized images and corrupt streams with actionable errors.
 */
export function decodePng(bytes: Uint8Array, label = 'Image'): RgbaImage {
  const format = sniffImageFormat(bytes);
  if (format !== 'png') {
    throw new AppError('unsupported_output', `${label} is ${format === 'unknown' ? 'not a recognized image' : `a ${format.toUpperCase()} image`}; SpriteGen requires PNG.`, {
      hint: format === 'unknown' ? 'The data may be corrupted or truncated.' : 'Configure the provider to return PNG output.',
    });
  }
  const { width, height } = readPngDimensions(bytes);
  if (width < 1 || height < 1 || width > MAX_DECODE_DIMENSION || height > MAX_DECODE_DIMENSION) {
    throw new AppError('unsupported_output', `${label} is ${width}×${height}; supported range is 1–${MAX_DECODE_DIMENSION}px per side.`);
  }
  let img: RgbaImage;
  try {
    const png = decode(bytes, { checkCrc: true });
    img = { width: png.width, height: png.height, data: toRgba8(png) };
  } catch (e) {
    throw new AppError('invalid_response', `${label} could not be decoded: ${(e as Error).message}`, { hint: 'The PNG data is corrupted or truncated.' });
  }
  try {
    assertValidImage(img, label);
  } catch (e) {
    throw new AppError('invalid_response', `${label} could not be decoded: ${(e as Error).message}`);
  }
  return img;
}

/** Encodes RGBA to an 8-bit RGBA PNG (color type 6; alpha always preserved). */
export function encodePng(img: RgbaImage): Uint8Array {
  assertValidImage(img);
  const data = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return encode({ width: img.width, height: img.height, data, channels: 4, depth: 8 });
}

export function decodeBase64Png(b64: string, label?: string): RgbaImage {
  const cleaned = b64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s+/g, '');
  if (!isBase64(cleaned)) throw new AppError('invalid_response', `${label ?? 'Image'} is not valid base64 data.`);
  return decodePng(base64ToBytes(cleaned), label);
}
