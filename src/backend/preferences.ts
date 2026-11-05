import { DEFAULT_CONVERSION } from '@core/pixelize';
import { DEFAULT_TECHNICAL } from '@core/prompt/compose';
import { sanitizeFilterStep } from '@core/filters';
import type { Preferences } from '@shared/types';
import { preferencesSchema } from '@shared/schemas';

export function defaultPreferences(): Preferences {
  return {
    version: 1,
    theme: 'system',
    providerId: 'mock',
    providerSettings: {},
    defaults: { size: 32, variations: 4, transparent: true, technical: { ...DEFAULT_TECHNICAL }, conversion: { ...DEFAULT_CONVERSION } },
    editor: { showGrid: true, gridMinZoom: 6 },
    presets: [],
    autosave: true,
    exportScale: 1,
  };
}

/** Validates untrusted preference data, repairing individual bad fields with defaults. */
export function sanitizePreferences(input: unknown): Preferences {
  const base = defaultPreferences();
  const merged = input && typeof input === 'object' ? { ...base, ...(input as object), version: 1 } : base;
  const parsed = preferencesSchema.safeParse(merged);
  if (!parsed.success) return base;
  const p = parsed.data;
  return {
    ...p,
    presets: p.presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      steps: preset.steps.map(sanitizeFilterStep).filter((s): s is NonNullable<typeof s> => s !== null),
    })),
  } as Preferences;
}

