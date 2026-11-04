// Generates build/icon.png (512x512) from a hand-drawn 16x16 sprite using nearest-neighbor scaling.
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const rows = [
  '..KKKKKKKKKKKK..',
  '.KDDDDDDDDDDDDK.',
  'KDDDDDDDDDDDDDDK',
  'KDDDDOOOOOODDDDK',
  'KDDDOBBBBBBODDDK',
  'KDDOBLLBBBBBODDK',
  'KDDOBLBBBBBBODDK',
  'KDOBBWPBBWPBBODK',
  'KDOBBWPBBWPBBODK',
  'KDOBBBBBBBBBBODK',
  'KDOBBBBNNBBBBODK',
  'KDOSBBBBBBBBSODK',
  'KDDOOSSSSSSOODDK',
  'KDDDDOOOOOODDDDK',
  '.KDDDDDDDDDDDDK.',
  '..KKKKKKKKKKKK..',
];
const colors = {
  K: [15, 16, 32, 255],
  D: [28, 30, 43, 255],
  O: [11, 12, 20, 255],
  B: [108, 140, 255, 255],
  L: [185, 200, 255, 255],
  S: [61, 85, 196, 255],
  W: [255, 255, 255, 255],
  P: [11, 12, 20, 255],
  N: [42, 58, 143, 255],
  '.': [0, 0, 0, 0],
};
const scale = 32;
const size = rows.length * scale;
const png = new PNG({ width: size, height: size });
rows.forEach((row, y) => {
  if (row.length !== 16) throw new Error(`row ${y} has ${row.length} chars`);
  [...row].forEach((ch, x) => {
    const c = colors[ch];
    for (let dy = 0; dy < scale; dy++)
      for (let dx = 0; dx < scale; dx++) png.data.set(c, (((y * scale + dy) * size) + x * scale + dx) * 4);
  });
});
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', PNG.sync.write(png));
console.log(`wrote build/icon.png (${size}x${size})`);
