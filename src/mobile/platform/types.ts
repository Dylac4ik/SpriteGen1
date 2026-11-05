import type { SecretStoreLike } from '@backend/secrets';
import type { FetchLike } from '@backend/providers/types';

/** Key/value storage for non-secret data (preferences). */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface StoredFileInfo {
  name: string;
  size: number;
  mtime: number;
}

/** App-private file storage (projects, autosave). Paths are relative, '/'-separated. */
export interface FileStore {
  write(path: string, text: string): Promise<void>;
  read(path: string): Promise<string | null>;
  remove(path: string): Promise<void>;
  list(dir: string): Promise<StoredFileInfo[]>;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Everything the mobile backend needs from the device. The Capacitor implementation
 * (capacitorPlatform.ts) uses native plugins on Android/iOS and web fallbacks in a browser;
 * tests use an in-memory implementation.
 */
export interface MobilePlatform {
  name: 'android' | 'ios' | 'web';
  isNative: boolean;
  kv: KeyValueStore;
  files: FileStore;
  secrets: SecretStoreLike;
  fetch: FetchLike;
  /** Offers a file to the user via the OS share sheet (save to Files/Photos, send…) or a browser download. */
  shareFile(fileName: string, bytes: Uint8Array, mimeType: string): Promise<ShareOutcome>;
  /** Puts a PNG on the clipboard; throws if the platform cannot copy images. */
  copyPng(bytes: Uint8Array): Promise<void>;
  /** Lets the user pick a file from the device; resolves null when cancelled. */
  pickTextFile(accept: string): Promise<{ name: string; text: string } | null>;
  appVersion(): Promise<string>;
}
