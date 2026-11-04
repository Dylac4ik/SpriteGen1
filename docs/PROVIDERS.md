# Generation providers

All backends implement `GenerationProvider` (`src/main/providers/types.ts`) and are registered in `src/main/providers/registry.ts`. The UI is generated from each provider's declarations, so adding one needs no renderer changes.

```ts
interface GenerationProvider {
  id: string;
  displayName: string;
  description: string;
  isMock: boolean;                 // true ⇒ UI labels it "MOCK — not AI"
  requiresApiKey: boolean;
  apiKeyEnvVar?: string;           // optional env-var fallback, e.g. OPENAI_API_KEY
  docsUrl?: string;
  settingsFields: ParamSpec[];     // non-secret settings (model, base URL, timeoutSec…)
  capabilities(settings): ProviderCapabilities; // seeds? negative prompt? native alpha? working size? controls
  testConnection(ctx): Promise<string>;         // throws AppError on failure
  generate(input, ctx): Promise<RawProviderImage[]>;
}
```

`generate` receives:

- the **exact final prompt** and negative prompt, already composed and validated
- one seed per variation, or `null` when seeds are unsupported
- sanitized params
- a context object with the API key (main process only), settings, an injectable `fetch`, an `AbortSignal` and an `onProgress` callback

It returns decoded `RgbaImage`s at any working resolution. `GenerationService` does the rest: validation, conversion to the native size, notes and errors.

## Built-in providers

| id | Endpoint | Notes |
| --- | --- | --- |
| `mock` | — (local) | Procedural placeholder, **not AI**. Deterministic per seed. Has *Simulated latency* and *Simulate failure* controls to exercise progress, cancellation and error handling. |
| `openai` | `POST {baseUrl}/images/generations` | Sends `model`, `prompt`, `n`, `size: 1024x1024`, and for `gpt-image-*` models `background: transparent/opaque`, `output_format: png` and `quality`. `dall-e-*` models use `response_format: b64_json` with n=1 per request for dall-e-3. A server-side `revised_prompt` is shown to the user. There is no seed or negative-prompt field; the negative prompt is merged as "Avoid: …". |
| `stability` | `POST {baseUrl}/v2beta/stable-image/generate/{core\|ultra}` | `multipart/form-data` with `prompt`, `negative_prompt`, `aspect_ratio: 1:1`, `output_format: png`, `seed`, and an optional `style_preset` (Core only, never sent by default). One request per variation. `finish_reason: CONTENT_FILTERED` maps to `content_policy`. |
| `automatic1111` | `POST {baseUrl}/sdapi/v1/txt2img` | `prompt`, `negative_prompt`, `seed`, `steps`, `cfg_scale`, `sampler_name`, `width/height` (working size 512/768/1024) and `batch_size`. Seeds come back from `info.all_seeds`; extra images such as grids are ignored. Requires the WebUI started with `--api`. |

All HTTP goes through `httpRequest()` (`src/main/providers/http.ts`). It maps transport errors to `network`, non-2xx responses to categorized `AppError`s, and makes every request abortable. In the app, `fetch` is Electron's `net.fetch`, which honors the system proxy and certificate settings.

## Adding a provider

1. Create `src/main/providers/myprovider.ts` that implements `GenerationProvider`. Decode images with `decodePng` / `decodeBase64Png` from `../png`, which validate the format and dimensions.
2. Declare honest capabilities. If the backend can't do something (seeds, negative prompt, alpha), say so: the UI and prompt composer adapt, and the user is told.
3. Add it to `createDefaultRegistry()`.
4. Add tests modeled on `tests/main/providers.test.ts`. Use a fake `fetch` to check the request shape, response parsing and error mapping.

Never hard-code keys. If the provider needs a key, set `requiresApiKey: true` and `apiKeyEnvVar`. The settings dialog then offers secure storage automatically.
