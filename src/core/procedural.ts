/**
 * MOCK ONLY. Deterministic procedural sprite generator used by the offline Mock
 * provider so the app is fully usable without an AI backend. It reads a few color
 * and outline keywords from the prompt but is NOT an AI model and does not
 * understand the subject.
 */
import { RgbaImage, createImage, setPixel } from './image';
import { Rgba, hslToRgb } from './color';
import { hashString, mulberry32 } from './random';
import { COLOR_WORDS } from './prompt/lexicon';

export interface ProceduralOptions {
  prompt: string;
  negativePrompt: string;
  seed: number;
  grid: number;
  transparent: boolean;
}

const CHARACTER_WORDS =
  /\b(character|creature|monster|slime|knight|warrior|hero|heroine|wizard|mage|witch|robot|cat|dog|fox|bird|dragon|ghost|alien|goblin|orc|skeleton|zombie|person|man|woman|girl|boy|kid|player|enemy|npc|boss|bat|frog|owl|bear|bunny|rabbit|mouse|blob|golem|demon|angel|ninja|pirate|king|queen|princess|prince|elf|dwarf|beast|critter|pet)\b/i;

function findColors(text: string): { h: number; s: number; l: number }[] {
  const found: { idx: number; c: { h: number; s: number; l: number } }[] = [];
  const lower = text.toLowerCase();
  for (const [word, c] of Object.entries(COLOR_WORDS)) {
    const m = new RegExp(`\\b${word}\\b`).exec(lower);
    if (m) found.push({ idx: m.index, c });
  }
  return found.sort((a, b) => a.idx - b.idx).map((f) => f.c);
}

function shade(base: { h: number; s: number; l: number }, dl: number, ds = 0): Rgba {
  const [r, g, b] = hslToRgb(base.h, Math.max(0, Math.min(1, base.s + ds)), Math.max(0.03, Math.min(0.97, base.l + dl)));
  return [r, g, b, 255];
}

