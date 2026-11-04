import { sanitizeParams } from '@core/params';
import { pixelize } from '@core/pixelize';
import { composeFinalPrompt } from '@core/prompt/compose';
import { variationSeed } from '@core/random';
import { assertValidImage } from '@core/image';
import { AppError, isAbortError } from '@shared/errors';
import type { GenerationProgress, GenerationRequest, GenerationResult, GeneratedVariation } from '@shared/types';
import { formatZodError, generationRequestSchema } from '@shared/schemas';
import type { ProviderService } from './providerService';
import type { FetchLike } from './providers/types';

interface Job {
  controller: AbortController;
  reason: 'cancel' | 'timeout' | null;
}

/**
 * Orchestrates one generation: validate input → compose exact prompt → call provider →
 * validate returned images → convert each to the exact native size → return results.
 */
export class GenerationService {
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly providers: ProviderService,
    private readonly fetchImpl: FetchLike,
  ) {}

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    job.reason = 'cancel';
    job.controller.abort();
    return true;
  }

  isRunning(jobId: string): boolean {
    return this.jobs.has(jobId);
  }

  async run(jobId: string, raw: unknown, onProgress: (p: GenerationProgress) => void): Promise<GenerationResult> {
    if (typeof jobId !== 'string' || !jobId || jobId.length > 64) throw new AppError('invalid_input', 'Invalid job id.');
    if (this.jobs.has(jobId)) throw new AppError('invalid_input', 'A job with this id is already running.');
    const parsed = generationRequestSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('invalid_input', `Invalid generation settings: ${formatZodError(parsed.error)}`);
    const req = parsed.data as GenerationRequest;

    const provider = this.providers.require(req.providerId);
    const settings = this.providers.settingsFor(provider);
    const caps = provider.capabilities(settings);
    if (req.variations > caps.maxVariations) {
      throw new AppError('invalid_input', `${provider.displayName} supports at most ${caps.maxVariations} variations.`);
    }
    const key = await this.providers.apiKeyFor(provider);
    if (provider.requiresApiKey && !key) {
      throw new AppError('missing_credentials', `No API key configured for ${provider.displayName}.`);
    }

    const composed = composeFinalPrompt(req, caps);
    if (composed.tooLong) throw new AppError('invalid_input', composed.notes[composed.notes.length - 1]);
    const seeds = Array.from({ length: req.variations }, (_, i) => (caps.supportsSeed ? variationSeed(req.seed, i) : null));
    const params = sanitizeParams(caps.generationParams, req.params);
    const warnings: string[] = [...composed.notes];
    if (!caps.supportsSeed) warnings.push(`${provider.displayName} does not support seeds; the seed is recorded but results are not reproducible.`);

    const job: Job = { controller: new AbortController(), reason: null };
    this.jobs.set(jobId, job);
    const timeoutMs = Math.max(10, Number(settings.timeoutSec ?? 180)) * 1000;
    const timer = setTimeout(() => {
      job.reason = 'timeout';
      job.controller.abort();
    }, timeoutMs);
    const started = Date.now();
    const progress = (stage: GenerationProgress['stage'], completed: number, total: number, message: string) =>
      onProgress({ jobId, stage, completed, total, message });

    try {
      progress('preparing', 0, req.variations, `Preparing request for ${provider.displayName}…`);
      const rawImages = await provider.generate(
        { prompt: composed.prompt, negativePrompt: composed.negativePrompt, size: req.size, transparent: req.transparent, seeds, params },
        { apiKey: key?.value ?? null, settings, fetch: this.fetchImpl, signal: job.controller.signal, onProgress: progress },
      );
      if (job.controller.signal.aborted) throw new Error('aborted');
      if (!Array.isArray(rawImages) || rawImages.length === 0) throw new AppError('invalid_response', `${provider.displayName} returned no images.`);
      const revised = [...new Set(rawImages.map((r) => r.revisedPrompt).filter((p): p is string => !!p && p !== composed.prompt))];
      for (const p of revised.slice(0, 3)) warnings.push(`${provider.displayName} rewrote the prompt server-side to: "${p.slice(0, 600)}"`);
      if (rawImages.length < req.variations) warnings.push(`Requested ${req.variations} variations but ${provider.displayName} returned ${rawImages.length}.`);

      const variations: GeneratedVariation[] = [];
      for (let i = 0; i < rawImages.length; i++) {
        progress('converting', i, rawImages.length, `Converting variation ${i + 1} to ${req.size}×${req.size}…`);
        const { image: src, seed } = rawImages[i];
        try {
          assertValidImage(src, `Variation ${i + 1}`);
        } catch (e) {
          throw new AppError('invalid_response', `${provider.displayName} returned an invalid image: ${(e as Error).message}`);
        }
        if (src.width < 8 || src.height < 8) throw new AppError('unsupported_output', `${provider.displayName} returned a ${src.width}×${src.height} image, which is too small.`);
        const { image, notes } = pixelize(
          src,
          { targetSize: req.size, transparentRequested: req.transparent, providerHasNativeTransparency: caps.supportsNativeTransparency },
          req.conversion,
        );
        if (image.width !== req.size || image.height !== req.size) throw new AppError('invalid_response', 'Pixel conversion produced the wrong size.');
        variations.push({ index: i, seed, image, sourceWidth: src.width, sourceHeight: src.height, notes });
        // Yield so cancellation and progress events can be processed between conversions.
        await new Promise((r) => setImmediate(r));
        if (job.controller.signal.aborted) throw new Error('aborted');
      }
      progress('done', variations.length, variations.length, 'Done');
      return {
        jobId,
        providerId: provider.id,
        providerName: provider.displayName,
        isMock: provider.isMock,
        composed,
        variations,
        durationMs: Date.now() - started,
        warnings,
      };
    } catch (e) {
      if (job.reason === 'cancel') throw new AppError('cancelled', 'Generation was cancelled.');
      if (job.reason === 'timeout') throw new AppError('timeout', `${provider.displayName} did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
      if (isAbortError(e)) throw new AppError('cancelled', 'Generation was cancelled.');
      throw e;
    } finally {
      clearTimeout(timer);
      this.jobs.delete(jobId);
    }
  }
}
