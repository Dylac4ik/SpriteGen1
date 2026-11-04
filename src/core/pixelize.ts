import { RgbaImage } from './image';
import { SpriteSize, suggestedPaletteSize } from './sizes';
import { cropToSquare, downscaleDominant, resizeNearest } from './resize';
import { buildPalette, mapToPalette } from './quantize';
import { removeBackground } from './filters/background';
import { alphaThreshold } from './filters/adjust';

/**
 * Settings for converting model output (typically 512-1024px) into a native pixel-art
 * sprite. Every step is deterministic, hard-edged and documented in docs/PIXEL_PIPELINE.md.
 */
export interface ConversionSettings {
  /** 'auto' picks a palette size from the target size; 'off' keeps all model colors. */
  paletteMode: 'auto' | 'custom' | 'off';
  paletteColors: number; // used when paletteMode === 'custom' (2-64)
  /** 'nearest' samples each block's center pixel; 'dominant' takes each block's most frequent color. */
  downscale: 'nearest' | 'dominant';
  /** Pixels with alpha below this become fully transparent; others fully opaque. */
  alphaThreshold: number;
  /** Background removal at working resolution. 'auto' enables it only when transparency was requested but the provider cannot produce it natively. */
  backgroundRemoval: 'auto' | 'on' | 'off';
  backgroundTolerance: number;
}

export const DEFAULT_CONVERSION: ConversionSettings = {
  paletteMode: 'auto',
  paletteColors: 16,
  downscale: 'nearest',
  alphaThreshold: 128,
  backgroundRemoval: 'auto',
  backgroundTolerance: 24,
};

/** Working palette used before downscaling. Deliberately larger than the "readable" suggestion so detail survives. */
export function autoWorkingPaletteSize(size: SpriteSize): number {
  return Math.min(64, suggestedPaletteSize(size) * 2);
}

export interface PixelizeContext {
  targetSize: SpriteSize;
  transparentRequested: boolean;
  providerHasNativeTransparency: boolean;
}

export interface PixelizeResult {
  image: RgbaImage;
  notes: string[];
}

/**
 * Model output -> native sprite:
 *  1. center-crop to square
 *  2. optional background removal (flood from edges)
 *  3. palette quantization at working resolution (flattens noise/gradients so sampling is stable)
 *  4. downscale to target with nearest-neighbor (or dominant-color) sampling — never interpolation
 *  5. alpha binarization (hard edges)
 */
export function pixelize(src: RgbaImage, ctx: PixelizeContext, settings: ConversionSettings): PixelizeResult {
  const notes: string[] = [];
  const size = ctx.targetSize;
  let img = src;

  if (img.width !== img.height) {
    notes.push(`Model output ${img.width}×${img.height} was center-cropped to a square.`);
    img = cropToSquare(img);
  }

  const removeBg =
    settings.backgroundRemoval === 'on' ||
    (settings.backgroundRemoval === 'auto' && ctx.transparentRequested && !ctx.providerHasNativeTransparency);
  if (removeBg) {
    img = removeBackground(img, { mode: 'auto-edges', tolerance: settings.backgroundTolerance, contiguous: true });
    notes.push(`Background removed by flood-fill from the edges (tolerance ${settings.backgroundTolerance}).`);
  }

  if (settings.paletteMode !== 'off') {
    const colors = settings.paletteMode === 'auto' ? autoWorkingPaletteSize(size) : Math.max(2, Math.min(64, Math.round(settings.paletteColors)));
    img = mapToPalette(img, buildPalette(img, colors, 'median-cut'));
    notes.push(`Quantized to at most ${colors} colors (median cut) at ${img.width}×${img.height} before downscaling.`);
  }

  if (img.width > size) {
    img = settings.downscale === 'dominant' ? downscaleDominant(img, size, size) : resizeNearest(img, size, size);
    notes.push(
      `Downscaled ${src.width === src.height ? src.width : Math.min(src.width, src.height)}px → ${size}px using ${
        settings.downscale === 'dominant' ? 'dominant-color block sampling' : 'nearest-neighbor (block-center) sampling'
      }.`,
    );
  } else if (img.width < size) {
    notes.push(`Model output (${img.width}px) was smaller than ${size}px and was enlarged with nearest-neighbor scaling; no detail was added.`);
    img = resizeNearest(img, size, size);
  }

  img = alphaThreshold(img, settings.alphaThreshold);
  notes.push(`Alpha binarized at threshold ${settings.alphaThreshold} (every pixel fully opaque or fully transparent).`);

  if (img.width !== size || img.height !== size) {
    throw new Error(`Conversion produced ${img.width}×${img.height}, expected ${size}×${size}`);
  }
  return { image: img, notes };
}
