import { MAX_DECODE_DIMENSION } from './sizes';

/**
 * Plain RGBA image: 8 bits per channel, non-premultiplied alpha, row-major.
 * Shared by the main process and the renderer (structured-clone friendly).
 */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageValidationError';
  }
}

export function createImage(width: number, height: number, fill?: [number, number, number, number]): RgbaImage {
  assertDimensions(width, height);
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { width, height, data };
}

export function assertDimensions(width: number, height: number, max = MAX_DECODE_DIMENSION * 4): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new ImageValidationError(`Invalid image dimensions ${width}x${height}`);
  }
  if (width > max || height > max) {
    throw new ImageValidationError(`Image dimensions ${width}x${height} exceed the ${max}px limit`);
  }
}

/** Throws if the object is not a well-formed RgbaImage. */
export function assertValidImage(img: unknown, label = 'image'): asserts img is RgbaImage {
  if (!img || typeof img !== 'object') throw new ImageValidationError(`${label} is missing`);
  const { width, height } = img as Partial<RgbaImage>;
  const data: unknown = (img as { data?: unknown }).data;
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new ImageValidationError(`${label} has no dimensions`);
  }
  assertDimensions(width, height);
  if (!(data instanceof Uint8ClampedArray) && !(data instanceof Uint8Array)) {
    throw new ImageValidationError(`${label} has no pixel buffer`);
  }
  if ((data as Uint8Array).length !== width * height * 4) {
    throw new ImageValidationError(
      `${label} pixel buffer has ${(data as Uint8Array).length} bytes, expected ${width * height * 4} for ${width}x${height} RGBA`,
    );
  }
}

/** Normalizes Uint8Array (e.g. after IPC) to Uint8ClampedArray without copying when possible. */
export function normalizeImage(img: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }): RgbaImage {
  const data =
    img.data instanceof Uint8ClampedArray
      ? img.data
      : new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  const out = { width: img.width, height: img.height, data };
  assertValidImage(out);
  return out;
}

export function cloneImage(img: RgbaImage): RgbaImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

export function pixelIndex(img: RgbaImage, x: number, y: number): number {
  return (y * img.width + x) * 4;
}

export function getPixel(img: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = pixelIndex(img, x, y);
  const d = img.data;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
}

export function setPixel(img: RgbaImage, x: number, y: number, rgba: readonly [number, number, number, number]): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = pixelIndex(img, x, y);
  img.data[i] = rgba[0];
  img.data[i + 1] = rgba[1];
  img.data[i + 2] = rgba[2];
  img.data[i + 3] = rgba[3];
}

export function imagesEqual(a: RgbaImage, b: RgbaImage): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  const da = a.data;
  const db = b.data;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
  return true;
}

/** Packs an RGBA quadruple into an unsigned 32-bit key. */
export function packRgba(r: number, g: number, b: number, a: number): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export function unpackRgba(key: number): [number, number, number, number] {
  return [(key >>> 24) & 255, (key >>> 16) & 255, (key >>> 8) & 255, key & 255];
}

/**
 * Unique colors in the image. Fully transparent pixels are collapsed into a single
 * "transparent" entry (0,0,0,0) because their RGB is invisible.
 */
export function uniqueColors(img: RgbaImage, limit = Number.POSITIVE_INFINITY): number[] {
  const seen = new Set<number>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const key = d[i + 3] === 0 ? 0 : packRgba(d[i], d[i + 1], d[i + 2], d[i + 3]);
    if (!seen.has(key)) {
      seen.add(key);
      if (seen.size > limit) break;
    }
  }
  return [...seen];
}

export function countOpaque(img: RgbaImage): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++;
  return n;
}

export function hasTransparency(img: RgbaImage): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 255) return true;
  return false;
}
