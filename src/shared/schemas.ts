import { z } from 'zod';
import { SPRITE_SIZES, EXPORT_SCALES, MAX_DECODE_DIMENSION } from '@core/sizes';
import { MAX_SEED } from '@core/random';
import { MAX_NEGATIVE_LENGTH, MAX_PROMPT_LENGTH } from '@core/prompt/analyze';
import { DEFAULT_CONVERSION } from '@core/pixelize';
import { DEFAULT_TECHNICAL } from '@core/prompt/compose';
import { FILTER_TYPES } from '@core/filters';

export const spriteSizeSchema = z
  .number()
  .int()
  .refine((n) => (SPRITE_SIZES as readonly number[]).includes(n), { message: `Size must be one of ${SPRITE_SIZES.join(', ')}` });

const paramValue = z.union([z.number().finite(), z.string().max(2000), z.boolean()]);
export const paramValuesSchema = z.record(z.string().max(64), paramValue);

export const technicalSchema = z.object({
  centered: z.boolean(),
  readableAtSize: z.boolean(),
  isolatedBackground: z.boolean(),
});

export const conversionSchema = z.object({
  paletteMode: z.enum(['auto', 'custom', 'off']),
  paletteColors: z.number().int().min(2).max(64),
  downscale: z.enum(['nearest', 'dominant']),
  alphaThreshold: z.number().int().min(1).max(255),
  backgroundRemoval: z.enum(['auto', 'on', 'off']),
  backgroundTolerance: z.number().int().min(0).max(128),
});

export const generationRequestSchema = z.object({
  providerId: z.string().min(1).max(64),
  prompt: z
    .string()
    .max(MAX_PROMPT_LENGTH, `Prompt must be at most ${MAX_PROMPT_LENGTH} characters`)
    .refine((s) => s.trim().length > 0, 'Prompt must not be empty'),
  negativePrompt: z.string().max(MAX_NEGATIVE_LENGTH),
  size: spriteSizeSchema,
  transparent: z.boolean(),
  seed: z.number().int().min(0).max(MAX_SEED),
  variations: z.number().int().min(1).max(8),
  params: paramValuesSchema,
  technical: technicalSchema,
  conversion: conversionSchema,
});

export const wireImageSchema = z
  .object({
    width: z.number().int().min(1).max(MAX_DECODE_DIMENSION),
    height: z.number().int().min(1).max(MAX_DECODE_DIMENSION),
    data: z.custom<Uint8Array | Uint8ClampedArray>((v) => v instanceof Uint8Array || v instanceof Uint8ClampedArray, 'Pixel data must be a byte array'),
  })
  .refine((img) => img.data.length === img.width * img.height * 4, 'Pixel buffer length does not match dimensions');

export const spriteImageSchema = wireImageSchema.refine(
  (img) => img.width === img.height && (SPRITE_SIZES as readonly number[]).includes(img.width),
  `Sprite must be square with a size of ${SPRITE_SIZES.join(', ')}`,
);

export const exportScaleSchema = z
  .number()
  .int()
  .refine((n) => (EXPORT_SCALES as readonly number[]).includes(n), { message: `Scale must be one of ${EXPORT_SCALES.join(', ')}` });

const safeName = z
  .string()
  .max(120)
  .transform((s) => s.replace(/[^\w\- .()]+/g, '_').trim() || 'sprite');

export const exportPngRequestSchema = z.object({ image: spriteImageSchema, scale: exportScaleSchema, suggestedName: safeName });
export const exportSheetRequestSchema = z.object({
  images: z.array(spriteImageSchema).min(1).max(64),
  columns: z.number().int().min(1).max(64),
  scale: exportScaleSchema,
  suggestedName: safeName,
});

export const filterStepSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(FILTER_TYPES),
  enabled: z.boolean(),
  params: paramValuesSchema,
});

export const filterPresetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  steps: z.array(z.unknown()).max(64),
});

export const preferencesSchema = z.object({
  version: z.literal(1),
  theme: z.enum(['system', 'dark', 'light']).catch('system'),
  providerId: z.string().max(64).catch('mock'),
  providerSettings: z.record(z.string(), paramValuesSchema).catch({}),
  defaults: z
    .object({
      size: spriteSizeSchema.catch(32),
      variations: z.number().int().min(1).max(8).catch(4),
      transparent: z.boolean().catch(true),
      technical: technicalSchema.catch(DEFAULT_TECHNICAL),
      conversion: conversionSchema.catch(DEFAULT_CONVERSION),
    })
    .catch({ size: 32, variations: 4, transparent: true, technical: DEFAULT_TECHNICAL, conversion: DEFAULT_CONVERSION }),
  editor: z
    .object({ showGrid: z.boolean().catch(true), gridMinZoom: z.number().int().min(2).max(64).catch(6) })
    .catch({ showGrid: true, gridMinZoom: 6 }),
  presets: z.array(filterPresetSchema).max(200).catch([]),
  autosave: z.boolean().catch(true),
  exportScale: exportScaleSchema.catch(1),
});

// ---- Project file (on disk) ----

export const PROJECT_FORMAT = 'spritegen-project';
export const PROJECT_VERSION = 1;

const pngBase64 = z
  .string()
  .min(16)
  .max(64 * 1024 * 1024)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Image data is not valid base64');

export const variationFileSchema = z.object({
  id: z.string().min(1).max(64),
  index: z.number().int().min(0).max(63),
  seed: z.number().int().min(0).max(MAX_SEED).nullable(),
  originalPng: pngBase64,
  currentPng: pngBase64,
  pipeline: z.array(z.unknown()).max(64),
  notes: z.array(z.string().max(1000)).max(50),
  sourceWidth: z.number().int().min(1).max(MAX_DECODE_DIMENSION),
  sourceHeight: z.number().int().min(1).max(MAX_DECODE_DIMENSION),
});

export const generationRecordFileSchema = z.object({
  id: z.string().min(1).max(64),
  createdAt: z.string().max(64),
  providerId: z.string().max(64),
  providerName: z.string().max(120),
  isMock: z.boolean(),
  request: generationRequestSchema,
  finalPrompt: z.string().max(40000),
  finalNegativePrompt: z.string().max(10000).nullable(),
  promptNotes: z.array(z.string().max(1000)).max(50),
  variations: z.array(variationFileSchema).min(1).max(64),
});

export const projectFileSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.number().int(),
  app: z.string().max(64).optional(),
  name: z.string().max(200),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
  history: z.array(generationRecordFileSchema).max(5000),
});

export type ProjectFile = z.infer<typeof projectFileSchema>;

/** Formats zod issues into a short human-readable list. */
export function formatZodError(err: z.ZodError, max = 5): string {
  return err.issues
    .slice(0, max)
    .map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}
