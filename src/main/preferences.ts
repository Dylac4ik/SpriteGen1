import { promises as fs } from 'node:fs';
import type { Preferences } from '@shared/types';
import { defaultPreferences, sanitizePreferences } from '@backend/preferences';
import { readFileIfExists, writeFileAtomic } from './fsUtil';

export { defaultPreferences, sanitizePreferences };

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
