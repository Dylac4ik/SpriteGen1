import { RgbaImage, normalizeImage } from '@core/image';
import { isSpriteSize } from '@core/sizes';
import { sanitizeFilterStep, FilterStep } from '@core/filters';
import { AppError } from '@shared/errors';
import type { GenerationRecord, ProjectData, VariationRecord } from '@shared/types';
import { PROJECT_FORMAT, PROJECT_VERSION, formatZodError, projectFileSchema } from '@shared/schemas';
import { decodeBase64Png, encodePng } from './png';
import { bytesToBase64 } from './base64';

/*
 * Project file codec (.spritegen = versioned JSON with base64 PNGs). Pure, so the desktop
 * app (files on disk) and the mobile app (app storage / share sheet) use the same format.
 */

export const PROJECT_EXTENSION = 'spritegen';
/** Refuse to parse absurdly large files instead of exhausting memory. */
export const MAX_PROJECT_BYTES = 512 * 1024 * 1024;

function toB64(img: RgbaImage): string {
  return bytesToBase64(encodePng(img));
}

export function serializeProject(project: ProjectData): string {
  const file = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    app: 'SpriteGen',
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: new Date().toISOString(),
    history: project.history.map((rec) => ({
      id: rec.id,
      createdAt: rec.createdAt,
      providerId: rec.providerId,
      providerName: rec.providerName,
      isMock: rec.isMock,
      request: rec.request,
      finalPrompt: rec.finalPrompt,
      finalNegativePrompt: rec.finalNegativePrompt,
      promptNotes: rec.promptNotes,
      variations: rec.variations.map((v) => ({
        id: v.id,
        index: v.index,
        seed: v.seed,
        originalPng: toB64(normalizeImage(v.original)),
        currentPng: toB64(normalizeImage(v.current)),
        pipeline: v.pipeline,
        notes: v.notes,
        sourceWidth: v.sourceWidth,
        sourceHeight: v.sourceHeight,
      })),
    })),
  };
  return JSON.stringify(file);
}

/**
 * Parses and fully validates a project file. Every image is decoded and checked against
 * its record's declared size; unknown filters are dropped with a warning.
 */
export function parseProject(text: string): { project: ProjectData; warnings: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new AppError('corrupted_project', 'The file is not valid JSON.', { details: (e as Error).message });
  }
  if (!json || typeof json !== 'object' || (json as { format?: unknown }).format !== PROJECT_FORMAT) {
    throw new AppError('corrupted_project', 'This is not a SpriteGen project file.');
  }
  const version = (json as { version?: unknown }).version;
  if (typeof version === 'number' && version > PROJECT_VERSION) {
    throw new AppError('corrupted_project', `This project was saved by a newer SpriteGen (format v${version}). Please update the app.`, {
      hint: 'Update SpriteGen to open this file.',
    });
  }
  const parsed = projectFileSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError('corrupted_project', 'The project file is damaged or incomplete.', { details: formatZodError(parsed.error) });
  }
  const warnings: string[] = [];
  const history: GenerationRecord[] = parsed.data.history.map((rec, ri) => {
    const size = rec.request.size;
    const variations: VariationRecord[] = rec.variations.map((v, vi) => {
      const where = `generation ${ri + 1}, variation ${vi + 1}`;
      const original = decodeImage(v.originalPng, `Original image (${where})`);
      const current = decodeImage(v.currentPng, `Edited image (${where})`);
      for (const [label, img] of [
        ['original', original],
        ['edited', current],
      ] as const) {
        if (img.width !== size || img.height !== size || !isSpriteSize(img.width)) {
          throw new AppError('corrupted_project', `The ${label} image in ${where} is ${img.width}×${img.height}, but the record says ${size}×${size}.`);
        }
      }
      const pipeline: FilterStep[] = [];
      for (const raw of v.pipeline) {
        const step = sanitizeFilterStep(raw);
        if (step) pipeline.push(step);
        else warnings.push(`Dropped an unknown filter in ${where}.`);
      }
      return { id: v.id, index: v.index, seed: v.seed, original, current, pipeline, notes: v.notes, sourceWidth: v.sourceWidth, sourceHeight: v.sourceHeight };
    });
    return {
      id: rec.id,
      createdAt: rec.createdAt,
      providerId: rec.providerId,
      providerName: rec.providerName,
      isMock: rec.isMock,
      request: rec.request,
      finalPrompt: rec.finalPrompt,
      finalNegativePrompt: rec.finalNegativePrompt,
      promptNotes: rec.promptNotes,
      variations,
    } as GenerationRecord;
  });
  return { project: { name: parsed.data.name, createdAt: parsed.data.createdAt, updatedAt: parsed.data.updatedAt, history }, warnings };
}

function decodeImage(b64: string, label: string): RgbaImage {
  try {
    return decodeBase64Png(b64, label);
  } catch (e) {
    throw new AppError('corrupted_project', `${label} is corrupted: ${(e as Error).message}`);
  }
}

