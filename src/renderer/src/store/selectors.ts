import { useMemo } from 'react';
import type { RgbaImage } from '@core/image';
import { CachedPipeline } from '@core/pipeline';
import { analyzePrompt } from '@core/prompt/analyze';
import { composeFinalPrompt } from '@core/prompt/compose';
import type { GenerationRecord, VariationRecord } from '@shared/types';
import { currentProvider, useApp } from './appStore';

export function useSelected(): { record: GenerationRecord; variation: VariationRecord } | null {
  const selection = useApp((s) => s.selection);
  const history = useApp((s) => s.project.history);
  return useMemo(() => {
    if (!selection) return null;
    const record = history.find((r) => r.id === selection.recordId);
    const variation = record?.variations.find((v) => v.id === selection.variationId);
    return record && variation ? { record, variation } : null;
  }, [selection, history]);
}

const caches = new Map<string, CachedPipeline>();

/** Base pixels and the live filtered result for a variation (memoized per step). */
export function useDisplayImages(variation: VariationRecord | null | undefined): { base: RgbaImage; after: RgbaImage } | null {
  const showFilters = useApp((s) => s.editor.showFilters);
  return useMemo(() => {
    if (!variation) return null;
    let cache = caches.get(variation.id);
    if (!cache) {
      if (caches.size > 32) caches.clear();
      cache = new CachedPipeline();
      caches.set(variation.id, cache);
    }
    const after = showFilters && variation.pipeline.some((s) => s.enabled) ? cache.run(variation.current, variation.pipeline) : variation.current;
    return { base: variation.current, after };
  }, [variation, showFilters]);
}

export function useProvider() {
  const providers = useApp((s) => s.providers);
  const providerId = useApp((s) => s.providerId);
  return useMemo(() => currentProvider({ providers, providerId }), [providers, providerId]);
}

export function useAnalysis() {
  const prompt = useApp((s) => s.form.prompt);
  const negativePrompt = useApp((s) => s.form.negativePrompt);
  const size = useApp((s) => s.form.size);
  const transparent = useApp((s) => s.form.transparent);
  return useMemo(() => analyzePrompt({ prompt, negativePrompt, size, transparent }), [prompt, negativePrompt, size, transparent]);
}

export function useComposedPrompt() {
  const form = useApp((s) => s.form);
  const provider = useProvider();
  return useMemo(() => {
    if (!provider) return null;
    return composeFinalPrompt(
      { prompt: form.prompt, negativePrompt: form.negativePrompt, size: form.size, transparent: form.transparent, technical: form.technical },
      provider.capabilities,
    );
  }, [form.prompt, form.negativePrompt, form.size, form.transparent, form.technical, provider]);
}
