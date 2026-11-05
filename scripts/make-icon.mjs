// Generates app icons from a hand-drawn 16x16 sprite using integer nearest-neighbor scaling.
//   node scripts/make-icon.mjs           -> build/icon.png (desktop, 512x512)
//   node scripts/make-icon.mjs --mobile  -> Android launcher/adaptive icons + splash, iOS AppIcon + splash
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

// ---------------- mobile assets ----------------
const BG = [28, 30, 43, 255]; // matches the desktop icon background
const isFrame = (ch) => ch === 'K' || ch === 'D' || ch === '.';

/** Draws the sprite (frame optional) at the largest integer scale that fits `fraction` of the canvas. */
function render(width, height, { fraction, background, frame }) {
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) out.data.set(background ?? [0, 0, 0, 0], i);
  const k = Math.max(1, Math.floor((Math.min(width, height) * fraction) / 16));
  const ox = Math.floor((width - 16 * k) / 2);
  const oy = Math.floor((height - 16 * k) / 2);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (!frame && isFrame(ch)) return;
      if (ch === '.') return;
      const c = colors[ch];
      for (let dy = 0; dy < k; dy++)
        for (let dx = 0; dx < k; dx++) out.data.set(c, ((oy + y * k + dy) * width + ox + x * k + dx) * 4);
    }),
  );
  return PNG.sync.write(out);
}

function pngSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function walk(dir) {
  return readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
}

if (process.argv.includes('--mobile')) {
  let count = 0;
  const res = 'mobile/android/app/src/main/res';
  if (existsSync(res)) {
    for (const file of walk(res).filter((f) => f.endsWith('.png'))) {
      const { width, height } = pngSize(file);
      const name = file.split('/').pop();
      let png;
      if (name === 'ic_launcher_foreground.png') png = render(width, height, { fraction: 0.6 }); // adaptive-icon safe zone
      else if (name.startsWith('ic_launcher')) png = render(width, height, { fraction: 0.8, background: BG });
      else if (name === 'splash.png') png = render(width, height, { fraction: 0.3, background: BG });
      if (png) {
        writeFileSync(file, png);
        count++;
      }
    }
    writeFileSync(`${res}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1C1E2B</color>\n</resources>\n');
  }
  const assets = 'mobile/ios/App/App/Assets.xcassets';
  if (existsSync(assets)) {
    for (const file of walk(assets).filter((f) => f.endsWith('.png'))) {
      const { width, height } = pngSize(file);
      // iOS app icons must be opaque; splash uses the same dark background.
      const png = file.includes('AppIcon') ? render(width, height, { fraction: 0.8, background: BG }) : render(width, height, { fraction: 0.25, background: BG });
      writeFileSync(file, png);
      count++;
    }
  }
  console.log(`wrote ${count} mobile icon/splash images`);
}
