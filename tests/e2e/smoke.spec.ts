/**
 * End-to-end smoke test of the packaged renderer + main process using the Mock provider.
 * Run with `npm run test:e2e` (on Linux CI wrap it in `xvfb-run -a`).
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';

const shots = process.env.SPRITEGEN_SCREENSHOT_DIR;

let app: ElectronApplication;
let page: Page;
let work: string;

async function shot(name: string) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
}

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'spritegen-e2e-'));
  // SPRITEGEN_E2E_EXECUTABLE runs the suite against a packaged build (e.g. release/linux-unpacked/spritegen).
  const executable = process.env.SPRITEGEN_E2E_EXECUTABLE;
  app = await electron.launch({
    ...(executable ? { executablePath: executable, args: ['--no-sandbox'] } : { args: [resolve(__dirname, '../..'), '--no-sandbox'] }),
    env: {
      ...process.env,
      SPRITEGEN_USER_DATA: join(work, 'profile'),
      SPRITEGEN_E2E_DIR: join(work, 'out'),
      SPRITEGEN_E2E_OPEN: join(work, 'out', 'Untitled.spritegen'),
    },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1480, height: 920 });
  await page.waitForSelector('.app[aria-busy="false"]');
});

test.afterAll(async () => {
  if (!app) return;
  // Quitting with unsaved changes opens a native confirmation dialog (by design), so save first.
  if (await page.locator('.project-name').textContent().then((t) => t?.includes('•'))) {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.project-name')).not.toContainText('•');
  }
  await app.close();
});

test('mock provider is clearly labeled', async () => {
  await expect(page.locator('.provider-pill')).toHaveText(/MOCK provider — not AI/);
  await expect(page.locator('.notice.mock')).toContainText('not AI');
  await shot('01-empty');
});

test('missing style triggers a warning with suggestions before generation', async () => {
  await page.locator('textarea.prompt-input').fill('a red slime monster');
  await page.getByRole('button', { name: /^Generate/ }).click();
  const dialog = page.getByRole('dialog', { name: 'No style described' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add to prompt' }).first()).toBeVisible();
  await shot('02-style-warning');
  await dialog.getByRole('button', { name: 'Edit prompt' }).click();
  await expect(dialog).toBeHidden();
});

test('smart prompt viewer shows sections and the exact final prompt', async () => {
  await page.locator('textarea.prompt-input').fill('a red slime monster, 16-bit SNES-era pixel art, side view, idle, 1px black outline, lit from the top-left');
  await page.getByRole('radio', { name: '16×16 pixels' }).click();
  await page.getByRole('tab', { name: 'Prompt analysis' }).click();
  await expect(page.locator('.style-banner')).toContainText('concrete');
  await expect(page.getByTestId('final-prompt')).toHaveText(
    'a red slime monster, 16-bit SNES-era pixel art, side view, idle, 1px black outline, lit from the top-left. Single centered subject, fully in frame, clear silhouette that stays readable at 16x16 pixels, isolated on a transparent background.',
  );
  await shot('03-analysis');
});

test('generates variations at the exact native size', async () => {
  await page.getByRole('button', { name: /^Generate 4 variations/ }).click();
  await expect(page.locator('.history-card')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.variation')).toHaveCount(4);
  const dims = await page.locator('[data-testid="sprite-canvas"] canvas').first().evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(dims).toEqual([16, 16]);
  // display scaling must be nearest-neighbor
  const rendering = await page.locator('[data-testid="sprite-canvas"] canvas').first().evaluate((c) => getComputedStyle(c).imageRendering);
  expect(rendering).toBe('pixelated');
  await shot('04-generated');
});

test('filters: add, reorder, preview, save preset, undo', async () => {
  await page.getByRole('tab', { name: /Filters/ }).click();
  await page.getByLabel('Filter to add').selectOption('outline');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await page.getByLabel('Filter to add').selectOption('hueShift');
  await page.getByRole('button', { name: 'Add filter' }).click();
  await expect(page.locator('.filter-step')).toHaveCount(2);
  await page.getByRole('button', { name: 'Move Hue shift up' }).click();
  await expect(page.locator('.filter-title').first()).toHaveText('1. Hue shift');
  await page.getByLabel('New preset name').fill('Outline + hue');
  await page.getByRole('button', { name: 'Save stack' }).click();
  await expect(page.locator('.preset')).toHaveCount(1);
  await page.getByRole('button', { name: 'Before/after compare' }).click();
  await shot('05-filters-compare');
  await page.getByRole('button', { name: 'Before/after compare' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.filter-title').first()).toHaveText('1. Outline');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('.filter-title').first()).toHaveText('1. Hue shift');
});

test('pencil edit, undo and reset to original', async () => {
  const canvas = page.getByTestId('sprite-canvas');
  const box = (await canvas.boundingBox())!;
  const before = await page.locator('[data-testid="sprite-canvas"] canvas').nth(1).evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data));
  await page.keyboard.press('b');
  await page.mouse.click(box.x + 2, box.y + 2);
  const after = await page.locator('[data-testid="sprite-canvas"] canvas').nth(1).evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data));
  expect(after).not.toEqual(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  const undone = await page.locator('[data-testid="sprite-canvas"] canvas').nth(1).evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, 1, 1).data));
  expect(undone).toEqual(before);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.filter-step')).toHaveCount(0);
});

test('exports a correctly sized transparent PNG', async () => {
  await page.getByRole('button', { name: 'Export PNG…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export PNG' });
  await expect(dialog).toContainText('16×16 px');
  await dialog.getByRole('button', { name: 'Export…' }).click();
  await expect(page.locator('.toast.success').last()).toContainText('Exported 16×16 PNG (native size)');
  const path = (await page.locator('.toast.success').last().locator('.mono').textContent())!.trim();
  expect(existsSync(path)).toBe(true);
  const png = PNG.sync.read(readFileSync(path));
  expect([png.width, png.height]).toEqual([16, 16]);
  let transparent = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 0) transparent++;
  expect(transparent).toBeGreaterThan(0);
});

test('saves and reopens the project with history', async () => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast.success').last()).toContainText('Project saved');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(page.locator('.history-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open…' }).click();
  await expect(page.locator('.history-card')).toHaveCount(1);
  await expect(page.locator('.variation')).toHaveCount(4);
});

test('invalid credentials are reported with an actionable error', async () => {
  await page.getByLabel('Simulate failure').selectOption('auth');
  await page.getByRole('button', { name: /^Generate/ }).click();
  const banner = page.locator('.banner.error');
  await expect(banner).toContainText('simulated invalid API key', { timeout: 15_000 });
  await expect(banner.getByRole('button', { name: 'Open settings' })).toBeVisible();
  await shot('06-error');
  await banner.getByRole('button', { name: 'Dismiss' }).click();
  await page.getByLabel('Simulate failure').selectOption('none');
});

test('settings dialog shows provider configuration without exposing keys', async () => {
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('option', { name: /OpenAI Images/ }).click();
  await expect(dialog).toContainText('Needs API key');
  await expect(dialog.getByLabel('New API key')).toHaveAttribute('type', 'password');
  await shot('07-settings');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
});

test('copies the native sprite to the clipboard as PNG', async () => {
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.locator('.toast.success').last()).toContainText('Copied 16×16 sprite');
  const types = await app.evaluate(async ({ clipboard }) => {
    const c = clipboard as unknown as { read?: () => Promise<{ types: string[] }[]>; availableFormats?: () => string[] };
    if (c.read) return (await c.read()).flatMap((i) => i.types);
    return c.availableFormats?.() ?? [];
  });
  expect(types.some((t) => t.includes('image/png'))).toBe(true);
});

test('regenerate reproduces the same sprite from the stored seed', async () => {
  const pixels = () => page.locator('[data-testid="sprite-canvas"] canvas').first().evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).join(','));
  await page.locator('.history-card').first().click();
  const original = await pixels();
  await page.locator('.variations').getByRole('button', { name: 'Regenerate' }).click();
  await expect(page.locator('.history-card')).toHaveCount(2, { timeout: 30_000 });
  expect(await pixels()).toBe(original);
});

test('cancellation stops a running generation', async () => {
  await page.getByLabel(/Simulated latency/).fill('3000');
  await page.getByRole('button', { name: /^Generate/ }).click();
  await expect(page.locator('.banner.progress')).toBeVisible();
  await page.locator('.banner.progress').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.toast').last()).toContainText('Generation cancelled');
  await expect(page.locator('.history-card')).toHaveCount(2);
});
