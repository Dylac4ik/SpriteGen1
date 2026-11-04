import type { SpriteGenApi } from '@shared/ipc';

declare global {
  interface Window {
    spriteGen: SpriteGenApi;
  }
}
export {};
