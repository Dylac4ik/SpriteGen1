import { RgbaImage, normalizeImage } from '@core/image';
import { scaleNearestInteger } from '@core/resize';
import { composeSpriteSheet } from '@core/spritesheet';
import { MAX_EXPORT_DIMENSION } from '@core/sizes';
import { AppError } from '@shared/errors';
import type { ExportPngRequest, ExportSheetRequest, WireImage } from '@shared/types';
import { exportPngRequestSchema, exportSheetRequestSchema, formatZodError } from '@shared/schemas';
import { encodePng } from './png';

export interface PreparedExport {
  image: RgbaImage;
  png: Uint8Array;
  fileName: string;
}

function checkScaled(width: number, height: number): void {
  if (width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION) {
    throw new AppError('invalid_input', `Enlarged export would be ${width}×${height}; the maximum is ${MAX_EXPORT_DIMENSION}px per side.`, {
      hint: 'Choose a smaller enlargement factor.',
    });
  }
}

/**
 * Validates and encodes a single sprite. scale === 1 writes the exact native pixels;
 * larger scales are nearest-neighbor enlargements and get an "@Nx" file-name suffix.
 */
export function prepareSpriteExport(req: ExportPngRequest): PreparedExport {
  const parsed = exportPngRequestSchema.safeParse(req);
  if (!parsed.success) throw new AppError('invalid_input', `Cannot export: ${formatZodError(parsed.error)}`);
  const { scale, suggestedName } = parsed.data;
  const native = normalizeImage(parsed.data.image as WireImage);
  checkScaled(native.width * scale, native.height * scale);
  const image = scale === 1 ? native : scaleNearestInteger(native, scale);
  const base = suggestedName.replace(/\.png$/i, '');
  return { image, png: encodePng(image), fileName: scale === 1 ? `${base}.png` : `${base}@${scale}x.png` };
}

export function prepareSheetExport(req: ExportSheetRequest): PreparedExport {
  const parsed = exportSheetRequestSchema.safeParse(req);
  if (!parsed.success) throw new AppError('invalid_input', `Cannot export sprite sheet: ${formatZodError(parsed.error)}`);
  const images = parsed.data.images.map((i) => normalizeImage(i as WireImage));
  const size = images[0].width;
  if (images.some((i) => i.width !== size)) throw new AppError('invalid_input', 'All sprites in a sheet must have the same size.');
  const sheet = composeSpriteSheet(images, parsed.data.columns);
  const { scale } = parsed.data;
  checkScaled(sheet.width * scale, sheet.height * scale);
  const image = scale === 1 ? sheet : scaleNearestInteger(sheet, scale);
  const base = parsed.data.suggestedName.replace(/\.png$/i, '');
  return { image, png: encodePng(image), fileName: scale === 1 ? `${base}-sheet.png` : `${base}-sheet@${scale}x.png` };
}
