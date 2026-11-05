import { describe, expect, it } from 'vitest';
import { createImage } from '../../src/core/image';
import { DEFAULT_CONVERSION } from '../../src/core/pixelize';
import { DEFAULT_TECHNICAL } from '../../src/core/prompt/compose';
import { decodePng } from '../../src/backend/png';
import { MemorySecretStore } from '../../src/backend/memorySecrets';
import { AUTOSAVE_FILE, PREFS_KEY, createMobileBackend, projectFileName } from '../../src/mobile/platform/backend';
import type { MobilePlatform } from '../../src/mobile/platform/types';
import type { GenerationRequest, ProjectData } from '../../src/shared/types';

function memoryPlatform(overrides: Partial<MobilePlatform> = {}) {
  const kv = new Map<string, string>();
  const files = new Map<string, { text: string; mtime: number }>();
  const shared: { fileName: string; bytes: Uint8Array; mimeType: string }[] = [];
  const copied: Uint8Array[] = [];
  let clock = 1;
  const platform: MobilePlatform = {
    name: 'web',
    isNative: false,
    kv: { get: async (k) => kv.get(k) ?? null, set: async (k, v) => void kv.set(k, v), remove: async (k) => void kv.delete(k) },
    files: {
      write: async (p, text) => void files.set(p, { text, mtime: clock++ }),
      read: async (p) => files.get(p)?.text ?? null,
      remove: async (p) => void files.delete(p),
      list: async (dir) =>
        [...files.entries()].filter(([p]) => p.startsWith(`${dir}/`)).map(([p, f]) => ({ name: p.slice(dir.length + 1), size: f.text.length, mtime: f.mtime })),
    },
    secrets: new MemorySecretStore(),
    fetch: async () => new Response('{}'),
    shareFile: async (fileName, bytes, mimeType) => {
      shared.push({ fileName, bytes, mimeType });
      return 'downloaded';
    },
    copyPng: async (bytes) => void copied.push(bytes),
    pickTextFile: async () => null,
    appVersion: async () => '9.9.9',
    ...overrides,
  };
  return { platform, kv, files, shared, copied };
}

const request = (over: Partial<GenerationRequest> = {}): GenerationRequest => ({
  providerId: 'mock',
  prompt: '16-bit SNES-era slime, side view',
  negativePrompt: '',
  size: 16,
  transparent: true,
  seed: 7,
  variations: 2,
  params: { latencyMs: 0 },
  technical: DEFAULT_TECHNICAL,
  conversion: DEFAULT_CONVERSION,
  ...over,
});

async function sampleProject(name: string, api: Awaited<ReturnType<typeof createMobileBackend>>): Promise<ProjectData> {
  const res = await api.generate('job-' + name, request());
  if (!res.ok) throw new Error(res.error.message);
  const r = res.value;
  return {
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    history: [
      {
        id: 'g1',
        createdAt: '2026-01-01T00:00:00.000Z',
        providerId: r.providerId,
        providerName: r.providerName,
        isMock: r.isMock,
        request: request(),
        finalPrompt: r.composed.prompt,
        finalNegativePrompt: r.composed.negativePrompt,
        promptNotes: r.warnings,
        variations: r.variations.map((v, i) => ({ id: `v${i}`, index: i, seed: v.seed, original: v.image, current: v.image, pipeline: [], notes: v.notes, sourceWidth: v.sourceWidth, sourceHeight: v.sourceHeight })),
      },
    ],
  };
}

