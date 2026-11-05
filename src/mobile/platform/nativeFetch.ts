import type { FetchLike } from '@backend/providers/types';

/** Subset of Capacitor's CapacitorHttp plugin used here (injectable for tests). */
export interface NativeHttpLike {
  request(options: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    data?: unknown;
    responseType?: 'text' | 'json' | 'arraybuffer' | 'blob' | 'document';
    connectTimeout?: number;
    readTimeout?: number;
  }): Promise<{ status: number; headers: Record<string, string>; data: unknown; url: string }>;
}

function headersToRecord(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return { ...(h as Record<string, string>) };
}

/**
 * fetch() implemented on the native HTTP stack (CapacitorHttp). Native requests are not
 * subject to WebView CORS rules, which most image APIs do not allow for app origins.
 *
 * Request bodies are sent as strings: the providers only send JSON or text-only multipart
 * bodies, so Uint8Array bodies are UTF-8 decoded losslessly. Cancellation is handled by the
 * caller's abortable() wrapper (the native request may finish in the background).
 */
export function createNativeFetch(http: NativeHttpLike, timeoutMs = 600_000): FetchLike {
  return async (url, init = {}) => {
    const body = init.body;
    let data: string | undefined;
    if (typeof body === 'string') data = body;
    else if (body instanceof Uint8Array) data = new TextDecoder().decode(body);
    else if (body instanceof ArrayBuffer) data = new TextDecoder().decode(new Uint8Array(body));
    else if (body != null) throw new TypeError('Unsupported request body type for native fetch');

    const res = await http.request({
      url,
      method: (init.method ?? 'GET').toUpperCase(),
      headers: headersToRecord(init.headers),
      data,
      responseType: 'text',
      connectTimeout: 30_000,
      readTimeout: timeoutMs,
    });
    // Capacitor may already have parsed JSON responses into objects.
    const text = typeof res.data === 'string' ? res.data : res.data == null ? '' : JSON.stringify(res.data);
    const nullBody = res.status === 204 || res.status === 304;
    return new Response(nullBody ? null : text, { status: res.status, headers: res.headers });
  };
}
