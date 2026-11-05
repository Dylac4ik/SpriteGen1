import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { AppError } from '@shared/errors';
import { MemorySecretStore } from '@backend/memorySecrets';
import type { KeySource, SecretStoreLike } from '@backend/secrets';
import { bytesToBase64 } from '@backend/base64';
import { createNativeFetch, type NativeHttpLike } from './nativeFetch';
import type { FileStore, KeyValueStore, MobilePlatform, ShareOutcome } from './types';

declare const __APP_VERSION__: string;

/**
 * API keys in the iOS Keychain / Android Keystore via @aparajita/capacitor-secure-storage.
 * Only used on native platforms; the plugin's web fallback is plain localStorage, so the
 * browser build uses the session-only MemorySecretStore instead.
 */
class NativeSecretStore implements SecretStoreLike {
  private readonly session = new MemorySecretStore();
  canPersistSecurely(): boolean {
    return true;
  }
  backend(): string {
    return Capacitor.getPlatform() === 'ios' ? 'ios-keychain' : 'android-keystore';
  }
  async set(name: string, value: string, persist: boolean): Promise<KeySource> {
    const v = value.trim();
    if (!v) throw new AppError('invalid_input', 'API key must not be empty.');
    if (v.length > 4096) throw new AppError('invalid_input', 'API key is too long.');
    if (!persist) {
      await SecureStorage.removeItem(name).catch(() => undefined);
      return this.session.set(name, v, false);
    }
    await SecureStorage.setItem(name, v);
    await this.session.delete(name);
    return 'keychain';
  }
  async delete(name: string): Promise<void> {
    await this.session.delete(name);
    await SecureStorage.removeItem(name).catch(() => undefined);
  }
  async get(name: string): Promise<{ value: string; source: KeySource } | null> {
    const s = await this.session.get(name);
    if (s) return s;
    try {
      const v = await SecureStorage.getItem(name);
      return v ? { value: v, source: 'keychain' } : null;
    } catch {
      return null; // e.g. Keystore reset after a device restore: the key must be re-entered
    }
  }
}

const kv: KeyValueStore = {
  get: async (key) => (await Preferences.get({ key })).value,
  set: async (key, value) => {
    await Preferences.set({ key, value });
  },
  remove: async (key) => {
    await Preferences.remove({ key });
  },
};

const files: FileStore = {
  async write(path, text) {
    await Filesystem.writeFile({ path, data: text, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
  },
  async read(path) {
    try {
      const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof res.data === 'string' ? res.data : await res.data.text();
    } catch {
      return null;
    }
  },
  async remove(path) {
    await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined);
  },
  async list(dir) {
    try {
      const res = await Filesystem.readdir({ path: dir, directory: Directory.Data });
      return res.files.filter((f) => f.type === 'file').map((f) => ({ name: f.name, size: f.size, mtime: f.mtime }));
    } catch {
      return []; // directory does not exist yet
    }
  },
};

function browserDownload(fileName: string, bytes: Uint8Array, mimeType: string): ShareOutcome {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

async function shareFile(fileName: string, bytes: Uint8Array, mimeType: string): Promise<ShareOutcome> {
  if (!Capacitor.isNativePlatform()) return browserDownload(fileName, bytes, mimeType);
  // Write to the cache directory, then hand the file to the OS share sheet
  // (Save to Files / Photos, AirDrop, messaging apps…).
  const { uri } = await Filesystem.writeFile({ path: `share/${fileName}`, data: bytesToBase64(bytes), directory: Directory.Cache, recursive: true });
  try {
    await Share.share({ title: fileName, files: [uri], dialogTitle: `Share ${fileName}` });
    return 'shared';
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return 'cancelled';
    throw new AppError('file_io', `Could not share ${fileName}: ${(e as Error).message}`);
  }
}

async function copyPng(bytes: Uint8Array): Promise<void> {
  const ClipboardItemCtor = (globalThis as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
  if (!navigator.clipboard?.write || !ClipboardItemCtor) {
    throw new AppError('unknown', 'This device does not support copying images.', { hint: 'Use Export → Share instead, then choose “Copy” or “Save Image”.' });
  }
  try {
    await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': new Blob([new Uint8Array(bytes)], { type: 'image/png' }) })]);
  } catch (e) {
    throw new AppError('unknown', `Copy failed: ${(e as Error).message}`, { hint: 'Use Export → Share instead.' });
  }
}

/** Uses a standard file input, which Capacitor routes to the native document picker. */
function pickTextFile(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    const done = () => input.remove();
    input.addEventListener('cancel', () => {
      done();
      resolve(null);
    });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      done();
      if (!file) return resolve(null);
      if (file.size > 512 * 1024 * 1024) return reject(new AppError('corrupted_project', 'Project file is too large.'));
      try {
        resolve({ name: file.name, text: await file.text() });
      } catch (e) {
        reject(new AppError('file_io', `Could not read ${file.name}: ${(e as Error).message}`));
      }
    });
    input.click();
  });
}

export function createCapacitorPlatform(): MobilePlatform {
  const native = Capacitor.isNativePlatform();
  const name = Capacitor.getPlatform() as MobilePlatform['name'];
  return {
    name,
    isNative: native,
    kv,
    files,
    secrets: native ? new NativeSecretStore() : new MemorySecretStore(),
    fetch: native ? createNativeFetch(CapacitorHttp as unknown as NativeHttpLike) : (url, init) => fetch(url, init),
    shareFile,
    copyPng,
    pickTextFile,
    async appVersion() {
      if (!native) return __APP_VERSION__;
      try {
        return (await App.getInfo()).version;
      } catch {
        return __APP_VERSION__;
      }
    },
  };
}
