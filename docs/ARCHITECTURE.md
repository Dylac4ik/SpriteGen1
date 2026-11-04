# Architecture

SpriteGen is an Electron desktop app written in TypeScript. It has four layers with one-way dependencies:

```
renderer (React UI) ──IPC via preload──▶ main (Electron)
        │                                   │
        └────────────── core ◀──────────────┘   (pure TS, shared)
                         ▲
                       shared (types, IPC contract, zod schemas, errors)
```

## Layers

| Layer | Path | Responsibility | May import |
| --- | --- | --- | --- |
| Core | `src/core` | Image model (`RgbaImage`), nearest-neighbor/dominant-color resizing, quantization, dithering, filters + pipeline, pixel conversion (`pixelize`), prompt lexicon/analysis/composition, sprite sheets, editing primitives, procedural mock sprites. **No Node, DOM or Electron APIs**, so it runs in both processes and in tests. | nothing outside core |
| Shared | `src/shared` | Cross-process types, the `SpriteGenApi` IPC contract and channel names, zod validation schemas, `AppError` / `Result`. | core |
| Main | `src/main` | Window, native menu, IPC handlers, generation orchestration, providers, PNG codec, secret storage, preferences, project files, export, clipboard. | core, shared, Node, Electron |
| Preload | `src/preload` | Exposes `window.spriteGen` through `contextBridge`. Contains no logic. | shared, Electron renderer APIs |
| Renderer | `src/renderer` | React UI and zustand store. Talks to main only via `window.spriteGen`. | core, shared, DOM |

## Generation flow

```
LeftPanel "Generate"
  └─ store.generate()
       ├─ analyzePrompt()          → blocks on errors; style missing/vague → StyleWarningDialog
       ├─ credential check          → actionable "missing credentials" banner
       └─ api.generate(jobId, request) ──IPC──▶ GenerationService.run()
                                                 ├─ zod-validate request (sizes, seed, lengths…)
                                                 ├─ resolve provider + settings + API key (SecretStore)
                                                 ├─ composeFinalPrompt()  ← same function the prompt viewer uses
                                                 ├─ provider.generate(…, {signal, onProgress})
                                                 │     └─ HTTP via Electron net.fetch → decodePng() validation
                                                 ├─ per image: assertValidImage → pixelize() → exact N×N check
                                                 └─ Result<GenerationResult> (never throws across IPC)
       ◀── progress events (generation:progress) update the banner
       └─ GenerationRecord appended to project history; first variation selected
```

Cancellation calls `generation:cancel`, which aborts the job's `AbortController`. Every provider passes the signal to `fetch` and also races it with `abortable()`, so a request that ignores the signal still stops immediately. A per-provider timeout uses the same controller, and the error is reported as `timeout` rather than `cancelled`.

## Errors

Every failure becomes an `AppError` with a `code`, a message, a hint and optional details. The codes are `invalid_input`, `missing_credentials`, `auth`, `network`, `timeout`, `rate_limit`, `quota`, `provider_unavailable`, `model_not_found`, `content_policy`, `invalid_response`, `unsupported_output`, `cancelled`, `file_io`, `corrupted_project`, `secure_storage_unavailable` and `unknown`.

`mapHttpError` converts provider HTTP responses into these codes and extracts provider messages from the common JSON error shapes. IPC handlers return `Result<T>`, so the renderer always receives structured errors. The UI turns them into a banner with context-specific actions (Open settings, Retry, Dismiss) or into toasts.

## Document model, filters and undo

Each `VariationRecord` holds:

- `original`: the converted generation output. It is immutable and is what "Reset to original" restores.
- `current`: the base pixels, including manual edits and baked filters.
- `pipeline`: an ordered list of `FilterStep`s, applied live on top of `current`.

The canvas shows `applyPipeline(current, pipeline)`. A `CachedPipeline` memoizes intermediate results, so changing step *k* only recomputes steps *k…n*. Images and steps are immutable values: every edit creates a new buffer or object. This is what makes undo cheap and correct.

Undo/redo (`src/renderer/src/store/docHistory.ts`) keeps one stack per variation of `{current, pipeline}` snapshots, capped at 100. Pixel strokes, fills, filter add/remove/reorder/toggle, parameter changes, preset application, baking and reset are all undoable. Consecutive changes to the same slider are coalesced into one step.

## Persistence

| Data | Where | Format / validation |
| --- | --- | --- |
| Preferences (provider, defaults, editor, **filter presets**, theme, autosave) | `userData/preferences.json` | zod schema with per-field fallback; a corrupt file is backed up and reset with a warning |
| API keys | `userData/secrets.json` | `safeStorage` ciphertext only; refuses to persist on `basic_text` |
| Session autosave | `userData/autosave.spritegen` (+ `autosave-meta.json`) | same as project files; a corrupt autosave is renamed aside |
| Projects | user-chosen `*.spritegen` | versioned JSON (`format: "spritegen-project"`, `version: 1`) with base64 PNGs; every image is decoded and checked against its record's size; unknown filters are dropped with a warning; newer versions are refused |

Writes are atomic: the file is written to a temp file and then renamed.

## Security model

See the README's Security section. The essentials:

- The renderer is sandboxed and context-isolated, and has a CSP.
- The preload exposes only the typed API.
- Main checks the sender origin on every IPC message and validates every payload.
- Secrets never leave main.

## UI composition

```
App
├─ TopBar (project actions, provider pill)
├─ LeftPanel (provider, prompt, negative, size, transparency, seed, variations, params, technical/conversion, Generate)
├─ CenterPanel (EditorToolbar, GenerationStatus banner, PixelCanvas, StatusBar)
├─ RightPanel tabs: AnalysisPanel | FilterPanel (+PresetManager) | PropertiesPanel
├─ HistoryPanel (history cards, variations strip)
├─ Dialogs (Export, Settings, StyleWarning, Confirm)
└─ Toasts
```

The canvas draws native-size `<canvas>` elements and enlarges them with CSS (`image-rendering: pixelated`), so the GPU does nearest-neighbor scaling and no large backing store is needed. The pixel grid and hover box are CSS overlays. The before/after view stacks the unfiltered canvas over the filtered one and clips it with `clip-path`.
