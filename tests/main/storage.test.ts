import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SecretStore, type SafeStorageLike } from '../../src/main/secrets';
import { PreferencesStore, sanitizePreferences } from '../../src/main/preferences';

const fakeStorage = (backend = 'gnome_libsecret', available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from(`enc:${Buffer.from(s).toString('base64')}`),
  decryptString: (b) => Buffer.from(b.toString().slice(4), 'base64').toString(),
  getSelectedStorageBackend: () => backend,
});

describe('SecretStore', () => {
  it('persists only ciphertext and decrypts on read', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    const file = join(dir, 'secrets.json');
    const store = new SecretStore(file, fakeStorage(), {});
    expect(await store.set('apiKey:openai', 'sk-secret-123', true)).toBe('keychain');
    expect(readFileSync(file, 'utf8')).not.toContain('sk-secret-123');
    const fresh = new SecretStore(file, fakeStorage(), {});
    expect(await fresh.get('apiKey:openai')).toEqual({ value: 'sk-secret-123', source: 'keychain' });
    await fresh.delete('apiKey:openai');
    expect(await fresh.get('apiKey:openai')).toBeNull();
  });

  it('refuses to persist when only the insecure basic_text backend is available', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    const store = new SecretStore(join(dir, 's.json'), fakeStorage('basic_text'), {});
    expect(store.canPersistSecurely()).toBe(false);
    await expect(store.set('k', 'v', true)).rejects.toMatchObject({ code: 'secure_storage_unavailable' });
    expect(await store.set('k', 'v', false)).toBe('session');
    expect(await store.get('k')).toEqual({ value: 'v', source: 'session' });
    expect(existsSync(join(dir, 's.json'))).toBe(false);
  });

  it('falls back to environment variables and validates input', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    const store = new SecretStore(join(dir, 's.json'), fakeStorage(), { OPENAI_API_KEY: ' sk-env ' });
    expect(await store.get('apiKey:openai', 'OPENAI_API_KEY')).toEqual({ value: 'sk-env', source: 'env' });
    await expect(store.set('k', '   ', true)).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('survives a corrupted secrets file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    writeFileSync(join(dir, 's.json'), '{{{');
    const store = new SecretStore(join(dir, 's.json'), fakeStorage(), {});
    expect(await store.get('x')).toBeNull();
  });
});

describe('PreferencesStore', () => {
  it('returns defaults when no file exists and persists updates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    const store = new PreferencesStore(join(dir, 'p.json'));
    const { prefs } = await store.load();
    expect(prefs.providerId).toBe('mock');
    await store.update({ theme: 'light', defaults: { ...prefs.defaults, size: 64 } });
    const again = new PreferencesStore(join(dir, 'p.json'));
    expect((await again.load()).prefs.defaults.size).toBe(64);
  });

  it('backs up a corrupted file and resets to defaults with a warning', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sg-'));
    writeFileSync(join(dir, 'p.json'), 'not json');
    const res = await new PreferencesStore(join(dir, 'p.json')).load();
    expect(res.warning).toMatch(/reset/);
    expect(readdirSync(dir).some((f) => f.includes('corrupt'))).toBe(true);
  });

  it('repairs individual invalid fields', () => {
    const p = sanitizePreferences({ theme: 'neon', defaults: { size: 24 }, presets: [{ id: 'a', name: 'A', steps: [{ type: 'outline' }, { type: 'nope' }] }] });
    expect(p.theme).toBe('system');
    expect(p.defaults.size).toBe(32);
    expect(p.presets[0].steps.map((s) => s.type)).toEqual(['outline']);
  });
});
