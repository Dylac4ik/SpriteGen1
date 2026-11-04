import type { ParamSpec, ParamValues } from '@core/params';
import { AppError } from '@shared/errors';
import type { ProviderCapabilities } from '@shared/types';
import { decodeBase64Png } from '../png';
import { httpRequest, joinUrl, readJson, validateBaseUrl } from './http';
import { TIMEOUT_FIELD, type GenerationProvider, type ProviderContext, type ProviderGenerateInput, type RawProviderImage } from './types';

interface Txt2ImgResponse {
  images?: string[];
  info?: string;
}

/**
 * Local Stable Diffusion via the AUTOMATIC1111 / Forge WebUI REST API (start it with --api).
 * No API key; supports seeds, negative prompts and custom working sizes. Pair it with a
 * pixel-art checkpoint or LoRA for best results.
 */
export class Automatic1111Provider implements GenerationProvider {
  readonly id = 'automatic1111';
  readonly displayName = 'Local Stable Diffusion (AUTOMATIC1111 / Forge API)';
  readonly description = 'Your own Stable Diffusion WebUI running with --api. Supports seeds and negative prompts; transparency via background removal.';
  readonly isMock = false;
  readonly requiresApiKey = false;
  readonly docsUrl = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API';
  readonly settingsFields: ParamSpec[] = [
    { kind: 'text' as const, key: 'baseUrl', label: 'WebUI URL', default: 'http://127.0.0.1:7860', maxLength: 300 },
    { ...TIMEOUT_FIELD, default: 300 },
  ];

  capabilities(_settings: ParamValues): ProviderCapabilities {
    return {
      supportsSeed: true,
      supportsNegativePrompt: true,
      supportsNativeTransparency: false,
      maxVariations: 8,
      maxPromptLength: 8000,
      workingSize: 512,
      generationParams: [
        {
          kind: 'select',
          key: 'workingSize',
          label: 'Working resolution',
          default: '512',
          tooltip: 'Resolution the model renders at before pixel conversion.',
          options: [
            { value: '512', label: '512×512 (SD 1.5)' },
            { value: '768', label: '768×768' },
            { value: '1024', label: '1024×1024 (SDXL)' },
          ],
        },
        { kind: 'range', key: 'steps', label: 'Steps', min: 1, max: 150, step: 1, default: 25 },
        { kind: 'range', key: 'cfgScale', label: 'CFG scale', min: 1, max: 30, step: 0.5, default: 7, tooltip: 'Prompt adherence.' },
        { kind: 'text', key: 'sampler', label: 'Sampler', default: 'Euler a', maxLength: 64 },
      ],
    };
  }

  async testConnection(ctx: Omit<ProviderContext, 'onProgress'>): Promise<string> {
    const base = validateBaseUrl(ctx.settings.baseUrl, 'Stable Diffusion WebUI');
    try {
      const res = await httpRequest(ctx.fetch, joinUrl(base, 'sdapi/v1/sd-models'), {}, ctx.signal, 'Stable Diffusion WebUI');
      const models = await readJson<unknown[]>(res, 'Stable Diffusion WebUI', ctx.signal);
      return `Connected. ${Array.isArray(models) ? models.length : 0} model(s) available.`;
    } catch (e) {
      if (e instanceof AppError && (e.code === 'network' || e.code === 'model_not_found')) {
        throw new AppError(e.code, e.message, { hint: 'Start the WebUI with the --api flag and check the URL in Settings.' });
      }
      throw e;
    }
  }

  async generate(input: ProviderGenerateInput, ctx: ProviderContext): Promise<RawProviderImage[]> {
    const base = validateBaseUrl(ctx.settings.baseUrl, 'Stable Diffusion WebUI');
    const total = input.seeds.length;
    const ws = Number(input.params.workingSize ?? 512);
    ctx.onProgress('requesting', 0, total, `Rendering ${total} image(s) at ${ws}×${ws} on local WebUI…`);
    const res = await httpRequest(
      ctx.fetch,
      joinUrl(base, 'sdapi/v1/txt2img'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          negative_prompt: input.negativePrompt ?? '',
          seed: input.seeds[0] ?? -1,
          steps: Number(input.params.steps ?? 25),
          cfg_scale: Number(input.params.cfgScale ?? 7),
          sampler_name: String(input.params.sampler || 'Euler a'),
          width: ws,
          height: ws,
          batch_size: total,
          n_iter: 1,
        }),
      },
      ctx.signal,
      'Stable Diffusion WebUI',
    );
    const json = await readJson<Txt2ImgResponse>(res, 'Stable Diffusion WebUI', ctx.signal);
    if (!json || !Array.isArray(json.images) || json.images.length === 0) throw new AppError('invalid_response', 'WebUI response contained no images.');
    let seeds: number[] = [];
    try {
      const info = json.info ? JSON.parse(json.info) : null;
      if (info && Array.isArray(info.all_seeds)) seeds = info.all_seeds.map(Number);
    } catch {
      /* info is optional */
    }
    // Extra images (e.g. ControlNet previews or grids) are ignored; keep the first `total`.
    return json.images.slice(0, total).map((b64, i) => {
      ctx.onProgress('receiving', i + 1, total, `Received ${i + 1} of ${total}`);
      return { image: decodeBase64Png(b64, `WebUI image ${i + 1}`), seed: Number.isFinite(seeds[i]) ? seeds[i] : input.seeds[i] };
    });
  }
}
