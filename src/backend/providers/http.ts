import { AppError, isAbortError } from '@shared/errors';
import type { FetchLike } from './types';

/** Rejects as soon as the signal aborts, even if the underlying fetch ignores the signal. */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

export function abortError(): Error {
  const e = new Error('The operation was aborted');
  e.name = 'AbortError';
  return e;
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return abortable(new Promise<void>((r) => setTimeout(r, ms)), signal);
}

function extractMessage(body: string): { message?: string; code?: string; name?: string } {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const err = j.error as Record<string, unknown> | string | undefined;
    if (err && typeof err === 'object') return { message: String(err.message ?? ''), code: err.code ? String(err.code) : undefined };
    if (typeof err === 'string') return { message: err };
    if (Array.isArray(j.errors)) return { message: j.errors.map(String).join('; '), name: j.name ? String(j.name) : undefined };
    if (typeof j.detail === 'string') return { message: j.detail };
    if (Array.isArray(j.detail)) return { message: JSON.stringify(j.detail).slice(0, 300) };
    if (typeof j.message === 'string') return { message: j.message, name: j.name ? String(j.name) : undefined };
  } catch {
    /* not JSON */
  }
  return { message: body.slice(0, 300) || undefined };
}

/** Maps an HTTP error response to a categorized, user-facing AppError. */
export function mapHttpError(status: number, body: string, provider: string): AppError {
  const { message, code, name } = extractMessage(body);
  const detail = message ? `: ${message}` : '';
  const policy = /content[_ ]policy|moderation|safety system|content_moderation|nsfw/i.test(`${code ?? ''} ${name ?? ''} ${message ?? ''}`);
  if (policy) return new AppError('content_policy', `${provider} rejected the prompt${detail}`, { status });
  if (status === 401) return new AppError('auth', `${provider} rejected the API key (401)${detail}`, { status });
  if (status === 403) return new AppError('auth', `${provider} denied access (403)${detail}`, { status });
  if (status === 402 || code === 'insufficient_quota' || code === 'billing_hard_limit_reached')
    return new AppError('quota', `${provider} account has insufficient credits${detail}`, { status });
  if (status === 404 || code === 'model_not_found') return new AppError('model_not_found', `${provider} could not find the endpoint or model (404)${detail}`, { status });
  if (status === 408 || status === 504) return new AppError('timeout', `${provider} timed out (${status})${detail}`, { status });
  if (status === 429) return new AppError('rate_limit', `${provider} is rate-limiting requests (429)${detail}`, { status });
  if (status >= 500) return new AppError('provider_unavailable', `${provider} service error (${status})${detail}`, { status });
  if (status === 400 || status === 413 || status === 422)
    return new AppError('invalid_input', `${provider} rejected the request (${status})${detail}`, { status, hint: 'Check the prompt and generation settings.' });
  return new AppError('unknown', `${provider} returned HTTP ${status}${detail}`, { status });
}

/** fetch wrapper that turns transport failures and non-2xx responses into AppErrors. Abort errors pass through. */
export async function httpRequest(fetchImpl: FetchLike, url: string, init: RequestInit, signal: AbortSignal, provider: string): Promise<Response> {
  let res: Response;
  try {
    res = await abortable(fetchImpl(url, { ...init, signal }), signal);
  } catch (e) {
    if (isAbortError(e) || signal.aborted) throw abortError();
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    const reason = cause?.code ?? cause?.message ?? (e as Error).message;
    throw new AppError('network', `Could not reach ${provider} (${reason}).`, { details: url });
  }
  if (!res.ok) {
    let body = '';
    try {
      body = (await abortable(res.text(), signal)).slice(0, 4000);
    } catch {
      /* ignore */
    }
    throw mapHttpError(res.status, body, provider);
  }
  return res;
}

export async function readJson<T = unknown>(res: Response, provider: string, signal: AbortSignal): Promise<T> {
  let text: string;
  try {
    text = await abortable(res.text(), signal);
  } catch (e) {
    if (isAbortError(e) || signal.aborted) throw abortError();
    throw new AppError('network', `Connection to ${provider} was interrupted while reading the response.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError('invalid_response', `${provider} returned a response that is not valid JSON.`, { details: text.slice(0, 200) });
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Validates a user-configured base URL. With `carriesApiKey`, plain HTTP is refused for any
 * host other than the local machine so an API key is never sent unencrypted over a network.
 */
export function validateBaseUrl(raw: unknown, provider: string, opts: { carriesApiKey?: boolean } = {}): string {
  const s = String(raw ?? '').trim();
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new AppError('invalid_input', `${provider} base URL "${s}" is not a valid URL.`, { hint: 'Fix it in Settings → Providers.' });
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new AppError('invalid_input', `${provider} base URL must use http or https.`);
  if (opts.carriesApiKey && u.protocol === 'http:' && !LOCAL_HOSTS.has(u.hostname)) {
    throw new AppError('invalid_input', `${provider} base URL must use https so your API key is not sent unencrypted.`, { hint: 'Change the URL to https:// in Settings → Providers.' });
  }
  return s.replace(/\/+$/, '');
}
