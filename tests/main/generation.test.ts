import { describe, expect, it } from 'vitest';
import { DEFAULT_CONVERSION } from '../../src/core/pixelize';
import { DEFAULT_TECHNICAL } from '../../src/core/prompt/compose';
import { SPRITE_SIZES } from '../../src/core/sizes';
import { createImage } from '../../src/core/image';
import { GenerationService } from '../../src/main/generation';
import { ProviderService } from '../../src/main/providerService';
import { ProviderRegistry } from '../../src/main/providers/registry';
import { MockProvider } from '../../src/main/providers/mock';
import { OpenAIProvider } from '../../src/main/providers/openai';
import { SecretStore } from '../../src/main/secrets';
import { defaultPreferences } from '../../src/main/preferences';
import type { GenerationProvider } from '../../src/main/providers/types';
import type { GenerationRequest } from '../../src/shared/types';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const storage = { isEncryptionAvailable: () => false, encryptString: () => Buffer.alloc(0), decryptString: () => '' };

function setup(extra: GenerationProvider[] = []) {
  const prefs = defaultPreferences();
  const secrets = new SecretStore(join(mkdtempSync(join(tmpdir(), 'sg-')), 's.json'), storage, {});
  const providers = new ProviderService({
    registry: new ProviderRegistry([new MockProvider(), new OpenAIProvider(), ...extra]),
    secrets,
    getPrefs: () => prefs,
    updatePrefs: async () => prefs,
    fetch: async () => new Response('{}'),
  });
  return new GenerationService(providers, async () => new Response('{}'));
}

const req = (over: Partial<GenerationRequest> = {}): GenerationRequest => ({
  providerId: 'mock',
  prompt: '16-bit SNES-era slime, side view',
  negativePrompt: '',
  size: 32,
  transparent: true,
  seed: 1000,
  variations: 2,
  params: { latencyMs: 0 },
  technical: DEFAULT_TECHNICAL,
  conversion: DEFAULT_CONVERSION,
  ...over,
});

describe('GenerationService', () => {
  it('produces exact native sizes for every supported size with sequential seeds', async () => {
    const svc = setup();
    for (const size of SPRITE_SIZES) {
      const res = await svc.run(`job-${size}`, req({ size }), () => undefined);
      expect(res.variations).toHaveLength(2);
      for (const v of res.variations) expect([v.image.width, v.image.height]).toEqual([size, size]);
      expect(res.variations.map((v) => v.seed)).toEqual([1000, 1001]);
      expect(res.isMock).toBe(true);
      expect(res.composed.prompt.startsWith('16-bit SNES-era slime, side view.')).toBe(true);
    }
  });

  it('emits progress events through to done', async () => {
    const svc = setup();
    const stages: string[] = [];
    await svc.run('p', req(), (p) => stages.push(p.stage));
    expect(stages[0]).toBe('preparing');
    expect(stages).toContain('converting');
    expect(stages[stages.length - 1]).toBe('done');
  });

  it('validates input', async () => {
    const svc = setup();
    await expect(svc.run('a', req({ size: 24 as never }), () => undefined)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(svc.run('b', req({ prompt: '  ' }), () => undefined)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(svc.run('c', req({ variations: 9 }), () => undefined)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(svc.run('d', req({ seed: -1 }), () => undefined)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(svc.run('e', req({ providerId: 'nope' }), () => undefined)).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('fails fast with missing credentials for real providers', async () => {
    await expect(setup().run('k', req({ providerId: 'openai' }), () => undefined)).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('can be cancelled mid-generation', async () => {
    const svc = setup();
    const pending = svc.run('slow', req({ params: { latencyMs: 2000 }, variations: 4 }), () => undefined);
    setTimeout(() => svc.cancel('slow'), 50);
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(svc.isRunning('slow')).toBe(false);
  });

  it('rejects invalid images returned by a provider', async () => {
    const broken: GenerationProvider = {
      ...new MockProvider(),
      id: 'broken',
      displayName: 'Broken',
      isMock: false,
      capabilities: () => new MockProvider().capabilities(),
      testConnection: async () => 'ok',
      generate: async () => [{ image: { width: 64, height: 64, data: new Uint8ClampedArray(10) }, seed: 1 }],
    };
    const tiny: GenerationProvider = { ...broken, id: 'tiny', generate: async () => [{ image: createImage(4, 4), seed: 1 }] };
    const svc = setup([broken, tiny]);
    await expect(svc.run('x', req({ providerId: 'broken' }), () => undefined)).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(svc.run('y', req({ providerId: 'tiny' }), () => undefined)).rejects.toMatchObject({ code: 'unsupported_output' });
  });

  it('notes when a provider returns fewer images than requested', async () => {
    const few: GenerationProvider = { ...new MockProvider(), id: 'few', capabilities: () => new MockProvider().capabilities(), testConnection: async () => '', generate: async () => [{ image: createImage(512, 512, [9, 9, 9, 255]), seed: 1 }] };
    const res = await setup([few]).run('f', req({ providerId: 'few', variations: 3 }), () => undefined);
    expect(res.variations).toHaveLength(1);
    expect(res.warnings.join(' ')).toMatch(/returned 1/);
  });
});
