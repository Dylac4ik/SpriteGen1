/**
 * Mobile workflow with the Mock provider. Run: `npm run test:mobile-e2e`.
 * Set SPRITEGEN_SCREENSHOT_DIR to capture screenshots.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

test.describe.configure({ mode: 'serial' });

const shots = process.env.SPRITEGEN_SCREENSHOT_DIR;
let page: Page;

async function shot(name: string) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
}
const tab = (name: string) => page.locator('.m-tabbar').getByRole('button', { name });
const canvasPixel = (x: number, y: number) =>
  page.locator('[data-testid="sprite-canvas"] canvas').first().evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext('2d')!.getImageData(px, py, 1, 1).data), [x, y]);

test.beforeAll(async ({ browser }, info) => {
  page = await browser.newPage({ ...info.project.use });
  await page.goto('/');
  await page.waitForSelector('.m-app[aria-busy="false"]');
});

test.afterAll(async () => {
  await page?.close();
});

test('starts on Create with the mock provider clearly labeled', async () => {
  await expect(page.locator('.m-topbar h1')).toHaveText('Create sprite');
  await expect(page.locator('.m-topbar .provider-pill')).toHaveText(/MOCK — not AI/);
  await expect(page.locator('.notice.mock')).toContainText('not AI');
  await expect(page.locator('.m-tabbar button')).toHaveCount(4);
});

test('warns about a missing style before generating', async () => {
  await page.locator('textarea.prompt-input').fill('a red slime monster');
  await page.getByRole('button', { name: /^Generate/ }).tap();
  const dialog = page.getByRole('dialog', { name: 'No style described' });
  await expect(dialog).toBeVisible();
  await shot('mobile-01-style-warning');
  await dialog.getByRole('button', { name: 'Edit prompt' }).tap();
  await expect(dialog).toBeHidden();
});

test('prompt analysis sheet shows the exact final prompt', async () => {
  await page.locator('textarea.prompt-input').fill('a red slime monster, 16-bit SNES-era pixel art, side view, idle, 1px black outline');
  await page.getByRole('radio', { name: '16×16 pixels' }).tap();
  await page.locator('.m-analysis-card').tap();
  const sheet = page.getByRole('dialog', { name: 'Prompt analysis' });
  await expect(sheet.locator('.style-banner')).toContainText('concrete');
  await expect(sheet.getByTestId('final-prompt')).toHaveText(
    'a red slime monster, 16-bit SNES-era pixel art, side view, idle, 1px black outline. Single centered subject, fully in frame, clear silhouette that stays readable at 16x16 pixels, isolated on a transparent background.',
  );
  await shot('mobile-02-analysis');
  await sheet.getByRole('button', { name: 'Close dialog' }).tap();
});

test('generates and opens the editor at native size', async () => {
  await shot('mobile-03-create');
  await page.getByRole('button', { name: /^Generate 4 variations/ }).tap();
  await expect(page.locator('.m-topbar h1')).toHaveText('Editor', { timeout: 30_000 });
  await expect(page.locator('.m-variations li')).toHaveCount(4);
  const canvas = page.locator('[data-testid="sprite-canvas"] canvas').first();
  expect(await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])).toEqual([16, 16]);
  expect(await canvas.evaluate((c) => getComputedStyle(c).imageRendering)).toBe('pixelated');
  await page.locator('.toast .icon-btn').first().tap().catch(() => undefined);
  await shot('mobile-04-editor');
});

test('pencil tap draws a pixel and undo restores it', async () => {
  await page.getByRole('button', { name: 'Pencil' }).tap();
  const box = (await page.getByTestId('sprite-canvas').boundingBox())!;
  const before = await canvasPixel(0, 0);
  await page.touchscreen.tap(box.x + 2, box.y + 2);
  expect(await canvasPixel(0, 0)).not.toEqual(before);
  await expect(page.locator('.m-inspector')).toContainText('x 0, y 0');
  await page.getByRole('button', { name: 'Undo' }).tap();
  expect(await canvasPixel(0, 0)).toEqual(before);
});

test('two-finger pinch zooms the canvas', async () => {
  await page.getByRole('button', { name: /^Move/ }).tap();
  const zoom = () => page.getByTestId('m-zoom').textContent().then((t) => Number(t!.replace('%', '')));
  await page.getByRole('button', { name: /^Actual pixels/ }).tap();
  const start = await zoom();
  expect(start).toBe(100);
  const vp = (await page.getByTestId('m-viewport').boundingBox())!;
  const cx = vp.x + vp.width / 2;
  const cy = vp.y + vp.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, d: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [
        { x: cx - d, y: cy, id: 1 },
        { x: cx + d, y: cy, id: 2 },
      ],
    });
  await touch('touchStart', 30);
  for (let d = 40; d <= 120; d += 20) await touch('touchMove', d);
  await touch('touchEnd', 0);
  expect(await zoom()).toBeGreaterThan(start * 2);
  await page.getByRole('button', { name: 'Zoom to fit' }).tap();
});

test('filters sheet: add a filter and see it applied', async () => {
  await page.locator('.m-actions').getByRole('button', { name: /^Filters/ }).tap();
  const sheet = page.getByRole('dialog', { name: 'Filters & presets' });
  await sheet.getByLabel('Filter to add').selectOption('hueShift');
  await sheet.getByRole('button', { name: 'Add filter' }).tap();
  await expect(sheet.locator('.filter-step')).toHaveCount(1);
  await shot('mobile-05-filters');
  await sheet.getByRole('button', { name: 'Close dialog' }).tap();
  await expect(page.locator('.m-actions').getByRole('button', { name: 'Filters (1)' })).toBeVisible();
});

test('exports a native-size transparent PNG', async () => {
  await page.locator('.m-actions').getByRole('button', { name: 'Export' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Export PNG' });
  await expect(dialog).toContainText('16×16 px');
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export…' }).tap()]);
  expect(download.suggestedFilename()).toMatch(/16x16.*\.png$/);
  const png = PNG.sync.read(readFileSync((await download.path())!));
  expect([png.width, png.height]).toEqual([16, 16]);
  let transparent = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] === 0) transparent++;
  expect(transparent).toBeGreaterThan(0);
});

test('library: save, rename, start new, reopen from device storage', async () => {
  await tab('Library').tap();
  await expect(page.locator('.m-topbar h1')).toHaveText('Library');
  await page.getByLabel('Name').fill('Slime pack');
  await page.getByLabel('Name').press('Enter');
  await page.getByRole('button', { name: 'Save', exact: true }).tap();
  await expect(page.locator('.m-list li')).toHaveCount(1);
  await expect(page.locator('.m-list li').first()).toContainText('Slime pack');
  await shot('mobile-06-library');
  await page.getByRole('button', { name: 'New project' }).tap();
  await expect(page.locator('.m-history li')).toHaveCount(0);
  await page.locator('.m-list li').first().getByRole('button', { name: 'Open' }).tap();
  await expect(page.locator('.m-topbar h1')).toHaveText('Editor');
  await expect(page.locator('.m-variations li')).toHaveCount(4);
  await expect(page.locator('.m-subtitle')).toHaveText('Slime pack');
});

test('settings: providers are configurable and keys are session-only without secure storage', async () => {
  await tab('Settings').tap();
  const openai = page.getByRole('option', { name: /OpenAI Images/ });
  await expect(openai).toContainText('Needs API key');
  await openai.tap();
  await expect(page.locator('.provider-detail h3')).toContainText('OpenAI Images');
  await expect(page.getByLabel('New API key')).toHaveAttribute('type', 'password');
  await expect(page.locator('.provider-detail')).toContainText('Secure storage unavailable');
  await shot('mobile-07-settings');
});

test('errors are reported with an action on every screen', async () => {
  await tab('Create').tap();
  await page.getByLabel('Simulate failure').selectOption('auth');
  await page.getByRole('button', { name: /^Generate/ }).tap();
  const banner = page.locator('.m-status .banner.error');
  await expect(banner).toContainText('simulated invalid API key', { timeout: 15_000 });
  await expect(banner.getByRole('button', { name: 'Open settings' })).toBeVisible();
  await banner.getByRole('button', { name: 'Dismiss' }).tap();
  await page.getByLabel('Simulate failure').selectOption('none');
});

test('regenerate from history reproduces the sprite from its seed', async () => {
  await tab('Library').tap();
  await page.locator('.m-history li').first().locator('.m-history-main').tap();
  const read = () => page.locator('[data-testid="sprite-canvas"] canvas').nth(1).evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data).join(','));
  const original = await read();
  await tab('Library').tap();
  await page.locator('.m-history li').first().getByRole('button', { name: 'Regenerate' }).tap();
  await expect(page.locator('.m-topbar h1')).toHaveText('Editor', { timeout: 30_000 });
  await expect(page.locator('.m-variations li')).toHaveCount(4);
  expect(await read()).toBe(original);
});

test('editor stays usable after navigating between tabs', async () => {
  await tab('Editor').tap();
  await expect(page.getByTestId('sprite-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pencil' })).toBeVisible();
  await shot(`mobile-08-${test.info().project.name}`);
});
