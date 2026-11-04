export type AppErrorCode =
  | 'invalid_input'
  | 'missing_credentials'
  | 'auth'
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'quota'
  | 'provider_unavailable'
  | 'model_not_found'
  | 'content_policy'
  | 'invalid_response'
  | 'unsupported_output'
  | 'cancelled'
  | 'file_io'
  | 'corrupted_project'
  | 'secure_storage_unavailable'
  | 'unknown';

/** Serializable error shape sent across IPC. */
export interface AppErrorInfo {
  code: AppErrorCode;
  message: string;
  hint?: string;
  details?: string;
}

const DEFAULT_HINTS: Partial<Record<AppErrorCode, string>> = {
  missing_credentials: 'Open Settings → Providers and add an API key, or switch to the Mock provider.',
  auth: 'Check the API key in Settings → Providers. It may be invalid, revoked, or lack image permissions.',
  network: 'Check your internet connection, proxy or firewall, then retry.',
  timeout: 'The provider took too long. Retry, reduce variations, or raise the timeout in Settings.',
  rate_limit: 'The provider is rate-limiting requests. Wait a moment and retry.',
  quota: 'Your provider account is out of credits or quota. Check billing on the provider dashboard.',
  provider_unavailable: 'The provider service is unavailable right now. Retry later or switch provider.',
  model_not_found: 'The configured model name was not found. Check it in Settings → Providers.',
  content_policy: 'The provider rejected the prompt under its content policy. Rephrase the prompt.',
  invalid_response: 'The provider returned something SpriteGen could not use. Retry; if it persists, try another model.',
  unsupported_output: 'The provider returned an unsupported image format or size.',
  corrupted_project: 'The project file is damaged or not a SpriteGen project. Try another file or a backup.',
  secure_storage_unavailable: 'No OS keychain is available. The key can be kept for this session only, or provided via environment variable.',
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly hint?: string;
  readonly details?: string;
  readonly status?: number;

  constructor(code: AppErrorCode, message: string, opts: { hint?: string; details?: string; status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.hint = opts.hint ?? DEFAULT_HINTS[code];
    this.details = opts.details;
    this.status = opts.status;
  }

  toInfo(): AppErrorInfo {
    return { code: this.code, message: this.message, hint: this.hint, details: this.details };
  }
}

export function isAbortError(e: unknown): boolean {
  return !!e && typeof e === 'object' && ((e as { name?: string }).name === 'AbortError' || (e as { code?: string }).code === 'ABORT_ERR');
}

export function toErrorInfo(e: unknown): AppErrorInfo {
  if (e instanceof AppError) return e.toInfo();
  if (isAbortError(e)) return { code: 'cancelled', message: 'Generation was cancelled.' };
  const message = e instanceof Error ? e.message : String(e);
  return { code: 'unknown', message: message || 'Unexpected error', hint: 'Retry. If the problem persists, check the log output.' };
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppErrorInfo };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (e: unknown): Result<never> => ({ ok: false, error: toErrorInfo(e) });
