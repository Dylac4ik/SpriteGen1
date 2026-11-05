export type KeySource = 'keychain' | 'session' | 'env';

/**
 * Where API keys live. Desktop: Electron safeStorage (src/main/secrets.ts).
 * Mobile: iOS Keychain / Android Keystore (src/mobile/platform/secureStore.ts).
 * Implementations must never expose keys to UI code.
 */
export interface SecretStoreLike {
  /** True only when keys can be persisted with real OS-level protection. */
  canPersistSecurely(): boolean;
  backend(): string;
  set(name: string, value: string, persist: boolean): Promise<KeySource>;
  delete(name: string): Promise<void>;
  get(name: string, envVar?: string): Promise<{ value: string; source: KeySource } | null>;
}
