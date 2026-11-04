import { RgbaImage } from '../image';
import { ParamSpec, ParamValues, defaultParams, sanitizeParams } from '../params';
import { parseHexColor } from '../color';
import { DITHER_ALGORITHMS, DITHER_LABELS, DitherAlgorithm, ditherToPalette } from '../dither';
import { buildPalette, mapToPalette } from '../quantize';
import { alphaThreshold, brightness, contrast, gamma, hueShift, posterize, saturation, sharpen } from './adjust';
import { outline } from './structure';
import { removeBackground } from './background';

export const FILTER_TYPES = [
  'brightness',
  'contrast',
  'saturation',
  'hueShift',
  'gamma',
  'sharpen',
  'posterize',
  'paletteReduce',
  'dither',
  'outline',
  'removeBackground',
  'alphaThreshold',
] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export interface FilterStep {
  id: string;
  type: FilterType;
  enabled: boolean;
  params: ParamValues;
}

export interface FilterDefinition {
  type: FilterType;
  label: string;
  description: string;
  params: ParamSpec[];
  apply(img: RgbaImage, p: ParamValues): RgbaImage;
}

const num = (p: ParamValues, k: string) => Number(p[k]);
const str = (p: ParamValues, k: string) => String(p[k]);

const DITHER_OPTIONS = DITHER_ALGORITHMS.map((a) => ({ value: a, label: DITHER_LABELS[a] }));