export function proceduralSprite(opts: ProceduralOptions): RgbaImage {
  const G = opts.grid;
  const prompt = opts.prompt.toLowerCase();
  const negative = opts.negativePrompt.toLowerCase();
  const rng = mulberry32(hashString(prompt) ^ opts.seed);

  const mono = /\b(1-?bit|monochrome|black and white)\b/.test(prompt);
  const gameboy = /\bgame ?boy\b/.test(prompt);
  const wantsOutline = !/\bno outlines?\b|\boutline-?less\b/.test(prompt) && !/\boutlines?\b/.test(negative);
  const isCharacter = CHARACTER_WORDS.test(prompt);

  // Background color comes from "<color> background"; it must not become the sprite color.
  const bgMatch = /\b([a-z]+)\s+(?:background|backdrop|bg)\b/.exec(prompt);
  const bgWord = bgMatch && COLOR_WORDS[bgMatch[1]] ? bgMatch[1] : null;
  const subjectText = (bgWord ? prompt.replace(bgMatch![0], ' ') : prompt).replace(/\b[a-z]+(?:[- ][a-z]+)?\s+outlines?\b/g, ' ');

  const colors = findColors(subjectText);
  const primary = colors[0] ?? { h: Math.floor(rng() * 360), s: 0.55 + rng() * 0.3, l: 0.5 };
  const secondary = colors[1] ?? { h: (primary.h + 140 + rng() * 80) % 360, s: 0.5 + rng() * 0.3, l: 0.55 };

  let pal: { light: Rgba; base: Rgba; dark: Rgba; accent: Rgba; accentDark: Rgba; outline: Rgba; eye: Rgba; pupil: Rgba };
  if (mono) {
    const w: Rgba = [240, 240, 232, 255];
    const k: Rgba = [20, 20, 24, 255];
    pal = { light: w, base: w, dark: k, accent: w, accentDark: k, outline: k, eye: k, pupil: k };
  } else if (gameboy) {
    const g4: Rgba[] = [
      [15, 56, 15, 255],
      [48, 98, 48, 255],
      [139, 172, 15, 255],
      [155, 188, 15, 255],
    ];
    pal = { light: g4[3], base: g4[2], dark: g4[1], accent: g4[3], accentDark: g4[1], outline: g4[0], eye: g4[0], pupil: g4[0] };
  } else {
    const outlineBlack = /\bblack outlines?\b/.test(prompt);
    pal = {
      light: shade(primary, 0.17, -0.05),
      base: shade(primary, 0),
      dark: shade(primary, -0.2, 0.05),
      accent: shade(secondary, 0.05),
      accentDark: shade(secondary, -0.17),
      outline: outlineBlack ? [16, 14, 22, 255] : shade(primary, -primary.l + 0.1, -0.1),
      eye: [245, 245, 240, 255],
      pupil: [20, 18, 30, 255],
    };
  }

  // --- silhouette: symmetric cellular-automata blob ---
  const margin = wantsOutline ? 1 : 0;
  const S = Math.max(4, G - 2 * margin - (G >= 16 ? 2 : 0));
  const off = Math.floor((G - S) / 2);
  const half = Math.ceil(S / 2);
  const ax = isCharacter ? 0.75 + rng() * 0.25 : 0.6 + rng() * 0.4;
  const ay = isCharacter ? 0.95 : 0.7 + rng() * 0.3;
  let mask: number[][] = Array.from({ length: S }, (_, y) =>
    Array.from({ length: S }, (_, x) => {
      const hx = x < half ? x : S - 1 - x;
      const cx = (half - 0.5 - hx) / half;
      const cy = (y + 0.5 - S / 2) / (S / 2);
      const e = (cx * cx) / (ax * ax) + (cy * cy) / (ay * ay);
      const p = e < 1 ? 0.35 + (1 - e) * 0.9 : 0.04;
      return rng() < p ? 1 : 0;
    }),
  );
  // mirror the random left half
  for (let y = 0; y < S; y++) for (let x = half; x < S; x++) mask[y][x] = mask[y][S - 1 - x];
  const iterations = S >= 24 ? 3 : S >= 12 ? 2 : 1;
  for (let it = 0; it < iterations; it++) {
    mask = mask.map((row, y) =>
      row.map((v, x) => {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && xx >= 0 && yy < S && xx < S) n += mask[yy][xx];
          }
        return v ? (n >= 3 ? 1 : 0) : n >= 5 ? 1 : 0;
      }),
    );
  }
  // keep the largest 4-connected component
  const comp = Array.from({ length: S }, () => new Array<number>(S).fill(-1));
  let bestId = -1;
  let bestSize = 0;
  let nextId = 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!mask[y][x] || comp[y][x] >= 0) continue;
      const id = nextId++;
      let size = 0;
      const stack = [[x, y]];
      comp[y][x] = id;
      while (stack.length) {
        const [px, py] = stack.pop()!;
        size++;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx >= 0 && ny >= 0 && nx < S && ny < S && mask[ny][nx] && comp[ny][nx] < 0) {
            comp[ny][nx] = id;
            stack.push([nx, ny]);
          }
        }
      }
      if (size > bestSize) [bestSize, bestId] = [size, id];
    }
  const body = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && comp[y][x] === bestId;

  // accent band (symmetric) for some texture
  const bandStart = Math.floor(S * (0.45 + rng() * 0.2));
  const bandEnd = bandStart + Math.max(1, Math.floor(S * (0.12 + rng() * 0.15)));
  const spotChance = S >= 24 ? 0.06 : 0;

  const img = createImage(G, G);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!body(x, y)) continue;
      const inBand = y >= bandStart && y < bandEnd;
      const lightEdge = !body(x, y - 1) || !body(x - 1, y);
      const darkEdge = !body(x, y + 1) || !body(x + 1, y);
      let c: Rgba;
      if (inBand) c = darkEdge ? pal.accentDark : pal.accent;
      else if (darkEdge) c = pal.dark;
      else if (lightEdge) c = pal.light;
      else c = pal.base;
      if (!inBand && !darkEdge && !lightEdge && spotChance && rng() < spotChance) c = pal.light;
      setPixel(img, off + x, off + y, c);
    }

  // eyes for character-like subjects
  if (isCharacter && S >= 6) {
    const eyeY = Math.floor(S * 0.32);
    const gap = Math.max(1, Math.floor(S * 0.14));
    const cx = S / 2;
    for (const sx of [Math.floor(cx - gap - 1), Math.ceil(cx + gap)]) {
      if (!body(sx, eyeY)) continue;
      if (S >= 14) {
        setPixel(img, off + sx, off + eyeY, pal.eye);
        setPixel(img, off + sx, off + eyeY + 1, pal.pupil);
      } else setPixel(img, off + sx, off + eyeY, pal.pupil);
    }
  }

  if (wantsOutline) {
    const copy = new Uint8ClampedArray(img.data);
    for (let y = 0; y < G; y++)
      for (let x = 0; x < G; x++) {
        if (copy[(y * G + x) * 4 + 3] > 0) continue;
        const touches = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= 0 && ny >= 0 && nx < G && ny < G && copy[(ny * G + nx) * 4 + 3] > 0;
        });
        if (touches) setPixel(img, x, y, pal.outline);
      }
  }

  if (!opts.transparent) {
    const bgc = bgWord ? COLOR_WORDS[bgWord] : { h: (primary.h + 180) % 360, s: 0.15, l: 0.82 };
    const bg = shade(bgc, 0);
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] === 0) img.data.set(bg, i);
    }
  }
  return img;
}
