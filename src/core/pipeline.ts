import { RgbaImage } from './image';
import { FilterStep, applyFilter } from './filters';

/**
 * Applies enabled filter steps in order. The input image is never mutated; every
 * filter returns a new buffer, so the original/base sprite is always preserved.
 */
export function applyPipeline(img: RgbaImage, steps: readonly FilterStep[]): RgbaImage {
  let current = img;
  for (const step of steps) {
    if (!step.enabled) continue;
    current = applyFilter(current, step);
  }
  return current;
}

/**
 * Pipeline evaluator that memoizes intermediate results. When only a later step changes
 * (e.g. dragging its slider), earlier steps are not recomputed. Steps are compared by
 * reference, so callers must replace (not mutate) steps that change.
 */
export class CachedPipeline {
  private source: RgbaImage | null = null;
  private steps: FilterStep[] = [];
  private results: RgbaImage[] = [];

  run(img: RgbaImage, steps: readonly FilterStep[]): RgbaImage {
    if (img !== this.source) {
      this.source = img;
      this.steps = [];
      this.results = [];
    }
    let reuse = 0;
    while (reuse < steps.length && reuse < this.steps.length && steps[reuse] === this.steps[reuse]) reuse++;
    const nextSteps = steps.slice(0, reuse);
    const nextResults = this.results.slice(0, reuse);
    let current = reuse > 0 ? nextResults[reuse - 1] : img;
    for (let i = reuse; i < steps.length; i++) {
      const step = steps[i];
      if (step.enabled) current = applyFilter(current, step);
      nextSteps.push(step);
      nextResults.push(current);
    }
    this.steps = nextSteps;
    this.results = nextResults;
    return current;
  }
}
