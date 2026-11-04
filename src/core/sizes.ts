/** The only native output sizes SpriteGen produces. Sprites are always square. */
export const SPRITE_SIZES = [8, 16, 32, 64, 128, 256, 512] as const;
export type SpriteSize = (typeof SPRITE_SIZES)[number];

export function isSpriteSize(value: unknown): value is SpriteSize {
  return typeof value === 'number' && (SPRITE_SIZES as readonly number[]).includes(value);
}

/** Largest dimension any decoded image (model output, project file) may have. */
export const MAX_DECODE_DIMENSION = 4096;

/** Enlarged-preview export scale factors (nearest-neighbor only). */
export const EXPORT_SCALES = [1, 2, 4, 8, 16, 32] as const;
/** Upper bound on any exported/enlarged image edge, to keep memory bounded. */
export const MAX_EXPORT_DIMENSION = 8192;

/** Suggested palette size for readable pixel art at a given size (used by suggestions only). */
export function suggestedPaletteSize(size: SpriteSize): number {
  switch (size) {
    case 8:
      return 4;
    case 16:
      return 8;
    case 32:
      return 12;
    case 64:
      return 16;
    case 128:
      return 24;
    default:
      return 32;
  }
}
