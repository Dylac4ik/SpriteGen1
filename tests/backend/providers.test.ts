import { describe, expect, it } from 'vitest';
import { createImage } from '../../src/core/image';
import { encodePng } from '../../src/backend/png';
import { OpenAIProvider } from '../../src/backend/providers/openai';
import { StabilityProvider } from '../../src/backend/providers/stability';
import { Automatic1111Provider } from '../../src/backend/providers/automatic1111';
import { MockProvider } from '../../src/backend/providers/mock';
import { mapHttpError } from '../../src/backend/providers/http';
import type { FetchLike, ProviderContext } from '../../src/backend/providers/types';

const pngB64 = (size = 1024) => Buffer.from(encodePng(createImage(size, size, [200, 30, 30, 255]))).toString('base64');

interface Call {
  url: string;
  init?: RequestInit;
}
function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function ctx(fetch: FetchLike, settings: Record<string, string | number | boolean>, apiKey: string | null = 'test-key'): ProviderContext & { progress: string[] } {
  const progress: string[] = [];
  return { apiKey, settings, fetch, signal: new AbortController().signal, onProgress: (_s, _c, _t, m) => progress.push(m), progress };
}
const input = (n = 2, seeds: (number | null)[] = [null, null]) => ({
  prompt: '16-bit knight. Single centered subject.',
  negativePrompt: null,
  size: 32 as const,
  transparent: true,
  seeds: seeds.slice(0, n),
  params: { quality: 'low' },
});

