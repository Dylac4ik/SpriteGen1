import { promises as fs } from 'node:fs';
import { DEFAULT_CONVERSION } from '@core/pixelize';
import { DEFAULT_TECHNICAL } from '@core/prompt/compose';
import { sanitizeFilterStep } from '@core/filters';
import type { Preferences } from '@shared/types';
import { preferencesSchema } from '@shared/schemas';
import { readFileIfExists, writeFileAtomic } from './fsUtil';

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

export class PreferencesStore {
  private current: Preferences = defaultPreferences();
  constructor(private readonly filePath: string) {}

  /** Loads preferences. A corrupted file is backed up and replaced by defaults; a warning is returned. */
  async load(): Promise<{ prefs: Preferences; warning?: string }> {
    const raw = await readFileIfExists(this.filePath);
    if (!raw) {
      this.current = defaultPreferences();
      return { prefs: this.current };
    }
    try {
      this.current = sanitizePreferences(JSON.parse(raw.toString('utf8')));
      return { prefs: this.current };
    } catch {
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      await fs.rename(this.filePath, backup).catch(() => undefined);
      this.current = defaultPreferences();
      return { prefs: this.current, warning: `Preferences file was unreadable and has been reset. The old file was kept as ${backup}.` };
    }
  }

  get(): Preferences {
    return this.current;
  }

  async update(patch: Partial<Preferences>): Promise<Preferences> {
    this.current = sanitizePreferences({ ...this.current, ...patch });
    await writeFileAtomic(this.filePath, JSON.stringify(this.current, null, 2));
    return this.current;
  }
}
