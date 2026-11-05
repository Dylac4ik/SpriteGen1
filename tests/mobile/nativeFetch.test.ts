import { describe, expect, it } from 'vitest';
import { createNativeFetch, type NativeHttpLike } from '../../src/mobile/platform/nativeFetch';
import { encodeMultipart } from '../../src/backend/providers/multipart';

function fakeHttp(reply: { status: number; data: unknown; headers?: Record<string, string> }) {
  const calls: Parameters<NativeHttpLike['request']>[0][] = [];
  const http: NativeHttpLike = {
    request: async (o) => {
      calls.push(o);
      return { status: reply.status, data: reply.data, headers: reply.headers ?? { 'content-type': 'application/json' }, url: o.url };
    },
  };
  return { http, calls };
}

describe('native fetch adapter (CapacitorHttp)', () => {
  it('forwards method, headers and JSON bodies, and re-serializes parsed JSON responses', async () => {
    const { http, calls } = fakeHttp({ status: 200, data: { data: [{ b64_json: 'abc' }] } });
    const res = await createNativeFetch(http)('https://api.example.com/v1/x', { method: 'post', headers: { Authorization: 'Bearer k' }, body: '{"a":1}' });
    expect(calls[0]).toMatchObject({ url: 'https://api.example.com/v1/x', method: 'POST', headers: { Authorization: 'Bearer k' }, data: '{"a":1}', responseType: 'text' });
    expect(await res.json()).toEqual({ data: [{ b64_json: 'abc' }] });
  });

  it('sends text-only multipart bodies losslessly and preserves error statuses', async () => {
    const { http, calls } = fakeHttp({ status: 401, data: '{"error":{"message":"bad key"}}' });
    const { body, contentType } = encodeMultipart({ prompt: 'ドット絵の騎士 — pixel knight', seed: 5 }, 'B');
    const res = await createNativeFetch(http)('https://api.example.com', { method: 'POST', headers: { 'Content-Type': contentType }, body });
    expect(calls[0].data).toBe(new TextDecoder().decode(body));
    expect(String(calls[0].data)).toContain('ドット絵の騎士');
    expect(res.status).toBe(401);
    expect(res.ok).toBe(false);
    expect(await res.text()).toContain('bad key');
  });

  it('handles empty responses and rejects unsupported bodies', async () => {
    const { http } = fakeHttp({ status: 204, data: null });
    expect((await createNativeFetch(http)('https://x.test', {})).status).toBe(204);
    await expect(createNativeFetch(http)('https://x.test', { method: 'POST', body: new Blob(['x']) })).rejects.toThrow(/Unsupported/);
  });
});
