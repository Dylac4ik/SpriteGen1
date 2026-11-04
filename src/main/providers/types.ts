import type { RgbaImage } from '@core/image';
import type { SpriteSize } from '@core/sizes';
import type { ParamSpec, ParamValues } from '@core/params';
import type { GenerationStage, ProviderCapabilities } from '@shared/types';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ProviderContext {
  apiKey: string | null;
  /** Sanitized non-secret provider settings (model, base URL, ...). */
  settings: ParamValues;
  fetch: FetchLike;
  signal: AbortSignal;
  onProgress(stage: GenerationStage, completed: number, total: number, message: string): void;
}

export interface ProviderGenerateInput {
  /** Exact final prompt (already composed). */
  prompt: string;
  /** Exact negative prompt, or null when none / merged into the prompt. */
  negativePrompt: string | null;
  size: SpriteSize;
  transparent: boolean;
  /** One entry per requested variation; null when the provider does not support seeds. */
  seeds: (number | null)[];
  /** Sanitized provider-specific generation parameters. */
  params: ParamValues;
}

export interface RawProviderImage {
  image: RgbaImage;
  seed: number | null;
  /** Set when the backend rewrote the prompt server-side (e.g. dall-e-3 revised_prompt). */
  revisedPrompt?: string;
}

/**
 * Every generation backend implements this interface. Adding a backend means adding
 * one module here and registering it in registry.ts — no UI changes are needed, since
 * settings and generation controls are described declaratively with ParamSpec.
 */
export interface GenerationProvider {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  /** Placeholder providers that are not real AI must set this so the UI labels them. */
  readonly isMock: boolean;
  readonly requiresApiKey: boolean;
  readonly apiKeyEnvVar?: string;
  readonly docsUrl?: string;
  readonly settingsFields: ParamSpec[];
  capabilities(settings: ParamValues): ProviderCapabilities;
  /** Verifies connectivity and credentials. Resolves with a short status message; throws AppError. */
  testConnection(ctx: Omit<ProviderContext, 'onProgress'>): Promise<string>;
  generate(input: ProviderGenerateInput, ctx: ProviderContext): Promise<RawProviderImage[]>;
}

export const TIMEOUT_FIELD: Extract<ParamSpec, { kind: 'range' }> = {
  kind: 'range',
  key: 'timeoutSec',
  label: 'Request timeout',
  min: 10,
  max: 600,
  step: 5,
  default: 180,
  unit: 's',
  tooltip: 'Maximum time to wait for the whole generation before failing.',
};
