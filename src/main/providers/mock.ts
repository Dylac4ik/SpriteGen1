import { RgbaImage } from '@core/image';
import type { ParamSpec } from '@core/params';
import { resizeNearest } from '@core/resize';
import { proceduralSprite } from '@core/procedural';
import { hashString } from '@core/random';
import { AppError } from '@shared/errors';
import type { ProviderCapabilities } from '@shared/types';
import { decodePng } from '../png';
import { delay } from './http';
import type { GenerationProvider, ProviderContext, ProviderGenerateInput, RawProviderImage } from './types';

export const MOCK_WORKING_SIZE = 512;

/**
 * Simulates "model output" by enlarging the procedural sprite to the working size, so the
 * same conversion pipeline (quantize → nearest-neighbor downscale → alpha cleanup) runs
 * for mock and real providers.
 */
function simulateModelOutput(sprite: RgbaImage): RgbaImage {
  return resizeNearest(sprite, MOCK_WORKING_SIZE, MOCK_WORKING_SIZE);
}

/**
 * MOCK PROVIDER — NOT AI. Generates deterministic procedural placeholder sprites offline,
 * so the full workflow (prompting, conversion, editing, export) can be used and tested
 * without credentials. It honors seeds, transparency, a few color words and "outline"
 * in the negative prompt, but does not understand the subject.
 */
export class MockProvider implements GenerationProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock (offline placeholder — not AI)';
  readonly description =
    'Procedural, deterministic placeholder sprites generated locally. No network, no API key. Useful for trying the app and for tests. Output does NOT reflect your subject.';
  readonly isMock = true;
  readonly requiresApiKey = false;
  readonly settingsFields: ParamSpec[] = [];

  capabilities(): ProviderCapabilities {
    return {
      supportsSeed: true,
      supportsNegativePrompt: true,
      supportsNativeTransparency: true,
      maxVariations: 8,
      maxPromptLength: 8000,
      workingSize: MOCK_WORKING_SIZE,
      generationParams: [
        {
          kind: 'range',
          key: 'latencyMs',
          label: 'Simulated latency',
          min: 0,
          max: 3000,
          step: 50,
          default: 400,
          unit: 'ms',
          tooltip: 'Delay per variation, to exercise progress and cancellation.',
        },
        {
          kind: 'select',
          key: 'simulateError',
          label: 'Simulate failure',
          default: 'none',
          tooltip: 'Forces an error so you can see how failures are reported.',
          options: [
            { value: 'none', label: 'None' },
            { value: 'auth', label: 'Invalid credentials' },
            { value: 'network', label: 'Network failure' },
            { value: 'rate_limit', label: 'Rate limited' },
            { value: 'invalid_response', label: 'Corrupted image response' },
            { value: 'content_policy', label: 'Content policy rejection' },
          ],
        },
      ],
    };
  }

  async testConnection(): Promise<string> {
    return 'Mock provider is always available (offline, procedural placeholder output).';
  }

  async generate(input: ProviderGenerateInput, ctx: ProviderContext): Promise<RawProviderImage[]> {
    const latency = Number(input.params.latencyMs ?? 400);
    const simulate = String(input.params.simulateError ?? 'none');
    const total = input.seeds.length;
    const out: RawProviderImage[] = [];
    const grid = Math.min(input.size, 64);
    for (let i = 0; i < total; i++) {
      ctx.onProgress('requesting', i, total, `Mock: generating variation ${i + 1} of ${total}`);
      await delay(latency, ctx.signal);
      if (simulate !== 'none' && i === 0) {
        if (simulate === 'auth') throw new AppError('auth', 'Mock: simulated invalid API key (401).');
        if (simulate === 'network') throw new AppError('network', 'Mock: simulated network failure (ECONNRESET).');
        if (simulate === 'rate_limit') throw new AppError('rate_limit', 'Mock: simulated rate limit (429).');
        if (simulate === 'content_policy') throw new AppError('content_policy', 'Mock: simulated content-policy rejection.');
        if (simulate === 'invalid_response') decodePng(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e]), 'Mock response');
      }
      const seed = input.seeds[i] ?? hashString(`${input.prompt}#${i}`);
      const sprite = proceduralSprite({
        prompt: input.prompt,
        negativePrompt: input.negativePrompt ?? '',
        seed,
        grid,
        transparent: input.transparent,
      });
      out.push({ image: simulateModelOutput(sprite), seed: input.seeds[i] });
      ctx.onProgress('receiving', i + 1, total, `Mock: variation ${i + 1} of ${total} ready`);
    }
    return out;
  }
}
