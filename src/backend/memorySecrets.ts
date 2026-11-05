import { AppError } from '@shared/errors';
import type { KeySource, SecretStoreLike } from './secrets';

/**
 * Session-only key store: keys live in memory and vanish when the app closes. Used when
 * no OS credential store is available (e.g. the mobile build running in a plain browser)
 * and in tests. It never claims secure persistence.
 */
export class MemorySecretStore implements SecretStoreLike {
  private readonly keys = new Map<string, string>();
  constructor(private readonly env: Record<string, string | undefined> = {}) {}

  canPersistSecurely(): boolean {
    return false;
  }

  backend(): string {
    return 'memory';
  }

  async set(name: string, value: string, persist: boolean): Promise<KeySource> {
    const v = value.trim();
    if (!v) throw new AppError('invalid_input', 'API key must not be empty.');
    if (v.length > 4096) throw new AppError('invalid_input', 'API key is too long.');
    if (persist) throw new AppError('secure_storage_unavailable', 'Secure credential storage is not available here, so the key cannot be saved.');
    this.keys.set(name, v);
    return 'session';
  }

  async delete(name: string): Promise<void> {
    this.keys.delete(name);
  }

  async get(name: string, envVar?: string): Promise<{ value: string; source: KeySource } | null> {
    const v = this.keys.get(name);
    if (v) return { value: v, source: 'session' };
    const e = envVar ? this.env[envVar]?.trim() : undefined;
    return e ? { value: e, source: 'env' } : null;
  }
}
