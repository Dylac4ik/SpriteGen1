import { RgbaImage, createImage } from './image';

export interface SpriteSheetLayout {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  width: number;
  height: number;
}

export function spriteSheetLayout(count: number, cellWidth: number, cellHeight: number, columns: number, padding = 0): SpriteSheetLayout {
  if (count < 1) throw new Error('Sprite sheet needs at least one image');
  const cols = Math.max(1, Math.min(Math.floor(columns), count));
  const rows = Math.ceil(count / cols);
  return {
    columns: cols,
    rows,
    cellWidth,
    cellHeight,
    width: cols * cellWidth + (cols - 1) * padding,
    height: rows * cellHeight + (rows - 1) * padding,
  };
}

/**
 * Packs equally sized sprites into a grid, left-to-right then top-to-bottom.
 * Each sprite is copied 1:1 (no scaling); empty cells and padding are transparent.
 */
export function composeSpriteSheet(images: RgbaImage[], columns: number, padding = 0): RgbaImage {
  if (images.length === 0) throw new Error('Sprite sheet needs at least one image');
  const { width: cw, height: ch } = images[0];
  for (const img of images) {
    if (img.width !== cw || img.height !== ch) throw new Error('All sprite sheet images must have the same dimensions');
  }
  const layout = spriteSheetLayout(images.length, cw, ch, columns, padding);
  const sheet = createImage(layout.width, layout.height);
  images.forEach((img, idx) => {
    const col = idx % layout.columns;
    const row = Math.floor(idx / layout.columns);
    const ox = col * (cw + padding);
    const oy = row * (ch + padding);
    for (let y = 0; y < ch; y++) {
      sheet.data.set(img.data.subarray(y * cw * 4, (y + 1) * cw * 4), ((oy + y) * layout.width + ox) * 4);
    }
  });
  return sheet;
}
