import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createCapacitorPlatform } from './platform/capacitorPlatform';
import { createMobileBackend } from './platform/backend';
import { MobileApp } from './MobileApp';
import '@renderer/styles.css';
import './mobile.css';

async function boot() {
  const backend = await createMobileBackend(createCapacitorPlatform());
  // The shared UI store talks to `window.spriteGen`; on mobile it is the in-app backend.
  window.spriteGen = backend;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MobileApp backend={backend} />
    </StrictMode>,
  );
}

boot().catch((e) => {
  document.getElementById('root')!.textContent = `SpriteGen failed to start: ${(e as Error).message}`;
});
