import type { GenerationProvider } from './types';
import { MockProvider } from './mock';
import { OpenAIProvider } from './openai';
import { StabilityProvider } from './stability';
import { Automatic1111Provider } from './automatic1111';

export class ProviderRegistry {
  private readonly providers = new Map<string, GenerationProvider>();

  constructor(list: GenerationProvider[]) {
    for (const p of list) this.providers.set(p.id, p);
  }

  get(id: string): GenerationProvider | undefined {
    return this.providers.get(id);
  }

  list(): GenerationProvider[] {
    return [...this.providers.values()];
  }
}

export function createDefaultRegistry(): ProviderRegistry {
  return new ProviderRegistry([new MockProvider(), new OpenAIProvider(), new StabilityProvider(), new Automatic1111Provider()]);
}
