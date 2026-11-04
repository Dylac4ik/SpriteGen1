import { ParamValues, sanitizeParams } from '@core/params';
import { AppError } from '@shared/errors';
import type { Preferences, ProviderDescriptor } from '@shared/types';
import type { ProviderRegistry } from './providers/registry';
import type { FetchLike, GenerationProvider } from './providers/types';
import type { SecretStore } from './secrets';

export interface ProviderServiceDeps {
  registry: ProviderRegistry;
  secrets: SecretStore;
  getPrefs(): Preferences;
  updatePrefs(patch: Partial<Preferences>): Promise<Preferences>;
  fetch: FetchLike;
}

const secretName = (providerId: string) => `apiKey:${providerId}`;

export class ProviderService {
  constructor(private readonly deps: ProviderServiceDeps) {}

  require(id: string): GenerationProvider {
    const p = this.deps.registry.get(id);
    if (!p) throw new AppError('invalid_input', `Unknown provider "${id}".`);
    return p;
  }

  settingsFor(p: GenerationProvider): ParamValues {
    return sanitizeParams(p.settingsFields, this.deps.getPrefs().providerSettings[p.id] ?? {});
  }

  async apiKeyFor(p: GenerationProvider): Promise<{ value: string; source: 'keychain' | 'session' | 'env' } | null> {
    if (!p.requiresApiKey) return null;
    return this.deps.secrets.get(secretName(p.id), p.apiKeyEnvVar);
  }

  async describe(p: GenerationProvider): Promise<ProviderDescriptor> {
    const settings = this.settingsFor(p);
    const key = await this.apiKeyFor(p);
    return {
      id: p.id,
      displayName: p.displayName,
      description: p.description,
      isMock: p.isMock,
      requiresApiKey: p.requiresApiKey,
      apiKey: { present: !!key, source: key?.source ?? null, envVar: p.apiKeyEnvVar },
      settingsFields: p.settingsFields,
      settings,
      capabilities: p.capabilities(settings),
      docsUrl: p.docsUrl,
    };
  }

  async list(): Promise<ProviderDescriptor[]> {
    return Promise.all(this.deps.registry.list().map((p) => this.describe(p)));
  }

  async saveSettings(id: string, raw: unknown): Promise<ProviderDescriptor> {
    const p = this.require(id);
    const settings = sanitizeParams(p.settingsFields, raw);
    const prefs = this.deps.getPrefs();
    await this.deps.updatePrefs({ providerSettings: { ...prefs.providerSettings, [id]: settings } });
    return this.describe(p);
  }

  async setApiKey(id: string, key: string | null, persist: boolean): Promise<ProviderDescriptor> {
    const p = this.require(id);
    if (!p.requiresApiKey) throw new AppError('invalid_input', `${p.displayName} does not use an API key.`);
    if (key === null) await this.deps.secrets.delete(secretName(id));
    else await this.deps.secrets.set(secretName(id), key, persist);
    return this.describe(p);
  }

  async test(id: string): Promise<string> {
    const p = this.require(id);
    const key = await this.apiKeyFor(p);
    if (p.requiresApiKey && !key) throw new AppError('missing_credentials', `No API key configured for ${p.displayName}.`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await p.testConnection({ apiKey: key?.value ?? null, settings: this.settingsFor(p), fetch: this.deps.fetch, signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) throw new AppError('timeout', `${p.displayName} did not respond within 20 seconds.`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
