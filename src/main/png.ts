import { PNG } from 'pngjs';
import { RgbaImage, assertValidImage } from '@core/image';
import { MAX_DECODE_DIMENSION } from '@core/sizes';
import { AppError } from '@shared/errors';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';

export function sniffImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP')
    return 'webp';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.subarray(0, 3)) === 'GIF') return 'gif';
  return 'unknown';
}

/** Reads width/height from the IHDR chunk without decoding pixel data. */
export function readPngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (sniffImageFormat(bytes) !== 'png' || bytes.length < 24) throw new AppError('unsupported_output', 'Data is not a PNG image.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
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
  let png: PNG;
  try {
    png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch (e) {
    throw new AppError('invalid_response', `${label} could not be decoded: ${(e as Error).message}`, { hint: 'The PNG data is corrupted or truncated.' });
  }
  const img: RgbaImage = {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
  assertValidImage(img, label);
  return img;
}

/** Encodes RGBA to an 8-bit RGBA PNG (alpha always preserved). */
export function encodePng(img: RgbaImage): Buffer {
  assertValidImage(img);
  const png = new PNG({ width: img.width, height: img.height, colorType: 6, inputColorType: 6, bitDepth: 8 });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png, { colorType: 6, inputColorType: 6, bitDepth: 8 });
}

export function decodeBase64Png(b64: string, label?: string): RgbaImage {
  const cleaned = b64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) throw new AppError('invalid_response', `${label ?? 'Image'} is not valid base64 data.`);
  return decodePng(new Uint8Array(Buffer.from(cleaned, 'base64')), label);
}