describe('OpenAI provider', () => {
  const p = new OpenAIProvider();
  const settings = { model: 'gpt-image-1', baseUrl: 'https://api.openai.com/v1', timeoutSec: 60 };

  it('sends the exact prompt with transparency and PNG output, and decodes images', async () => {
    const f = fakeFetch(() => json({ data: [{ b64_json: pngB64() }, { b64_json: pngB64() }] }));
    const out = await p.generate(input(2), ctx(f.fetch, settings));
    expect(out).toHaveLength(2);
    expect(out[0].image.width).toBe(1024);
    expect(out[0].seed).toBeNull();
    expect(f.calls[0].url).toBe('https://api.openai.com/v1/images/generations');
    const body = JSON.parse(String(f.calls[0].init!.body));
    expect(body).toMatchObject({ model: 'gpt-image-1', prompt: '16-bit knight. Single centered subject.', n: 2, background: 'transparent', output_format: 'png', quality: 'low' });
    expect((f.calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('declares no seed / no negative prompt support and native transparency', () => {
    const caps = p.capabilities(settings);
    expect(caps).toMatchObject({ supportsSeed: false, supportsNegativePrompt: false, supportsNativeTransparency: true });
    expect(p.capabilities({ ...settings, model: 'dall-e-3' }).supportsNativeTransparency).toBe(false);
  });

  it('requires an API key', async () => {
    const f = fakeFetch(() => json({}));
    await expect(p.generate(input(1), ctx(f.fetch, settings, null))).rejects.toMatchObject({ code: 'missing_credentials' });
    expect(f.calls).toHaveLength(0);
  });

  it('maps HTTP failures to actionable error codes', async () => {
    const cases: [number, unknown, string][] = [
      [401, { error: { message: 'Incorrect API key provided' } }, 'auth'],
      [429, { error: { message: 'Rate limit', code: 'rate_limit_exceeded' } }, 'rate_limit'],
      [429, { error: { message: 'You exceeded your current quota', code: 'insufficient_quota' } }, 'quota'],
      [400, { error: { message: 'Your request was rejected by our safety system', code: 'moderation_blocked' } }, 'content_policy'],
      [404, { error: { message: 'model not found' } }, 'model_not_found'],
      [503, { error: { message: 'overloaded' } }, 'provider_unavailable'],
    ];
    for (const [status, body, code] of cases) {
      const f = fakeFetch(() => json(body, status));
      await expect(p.generate(input(1), ctx(f.fetch, settings))).rejects.toMatchObject({ code });
    }
  });

  it('reports network failures and malformed responses', async () => {
    const down = fakeFetch(() => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    });
    await expect(p.generate(input(1), ctx(down.fetch, settings))).rejects.toMatchObject({ code: 'network' });
    const notJson = fakeFetch(() => new Response('<html>', { status: 200 }));
    await expect(p.generate(input(1), ctx(notJson.fetch, settings))).rejects.toMatchObject({ code: 'invalid_response' });
    const empty = fakeFetch(() => json({ data: [] }));
    await expect(p.generate(input(1), ctx(empty.fetch, settings))).rejects.toMatchObject({ code: 'invalid_response' });
    const jpeg = fakeFetch(() => json({ data: [{ b64_json: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64') }] }));
    await expect(p.generate(input(1), ctx(jpeg.fetch, settings))).rejects.toMatchObject({ code: 'unsupported_output' });
  });

  it('stops immediately when aborted', async () => {
    const f = fakeFetch(() => new Promise<Response>(() => undefined)); // never resolves
    const c = ctx(f.fetch, settings);
    const ac = new AbortController();
    const pending = p.generate(input(1), { ...c, signal: ac.signal });
    ac.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes through server-side revised prompts', async () => {
    const f = fakeFetch(() => json({ data: [{ b64_json: pngB64(), revised_prompt: 'A pixel knight, rewritten' }] }));
    const out = await p.generate(input(1), ctx(f.fetch, { ...settings, model: 'dall-e-3' }));
    expect(out[0].revisedPrompt).toBe('A pixel knight, rewritten');
    expect(JSON.parse(String(f.calls[0].init!.body))).toMatchObject({ response_format: 'b64_json', n: 1 });
  });

  it('refuses to send the API key over plain HTTP to a remote host', async () => {
    const f = fakeFetch(() => json({ data: [] }));
    await expect(p.generate(input(1), ctx(f.fetch, { ...settings, baseUrl: 'http://example.com/v1' }))).rejects.toMatchObject({ code: 'invalid_input', message: expect.stringMatching(/https/) });
    expect(f.calls).toHaveLength(0);
    const local = fakeFetch(() => json({ data: [{ b64_json: pngB64() }] }));
    await expect(p.generate(input(1), ctx(local.fetch, { ...settings, baseUrl: 'http://localhost:8080/v1' }))).resolves.toHaveLength(1);
  });

  it('tests the connection against the models endpoint', async () => {
    const f = fakeFetch(() => json({ id: 'gpt-image-1' }));
    await expect(p.testConnection(ctx(f.fetch, settings))).resolves.toMatch(/available/);
    expect(f.calls[0].url).toBe('https://api.openai.com/v1/models/gpt-image-1');
  });
});

describe('Stability provider', () => {
  const p = new StabilityProvider();
  const settings = { baseUrl: 'https://api.stability.ai', timeoutSec: 60 };

  it('sends one multipart request per seed with negative prompt and returns seeds', async () => {
    let n = 0;
    const f = fakeFetch(() => json({ image: pngB64(), finish_reason: 'SUCCESS', seed: 100 + n++ }));
    const out = await p.generate({ ...input(2, [100, 101]), negativePrompt: 'blurry', params: { service: 'core', stylePreset: '' } }, ctx(f.fetch, settings));
    expect(out.map((o) => o.seed)).toEqual([100, 101]);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0].url).toBe('https://api.stability.ai/v2beta/stable-image/generate/core');
    const body = new TextDecoder().decode(f.calls[0].init!.body as Uint8Array);
    expect(body).toContain('name="negative_prompt"\r\n\r\nblurry');
    expect(body).toContain('name="seed"\r\n\r\n100');
    expect(body).not.toContain('style_preset'); // not sent unless chosen
  });

  it('treats content filtering as a content-policy error', async () => {
    const f = fakeFetch(() => json({ image: pngB64(), finish_reason: 'CONTENT_FILTERED' }));
    await expect(p.generate({ ...input(1, [1]), params: {} }, ctx(f.fetch, settings))).rejects.toMatchObject({ code: 'content_policy' });
  });
});

describe('AUTOMATIC1111 provider', () => {
  const p = new Automatic1111Provider();
  const settings = { baseUrl: 'http://127.0.0.1:7860/', timeoutSec: 60 };

  it('sends batch txt2img with seed and size, parses all_seeds', async () => {
    const f = fakeFetch(() => json({ images: [pngB64(512), pngB64(512), pngB64(512)], info: JSON.stringify({ all_seeds: [7, 8] }) }));
    const out = await p.generate({ ...input(2, [7, 8]), negativePrompt: 'text', params: { workingSize: '512', steps: 20, cfgScale: 7, sampler: 'Euler a' } }, ctx(f.fetch, settings, null));
    expect(out).toHaveLength(2); // extra images ignored
    expect(out.map((o) => o.seed)).toEqual([7, 8]);
    expect(f.calls[0].url).toBe('http://127.0.0.1:7860/sdapi/v1/txt2img');
    expect(JSON.parse(String(f.calls[0].init!.body))).toMatchObject({ seed: 7, batch_size: 2, width: 512, height: 512, negative_prompt: 'text', steps: 20 });
  });

  it('gives a hint when the WebUI is not running', async () => {
    const f = fakeFetch(() => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    });
    await expect(p.testConnection(ctx(f.fetch, settings, null))).rejects.toMatchObject({ code: 'network', hint: expect.stringMatching(/--api/) });
  });

  it('rejects invalid base URLs', async () => {
    const f = fakeFetch(() => json({}));
    await expect(p.generate({ ...input(1, [1]), params: {} }, ctx(f.fetch, { baseUrl: 'file:///etc' }, null))).rejects.toMatchObject({ code: 'invalid_input' });
  });
});

describe('Mock provider', () => {
  const p = new MockProvider();
  it('is labeled as mock and deterministic per seed', async () => {
    expect(p.isMock).toBe(true);
    expect(p.displayName).toMatch(/not AI/);
    const f = fakeFetch(() => json({}));
    const a = await p.generate({ ...input(2, [5, 6]), params: { latencyMs: 0, simulateError: 'none' } }, ctx(f.fetch, {}));
    const b = await p.generate({ ...input(2, [5, 6]), params: { latencyMs: 0, simulateError: 'none' } }, ctx(f.fetch, {}));
    expect(Buffer.from(a[0].image.data).equals(Buffer.from(b[0].image.data))).toBe(true);
    expect(Buffer.from(a[0].image.data).equals(Buffer.from(a[1].image.data))).toBe(false);
    expect(f.calls).toHaveLength(0); // never touches the network
  });
  it('can simulate failures', async () => {
    const f = fakeFetch(() => json({}));
    for (const [mode, code] of [
      ['auth', 'auth'],
      ['network', 'network'],
      ['invalid_response', 'unsupported_output'],
    ]) {
      await expect(p.generate({ ...input(1, [1]), params: { latencyMs: 0, simulateError: mode } }, ctx(f.fetch, {}))).rejects.toMatchObject({ code });
    }
  });
});

describe('mapHttpError', () => {
  it('extracts messages from common error body shapes', () => {
    expect(mapHttpError(400, JSON.stringify({ name: 'bad_request', errors: ['prompt is required'] }), 'X').message).toMatch(/prompt is required/);
    expect(mapHttpError(422, JSON.stringify({ detail: 'bad sampler' }), 'X').message).toMatch(/bad sampler/);
    expect(mapHttpError(500, 'oops', 'X').code).toBe('provider_unavailable');
  });
});
