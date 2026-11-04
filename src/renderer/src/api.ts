import type { SpriteGenApi } from '@shared/ipc';

/** Typed access to the preload bridge. Throws a clear error if the app is opened outside Electron. */
export function api(): SpriteGenApi {
  const a = window.spriteGen;
  if (!a) throw new Error('SpriteGen bridge is unavailable. Start the app with "npm run dev" or the packaged build.');
  return a;
}
