import { promises as fs } from 'node:fs';
import { AppError } from '@shared/errors';
import { writeFileAtomic, readFileIfExists } from './fsUtil';

/** Subset of Electron's safeStorage used here (injectable for tests). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export type KeySource = 'keychain' | 'session' | 'env';

/**
 * API-key storage. Keys are encrypted with the OS credential store via Electron
 * safeStorage (macOS Keychain, Windows DPAPI, Linux libsecret/kwallet) and only the
 * ciphertext is written to disk. Keys never leave the main process.
 *
 * On Linux without a keyring, Electron falls back to a hard-coded password
 * ("basic_text"), which is NOT secure; in that case persistence is refused and keys
 * are kept in memory for the session only.
 */
export class SecretStore {
  private session = new Map<string, string>();
  private cache: Record<string, string> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly storage: SafeStorageLike,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  backend(): string {
    try {
      return this.storage.getSelectedStorageBackend?.() ?? (this.storage.isEncryptionAvailable() ? 'os' : 'unavailable');
    } catch {
      return 'unknown';
    }
  }

  /** True only when keys can be persisted with real OS-level protection. */
  canPersistSecurely(): boolean {
    if (!this.storage.isEncryptionAvailable()) return false;
    const b = this.backend();
    return b !== 'basic_text' && b !== 'unavailable';
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    const raw = await readFileIfExists(this.filePath);
    let parsed: Record<string, string> = {};
    if (raw) {
      try {
        const obj = JSON.parse(raw.toString('utf8'));
        if (obj && typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') parsed[k] = v;
        }
      } catch {
        parsed = {}; // unreadable secrets file: treat as empty; keys must be re-entered
      }
    }
    this.cache = parsed;
    return parsed;
  }

  async set(name: string, value: string, persist: boolean): Promise<KeySource> {
    const v = value.trim();
    if (!v) throw new AppError('invalid_input', 'API key must not be empty.');
    if (v.length > 4096) throw new AppError('invalid_input', 'API key is too long.');
    if (!persist) {
      this.session.set(name, v);
      await this.removePersisted(name);
      return 'session';
    }
    if (!this.canPersistSecurely()) {
      throw new AppError('secure_storage_unavailable', 'Secure OS credential storage is not available on this system, so the key cannot be saved to disk.');
    }
    const data = await this.load();
    data[name] = this.storage.encryptString(v).toString('base64');
    await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2));
    this.session.delete(name);
    return 'keychain';
  }

  private async removePersisted(name: string): Promise<void> {
    const data = await this.load();
    if (name in data) {
      delete data[name];
      await writeFileAtomic(this.filePath, JSON.stringify(data, null, 2));
    }
  }

  async delete(name: string): Promise<void> {
    this.session.delete(name);
    await this.removePersisted(name);
  }

  /** Lookup order: session (explicit override) → OS-encrypted store → environment variable. */
  async get(name: string, envVar?: string): Promise<{ value: string; source: KeySource } | null> {
    const s = this.session.get(name);
    if (s) return { value: s, source: 'session' };
    const data = await this.load();
    if (data[name] && this.storage.isEncryptionAvailable()) {
      try {
        return { value: this.storage.decryptString(Buffer.from(data[name], 'base64')), source: 'keychain' };
      } catch {
        // Undecryptable (e.g. keychain reset): ignore and fall through.
      }
    }
    const e = envVar ? this.env[envVar]?.trim() : undefined;
    if (e) return { value: e, source: 'env' };
    return null;
  }

  async wipeFile(): Promise<void> {
    this.cache = {};
    await fs.rm(this.filePath, { force: true });
  }
}
