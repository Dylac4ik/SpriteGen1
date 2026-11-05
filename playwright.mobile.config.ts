import { defineConfig } from '@playwright/test';

/**
 * Mobile UI end-to-end tests: the mobile web build (the same bundle Capacitor ships in the
 * Android/iOS apps) in Chromium with phone/tablet touch emulation. Native-only plugins fall
 * back to their web implementations (IndexedDB storage, download instead of share sheet).
 */
export default defineConfig({
  testDir: 'tests/mobile-e2e',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --config vite.mobile.config.ts --host 127.0.0.1',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
});