export const FILTERS: Record<FilterType, FilterDefinition> = {
  brightness: {
    type: 'brightness',
    label: 'Brightness',
    description: 'Lightens or darkens all visible pixels.',
    params: [{ kind: 'range', key: 'amount', label: 'Amount', min: -100, max: 100, step: 1, default: 10 }],
    apply: (img, p) => brightness(img, num(p, 'amount')),
  },
  contrast: {
    type: 'contrast',
    label: 'Contrast',
    description: 'Increases or decreases the difference between light and dark.',
    params: [{ kind: 'range', key: 'amount', label: 'Amount', min: -100, max: 100, step: 1, default: 15 }],
    apply: (img, p) => contrast(img, num(p, 'amount')),
  },
  saturation: {
    type: 'saturation',
    label: 'Saturation',
    description: 'Adjusts color intensity. -100 produces grayscale.',
    params: [{ kind: 'range', key: 'amount', label: 'Amount', min: -100, max: 100, step: 1, default: 20 }],
    apply: (img, p) => saturation(img, num(p, 'amount')),
  },
  hueShift: {
    type: 'hueShift',
    label: 'Hue shift',
    description: 'Rotates every hue around the color wheel.',
    params: [{ kind: 'range', key: 'degrees', label: 'Degrees', min: -180, max: 180, step: 1, default: 30, unit: '°' }],
    apply: (img, p) => hueShift(img, num(p, 'degrees')),
  },
  gamma: {
    type: 'gamma',
    label: 'Gamma',
    description: 'Non-linear midtone adjustment. Values above 1 brighten midtones.',
    params: [{ kind: 'range', key: 'gamma', label: 'Gamma', min: 0.1, max: 4, step: 0.05, default: 1.2 }],
    apply: (img, p) => gamma(img, num(p, 'gamma')),
  },
  sharpen: {
    type: 'sharpen',
    label: 'Sharpen',
    description: 'Boosts local contrast between neighboring pixels (ignores transparent neighbors).',
    params: [{ kind: 'range', key: 'amount', label: 'Amount', min: 0, max: 3, step: 0.1, default: 0.5 }],
    apply: (img, p) => sharpen(img, num(p, 'amount')),
  },
  posterize: {
    type: 'posterize',
    label: 'Posterize',
    description: 'Reduces color depth to N evenly spaced levels per channel.',
    params: [{ kind: 'range', key: 'levels', label: 'Levels per channel', min: 2, max: 32, step: 1, default: 4 }],
    apply: (img, p) => posterize(img, num(p, 'levels')),
  },
  paletteReduce: {
    type: 'paletteReduce',
    label: 'Palette reduction',
    description: 'Limits the sprite to an adaptive palette of N colors (no dithering).',
    params: [
      { kind: 'range', key: 'colors', label: 'Colors', min: 2, max: 64, step: 1, default: 8 },
      {
        kind: 'select',
        key: 'method',
        label: 'Method',
        options: [
          { value: 'median-cut', label: 'Median cut (fast)' },
          { value: 'k-means', label: 'Median cut + k-means refine' },
        ],
        default: 'median-cut',
      },
    ],
    apply: (img, p) => mapToPalette(img, buildPalette(img, num(p, 'colors'), str(p, 'method') as 'median-cut' | 'k-means')),
  },
  dither: {
    type: 'dither',
    label: 'Dither',
    description: 'Reduces to an adaptive N-color palette using the selected dithering algorithm.',
    params: [
      { kind: 'select', key: 'algorithm', label: 'Algorithm', options: DITHER_OPTIONS, default: 'floyd-steinberg' },
      { kind: 'range', key: 'colors', label: 'Colors', min: 2, max: 64, step: 1, default: 8 },
    ],
    apply: (img, p) => ditherToPalette(img, buildPalette(img, num(p, 'colors'), 'median-cut'), str(p, 'algorithm') as DitherAlgorithm),
  },
  outline: {
    type: 'outline',
    label: 'Outline',
    description: 'Adds an outer outline around the sprite, or recolors its edge pixels (inner).',
    params: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Mode',
        options: [
          { value: 'outer', label: 'Outer (adds pixels around sprite)' },
          { value: 'inner', label: 'Inner (recolors edge pixels)' },
        ],
        default: 'outer',
      },
      {
        kind: 'select',
        key: 'colorMode',
        label: 'Color',
        options: [
          { value: 'custom', label: 'Custom color' },
          { value: 'darken', label: 'Darkened neighbor (selective outline)' },
        ],
        default: 'custom',
      },
      { kind: 'color', key: 'color', label: 'Outline color', default: '#1a1c2c' },
      { kind: 'range', key: 'darken', label: 'Darken amount', min: 0, max: 100, step: 5, default: 55, unit: '%' },
      {
        kind: 'select',
        key: 'connectivity',
        label: 'Neighbors',
        options: [
          { value: '4', label: '4 (no corners)' },
          { value: '8', label: '8 (includes corners)' },
        ],
        default: '4',
      },
      { kind: 'range', key: 'thickness', label: 'Thickness (outer)', min: 1, max: 4, step: 1, default: 1, unit: 'px' },
    ],
    apply: (img, p) =>
      outline(img, {
        mode: str(p, 'mode') as 'outer' | 'inner',
        colorMode: str(p, 'colorMode') as 'custom' | 'darken',
        color: parseHexColor(str(p, 'color')) ?? [0, 0, 0, 255],
        darkenAmount: num(p, 'darken') / 100,
        connectivity: str(p, 'connectivity') === '8' ? 8 : 4,
        thickness: num(p, 'thickness'),
      }),
  },
  removeBackground: {
    type: 'removeBackground',
    label: 'Remove background',
    description: 'Turns the background (auto-detected from edges) or a chosen color transparent.',
    params: [
      {
        kind: 'select',
        key: 'mode',
        label: 'Mode',
        options: [
          { value: 'auto-edges', label: 'Auto (border color, from edges)' },
          { value: 'color', label: 'Specific color' },
        ],
        default: 'auto-edges',
      },
      { kind: 'color', key: 'color', label: 'Color', default: '#ffffff' },
      { kind: 'range', key: 'tolerance', label: 'Tolerance', min: 0, max: 128, step: 1, default: 16 },
      {
        kind: 'boolean',
        key: 'contiguous',
        label: 'Only regions touching the edge',
        default: true,
        tooltip: 'For "Specific color": when off, every matching pixel becomes transparent.',
      },
    ],
    apply: (img, p) =>
      removeBackground(img, {
        mode: str(p, 'mode') as 'auto-edges' | 'color',
        color: parseHexColor(str(p, 'color')) ?? undefined,
        tolerance: num(p, 'tolerance'),
        contiguous: Boolean(p.contiguous),
      }),
  },
  alphaThreshold: {
    type: 'alphaThreshold',
    label: 'Alpha cleanup',
    description: 'Makes every pixel either fully opaque or fully transparent (hard pixel-art edges).',
    params: [{ kind: 'range', key: 'threshold', label: 'Threshold', min: 1, max: 255, step: 1, default: 128 }],
    apply: (img, p) => alphaThreshold(img, num(p, 'threshold')),
  },
};

export function isFilterType(v: unknown): v is FilterType {
  return typeof v === 'string' && (FILTER_TYPES as readonly string[]).includes(v);
}

let idCounter = 0;
function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  idCounter += 1;
  return `step-${Date.now().toString(36)}-${idCounter}`;
}

export function createFilterStep(type: FilterType, params?: Partial<ParamValues>): FilterStep {
  const def = FILTERS[type];
  return { id: newId(), type, enabled: true, params: sanitizeParams(def.params, { ...defaultParams(def.params), ...params }) };
}

/** Validates and normalizes an untrusted step (e.g. from a project file). Returns null if the type is unknown. */
export function sanitizeFilterStep(input: unknown): FilterStep | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  if (!isFilterType(raw.type)) return null;
  const def = FILTERS[raw.type];
  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : newId(),
    type: raw.type,
    enabled: raw.enabled !== false,
    params: sanitizeParams(def.params, { ...defaultParams(def.params), ...((raw.params as object) ?? {}) }),
  };
}

export function applyFilter(img: RgbaImage, step: FilterStep): RgbaImage {
  return FILTERS[step.type].apply(img, step.params);
}