describe('mobile backend', () => {
  it('runs the shared generation backend in-app and reports progress', async () => {
    const { platform } = memoryPlatform();
    const api = await createMobileBackend(platform);
    const stages: string[] = [];
    api.onGenerationProgress((p) => stages.push(p.stage));
    const res = await api.generate('j1', request());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.isMock).toBe(true);
    expect(res.value.variations.map((v) => [v.image.width, v.image.height])).toEqual([
      [16, 16],
      [16, 16],
    ]);
    expect(stages).toContain('done');
    const info = await api.getAppInfo();
    expect(info).toMatchObject({ platform: 'web', version: '9.9.9', secureStorage: { available: false } });
  });

  it('persists preferences and recovers from corrupted ones', async () => {
    const { platform, kv } = memoryPlatform();
    const api = await createMobileBackend(platform);
    const res = await api.setPreferences({ theme: 'dark' });
    expect(res.ok && res.value.theme).toBe('dark');
    expect(JSON.parse(kv.get(PREFS_KEY)!).theme).toBe('dark');
    kv.set(PREFS_KEY, '{nope');
    const again = await createMobileBackend(platform);
    const prefs = await again.getPreferences();
    expect(prefs.warning).toMatch(/reset/);
    expect(prefs.prefs.theme).toBe('system');
  });

  it('saves, lists, renames, copies and reopens projects without overwriting others', async () => {
    const { platform } = memoryPlatform();
    const api = await createMobileBackend(platform);
    const project = await sampleProject('Knight', api);

    const first = await api.saveProject(project, { path: null, saveAs: false });
    expect(first.ok && first.value?.path).toBe('Knight.spritegen');
    // a different, unsaved project with the same name must not overwrite the first
    const other = await api.saveProject({ ...project, history: [] }, { path: null, saveAs: false });
    expect(other.ok && other.value?.path).toBe('Knight 2.spritegen');
    // rename = save under the new name and remove the old file
    const renamed = await api.saveProject({ ...project, name: 'Hero' }, { path: 'Knight.spritegen', saveAs: false });
    expect(renamed.ok && renamed.value?.path).toBe('Hero.spritegen');
    const copy = await api.saveProject({ ...project, name: 'Hero' }, { path: 'Hero.spritegen', saveAs: true });
    expect(copy.ok && copy.value?.path).toBe('Hero copy.spritegen');

    const list = await api.listProjects();
    expect(list.ok && list.value.map((p) => p.name).sort()).toEqual(['Hero', 'Hero copy', 'Knight 2']);
    const opened = await api.openStoredProject('Hero.spritegen');
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.value.path).toBe('Hero.spritegen');
    expect(opened.value.project.history[0].variations).toHaveLength(2);
    expect(opened.value.project.history[0].variations[0].current.width).toBe(16);

    expect((await api.deleteStoredProject('Hero copy.spritegen')).ok).toBe(true);
    expect((await api.listProjects()).ok).toBe(true);
  });

  it('rejects project ids that could escape the projects folder', async () => {
    const { platform } = memoryPlatform();
    const api = await createMobileBackend(platform);
    for (const id of ['../secrets.spritegen', 'a/b.spritegen', '.hidden.spritegen', 'notes.txt']) {
      expect(await api.openStoredProject(id)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
      expect(await api.deleteStoredProject(id)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    }
    expect(projectFileName('a/b:c*?')).toBe('a_b_c_.spritegen');
    expect(projectFileName('   ')).toBe('Untitled.spritegen');
  });

  it('autosaves, restores, and discards a corrupted autosave', async () => {
    const { platform, files } = memoryPlatform();
    const api = await createMobileBackend(platform);
    const project = await sampleProject('Auto', api);
    expect((await api.autosaveProject(project, 'Auto.spritegen')).ok).toBe(true);
    const restored = await api.loadAutosave();
    expect(restored.ok && restored.value?.path).toBe('Auto.spritegen');
    files.set(AUTOSAVE_FILE, { text: 'garbage', mtime: 0 });
    expect(await api.loadAutosave()).toMatchObject({ ok: false, error: { code: 'corrupted_project' } });
    expect(files.has(AUTOSAVE_FILE)).toBe(false);
  });

  it('imports a picked project file and reports corrupt ones', async () => {
    const seed = memoryPlatform();
    const api0 = await createMobileBackend(seed.platform);
    const project = await sampleProject('Import me', api0);
    await api0.saveProject(project, { path: null, saveAs: false });
    const text = seed.files.get('projects/Import me.spritegen')!.text;

    let picked: { name: string; text: string } | null = { name: 'Shared pack.spritegen', text };
    const { platform } = memoryPlatform({ pickTextFile: async () => picked });
    const api = await createMobileBackend(platform);
    const res = await api.openProject();
    expect(res.ok && res.value).toMatchObject({ path: null, project: { name: 'Shared pack' } });
    picked = { name: 'bad.spritegen', text: '{"format":"other"}' };
    expect(await api.openProject()).toMatchObject({ ok: false, error: { code: 'corrupted_project' } });
    picked = null;
    expect(await api.openProject()).toEqual({ ok: true, value: null });
  });

  it('exports native-size PNGs and sprite sheets through the share sheet', async () => {
    const { platform, shared, copied } = memoryPlatform();
    const api = await createMobileBackend(platform);
    const img = createImage(32, 32, [10, 20, 30, 255]);
    const res = await api.exportPng({ image: img, scale: 1, suggestedName: 'hero' });
    expect(res.ok && res.value).toMatchObject({ width: 32, height: 32 });
    expect(shared[0]).toMatchObject({ fileName: 'hero.png', mimeType: 'image/png' });
    expect(decodePng(shared[0].bytes).width).toBe(32);
    const big = await api.exportPng({ image: img, scale: 4, suggestedName: 'hero' });
    expect(big.ok && big.value).toMatchObject({ width: 128 });
    expect(shared[1].fileName).toBe('hero@4x.png');
    const sheet = await api.exportSpriteSheet({ images: [img, img, img], columns: 3, scale: 1, suggestedName: 'walk' });
    expect(sheet.ok && sheet.value).toMatchObject({ width: 96, height: 32 });
    expect((await api.copyImage(img, 1)).ok).toBe(true);
    expect(decodePng(copied[0]).height).toBe(32);
    expect(await api.exportPng({ image: createImage(24, 24), scale: 1, suggestedName: 'x' })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
  });

  it('keeps API keys out of persistent storage when no secure store exists', async () => {
    const { platform, kv, files } = memoryPlatform();
    const api = await createMobileBackend(platform);
    expect(await api.setApiKey('openai', 'sk-test', true)).toMatchObject({ ok: false, error: { code: 'secure_storage_unavailable' } });
    const res = await api.setApiKey('openai', 'sk-test', false);
    expect(res.ok && res.value.apiKey).toEqual({ present: true, source: 'session', envVar: 'OPENAI_API_KEY' });
    const everything = JSON.stringify([...kv.values(), ...[...files.values()].map((f) => f.text)]);
    expect(everything).not.toContain('sk-test');
  });
});
