import type { ParamSpec, ParamValues } from '@core/params';
import { AppError } from '@shared/errors';
import type { ProviderCapabilities } from '@shared/types';
import { decodeBase64Png } from '../png';
import { encodeMultipart } from './multipart';
import { httpRequest, joinUrl, readJson, validateBaseUrl } from './http';
import { TIMEOUT_FIELD, type GenerationProvider, type ProviderContext, type ProviderGenerateInput, type RawProviderImage } from './types';

interface StabilityResponse {
  image?: string;
  finish_reason?: string;
  seed?: number | string;
}

/** Stability AI Stable Image (v2beta) — supports seeds and negative prompts; no native transparency. */
export class StabilityProvider implements GenerationProvider {
  readonly id = 'stability';
  readonly displayName = 'Stability AI (Stable Image)';
  readonly description = 'Stability AI Stable Image Core/Ultra REST API. Supports seeds and negative prompts. Transparency is produced by background removal during conversion.';
  readonly isMock = false;
  readonly requiresApiKey = true;
  readonly apiKeyEnvVar = 'STABILITY_API_KEY';
  readonly docsUrl = 'https://platform.stability.ai/docs/api-reference';
  readonly settingsFields: ParamSpec[] = [
    { kind: 'text' as const, key: 'baseUrl', label: 'API base URL', default: 'https://api.stability.ai', maxLength: 300 },
    TIMEOUT_FIELD,
  ];

  capabilities(_settings: ParamValues): ProviderCapabilities {
    return {
      supportsSeed: true,
      supportsNegativePrompt: true,
      supportsNativeTransparency: false,
      maxVariations: 8,
      maxPromptLength: 10000,
      workingSize: 1024,
      generationParams: [
        {
          kind: 'select',
          key: 'service',
          label: 'Service',
          default: 'core',
          options: [
            { value: 'core', label: 'Stable Image Core' },
            { value: 'ultra', label: 'Stable Image Ultra' },
          ],
        },
        {
          kind: 'select',
          key: 'stylePreset',
          label: 'Style preset (Core only)',
          default: '',
          tooltip: 'Optional Stability preset. Nothing is sent unless you choose one.',
          options: [
            { value: '', label: 'None (prompt only)' },
            { value: 'pixel-art', label: 'pixel-art' },
            { value: 'fantasy-art', label: 'fantasy-art' },
            { value: 'comic-book', label: 'comic-book' },
            { value: 'anime', label: 'anime' },
          ],
        },
      ],
    };
  }

  private requireKey(ctx: { apiKey: string | null }): string {
    if (!ctx.apiKey) throw new AppError('missing_credentials', 'No Stability AI API key configured.');
    return ctx.apiKey;
  }

  async testConnection(ctx: Omit<ProviderContext, 'onProgress'>): Promise<string> {
    const key = this.requireKey(ctx);
    const base = validateBaseUrl(ctx.settings.baseUrl, 'Stability AI', { carriesApiKey: true });
    await httpRequest(ctx.fetch, joinUrl(base, 'v1/user/account'), { headers: { Authorization: `Bearer ${key}` } }, ctx.signal, 'Stability AI');
    return 'Connected. API key accepted by Stability AI.';
  }

  async generate(input: ProviderGenerateInput, ctx: ProviderContext): Promise<RawProviderImage[]> {
    const key = this.requireKey(ctx);
    const base = validateBaseUrl(ctx.settings.baseUrl, 'Stability AI', { carriesApiKey: true });
    const service = input.params.service === 'ultra' ? 'ultra' : 'core';
    const total = input.seeds.length;
    const out: RawProviderImage[] = [];
    for (let i = 0; i < total; i++) {
      ctx.onProgress('requesting', i, total, `Requesting variation ${i + 1} of ${total} from Stability AI…`);
      const seed = input.seeds[i];
      const { body, contentType } = encodeMultipart({
        prompt: input.prompt,
        negative_prompt: input.negativePrompt ?? undefined,
        aspect_ratio: '1:1',
        output_format: 'png',
        // Stability accepts seeds in [0, 4294967294].
        seed: seed === null ? undefined : Math.min(seed, 4294967294),
        style_preset: service === 'core' && input.params.stylePreset ? String(input.params.stylePreset) : undefined,
      });
      const res = await httpRequest(
        ctx.fetch,
        joinUrl(base, `v2beta/stable-image/generate/${service}`),
        { method: 'POST', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': contentType }, body },
        ctx.signal,
        'Stability AI',
      );
      const json = await readJson<StabilityResponse>(res, 'Stability AI', ctx.signal);
      if (json.finish_reason === 'CONTENT_FILTERED') throw new AppError('content_policy', 'Stability AI filtered the result under its content policy.');
      if (!json.image) throw new AppError('invalid_response', 'Stability AI response contained no image.');
      const returnedSeed = json.seed !== undefined ? Number(json.seed) : seed;
      out.push({ image: decodeBase64Png(json.image, 'Stability AI image'), seed: Number.isFinite(returnedSeed) ? (returnedSeed as number) : seed });
      ctx.onProgress('receiving', i + 1, total, `Received ${i + 1} of ${total}`);
    }
    return out;
  }
}
