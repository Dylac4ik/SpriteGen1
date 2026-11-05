import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

/** Dev server only: allow Vite's inline React-refresh preamble and HMR websocket. */
function devCsp(): Plugin {
  return {
    name: 'spritegen-mobile-dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) => html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws: wss:"),
  };
}

/** Web build of the mobile app; Capacitor copies out/mobile into the Android/iOS projects. */
export default defineConfig({
  root: resolve(__dirname, 'src/mobile'),
  base: './',
  plugins: [react(), devCsp()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@backend': resolve(__dirname, 'src/backend'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'out/mobile'),
    emptyOutDir: true,
    target: ['es2022', 'chrome100', 'safari16'],
  },
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
