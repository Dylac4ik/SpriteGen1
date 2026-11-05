import type { ParamSpec, ParamValues } from '@core/params';
import { AppError } from '@shared/errors';
import type { ProviderCapabilities } from '@shared/types';
import { decodeBase64Png, decodePng } from '../png';
import { httpRequest, joinUrl, readJson, validateBaseUrl } from './http';
import { TIMEOUT_FIELD, type GenerationProvider, type ProviderContext, type ProviderGenerateInput, type RawProviderImage } from './types';

interface OpenAIImageResponse {
  data?: { b64_json?: string; url?: string; revised_prompt?: string }[];
}

const isGptImage = (model: string) => /^gpt-image/i.test(model);

/**
 * OpenAI Images API (POST /v1/images/generations). Default model gpt-image-1, which
 * supports native transparent backgrounds. No seed or negative-prompt support.
 */
export class OpenAIProvider implements GenerationProvider {
  readonly id = 'openai';
  readonly displayName = 'OpenAI Images';
  readonly description = 'OpenAI image generation (gpt-image-1 by default). Supports native transparency. Seeds are not supported, so results are not reproducible.';
  readonly isMock = false;
  readonly requiresApiKey = true;
  readonly apiKeyEnvVar = 'OPENAI_API_KEY';
  readonly docsUrl = 'https://platform.openai.com/docs/guides/image-generation';
  readonly settingsFields: ParamSpec[] = [
    { kind: 'text' as const, key: 'model', label: 'Model', default: 'gpt-image-1', maxLength: 64, tooltip: 'e.g. gpt-image-1, dall-e-3' },
    { kind: 'text' as const, key: 'baseUrl', label: 'API base URL', default: 'https://api.openai.com/v1', maxLength: 300 },
    TIMEOUT_FIELD,
  ];

  capabilities(settings: ParamValues): ProviderCapabilities {
    const model = String(settings.model || 'gpt-image-1');
    const gpt = isGptImage(model);
    return {
      supportsSeed: false,
      supportsNegativePrompt: false,
      supportsNativeTransparency: gpt,
      maxVariations: 8,
      maxPromptLength: gpt ? 32000 : model === 'dall-e-2' ? 1000 : 4000,
      workingSize: 1024,
      generationParams: gpt
        ? [
            {
              kind: 'select',
              key: 'quality',
              label: 'Quality',
              default: 'medium',
              tooltip: 'Higher quality is slower and costs more.',
              options: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'auto', label: 'Auto' },
              ],
            },
          ]
        : model === 'dall-e-3'
          ? [
              {
                kind: 'select',
                key: 'quality',
                label: 'Quality',
                default: 'standard',
                options: [
                  { value: 'standard', label: 'Standard' },
                  { value: 'hd', label: 'HD' },
                ],
              },
            ]
          : [],
    };
  }

  private requireKey(ctx: { apiKey: string | null }): string {
    if (!ctx.apiKey) throw new AppError('missing_credentials', 'No OpenAI API key configured.');
    return ctx.apiKey;
  }

  async testConnection(ctx: Omit<ProviderContext, 'onProgress'>): Promise<string> {
    const key = this.requireKey(ctx);
    const model = String(ctx.settings.model || 'gpt-image-1');
    const base = validateBaseUrl(ctx.settings.baseUrl, 'OpenAI', { carriesApiKey: true });
    await httpRequest(ctx.fetch, joinUrl(base, `models/${encodeURIComponent(model)}`), { headers: { Authorization: `Bearer ${key}` } }, ctx.signal, 'OpenAI');
    return `Connected. Model "${model}" is available to this key.`;
  }

  async generate(input: ProviderGenerateInput, ctx: ProviderContext): Promise<RawProviderImage[]> {
    const key = this.requireKey(ctx);
    const model = String(ctx.settings.model || 'gpt-image-1');
    const base = validateBaseUrl(ctx.settings.baseUrl, 'OpenAI', { carriesApiKey: true });
    const gpt = isGptImage(model);
    const total = input.seeds.length;
    // dall-e-3 only accepts n=1; gpt-image-1 accepts up to 10 per request.
    const perRequest = gpt ? total : model === 'dall-e-3' ? 1 : total;
    const out: RawProviderImage[] = [];
    while (out.length < total) {
      const n = Math.min(perRequest, total - out.length);
      ctx.onProgress('requesting', out.length, total, `Requesting ${n} image${n > 1 ? 's' : ''} from OpenAI (${model})…`);
      const body: Record<string, unknown> = { model, prompt: input.prompt, n, size: '1024x1024' };
      if (gpt) {
        body.background = input.transparent ? 'transparent' : 'opaque';
        body.output_format = 'png';
        if (input.params.quality) body.quality = input.params.quality;
      } else {
        body.response_format = 'b64_json';
        if (input.params.quality) body.quality = input.params.quality;
      }
      const res = await httpRequest(
        ctx.fetch,
        joinUrl(base, 'images/generations'),
        { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        ctx.signal,
        'OpenAI',
      );
      const json = await readJson<OpenAIImageResponse>(res, 'OpenAI', ctx.signal);
      if (!json || !Array.isArray(json.data) || json.data.length === 0) {
        throw new AppError('invalid_response', 'OpenAI response contained no images.');
      }
      for (const item of json.data.slice(0, n)) {
        const revisedPrompt = typeof item.revised_prompt === 'string' && item.revised_prompt.trim() ? item.revised_prompt : undefined;
        if (item.b64_json) out.push({ image: decodeBase64Png(item.b64_json, 'OpenAI image'), seed: null, revisedPrompt });
        else if (item.url) {
          const imgRes = await httpRequest(ctx.fetch, item.url, {}, ctx.signal, 'OpenAI');
          out.push({ image: decodePng(new Uint8Array(await imgRes.arrayBuffer()), 'OpenAI image'), seed: null, revisedPrompt });
        } else throw new AppError('invalid_response', 'OpenAI returned an image entry without data.');
        ctx.onProgress('receiving', out.length, total, `Received ${out.length} of ${total}`);
      }
      if (json.data.length < n) break; // provider returned fewer than requested; service reports it
    }
    return out;
  }
}
