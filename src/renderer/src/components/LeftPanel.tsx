import { useEffect, useId, useMemo, useRef } from 'react';
import { SPRITE_SIZES, type SpriteSize } from '@core/sizes';
import { MAX_SEED, randomSeed } from '@core/random';
import { MAX_NEGATIVE_LENGTH, MAX_PROMPT_LENGTH } from '@core/prompt/analyze';
import { providerParams, useApp } from '../store/appStore';
import { useAnalysis, useProvider } from '../store/selectors';
import { ParamControl } from './ParamControl';
import { DiceIcon } from './Icons';

const SECTION_CHIPS: { label: string; insert: string; tip: string }[] = [
  { label: 'Subject', insert: 'Subject: ', tip: 'What the sprite depicts and its defining features' },
  { label: 'Style', insert: 'Style: ', tip: 'Concrete pixel-art style: era/console, bit depth, shading, dithering' },
  { label: 'Perspective', insert: 'Perspective: ', tip: 'Camera angle: side view, top-down, 3/4, isometric' },
  { label: 'Pose', insert: 'Pose: ', tip: 'Pose or action: idle, walking, attacking…' },
  { label: 'Palette', insert: 'Palette: ', tip: 'Colors or palette size' },
  { label: 'Outline', insert: 'Outline: ', tip: 'Outline treatment: 1px black, selective, none' },
  { label: 'Lighting', insert: 'Lighting: ', tip: 'Light direction and shading' },
  { label: 'Background', insert: 'Background: ', tip: 'Background or transparency' },
  { label: 'Animation', insert: 'Animation: ', tip: 'Game role: idle frame, walk-cycle keyframe, item icon, tile…' },
];

export function LeftPanel() {
  const form = useApp((s) => s.form);
  const setForm = useApp((s) => s.setForm);
  const providers = useApp((s) => s.providers);
  const providerId = useApp((s) => s.providerId);
  const setProvider = useApp((s) => s.setProvider);
  const setProviderParam = useApp((s) => s.setProviderParam);
  const job = useApp((s) => s.job);
  const generate = useApp((s) => s.generate);
  const cancel = useApp((s) => s.cancelGeneration);
  const openDialog = useApp((s) => s.openDialog);
  const setRightTab = useApp((s) => s.setRightTab);
  const history = useApp((s) => s.project.history);
  const focusRequest = useApp((s) => s.promptFocusRequest);
  const provider = useProvider();
  const params = useMemo(() => providerParams({ providers, providerId, form }), [providers, providerId, form]);
  const analysis = useAnalysis();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const ids = { provider: useId(), prompt: useId(), negative: useId(), seed: useId(), variations: useId() };

  useEffect(() => {
    if (focusRequest > 0) promptRef.current?.focus();
  }, [focusRequest]);

  const caps = provider?.capabilities;
  const insertSection = (text: string) => {
    const el = promptRef.current;
    const base = form.prompt.replace(/\s+$/, '');
    const next = base ? `${base}\n${text}` : text;
    setForm({ prompt: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(next.length, next.length);
    });
  };
  const lastSeed = history[0]?.request.seed;
  const styleBadge =
    analysis.style.status === 'concrete'
      ? { cls: 'ok', text: 'Style described ✓' }
      : analysis.style.status === 'vague'
        ? { cls: 'warn', text: 'Style too generic' }
        : { cls: 'warn', text: 'No style described' };
  const seedInvalid = !Number.isInteger(form.seed) || form.seed < 0 || form.seed > MAX_SEED;

  return (
    <div className="left-panel">
      <section className="group" aria-labelledby={`${ids.provider}-h`}>
        <h3 id={`${ids.provider}-h`} className="group-title">
          Generation backend
        </h3>
        <div className="field">
          <label htmlFor={ids.provider}>Provider</label>
          <div className="row">
            <select id={ids.provider} value={providerId} onChange={(e) => setProvider(e.target.value)} disabled={!!job}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => openDialog({ kind: 'settings', tab: 'providers', providerId })} title="Configure provider, API key and connection">
              Configure…
            </button>
          </div>
        </div>
        {provider?.isMock && (
          <p className="notice mock" role="note">
            <strong>MOCK provider:</strong> placeholder sprites made by a local procedural generator — not AI, and they do not depict your subject. Configure a real provider to generate from
            your prompt.
          </p>
        )}
        {provider && provider.requiresApiKey && (
          <p className={`status-line ${provider.apiKey.present ? 'ok' : 'warn'}`}>
            {provider.apiKey.present
              ? `API key: ${provider.apiKey.source === 'keychain' ? 'stored in OS credential store' : provider.apiKey.source === 'env' ? `from ${provider.apiKey.envVar}` : 'this session only'}`
              : 'API key missing — click Configure…'}
          </p>
        )}
      </section>

      <section className="group" aria-label="Prompt">
        <div className="field">
          <div className="label-row">
            <label htmlFor={ids.prompt}>Prompt</label>
            <button className={`badge-btn ${styleBadge.cls}`} onClick={() => setRightTab('analysis')} title="Open the smart prompt analysis">
              {styleBadge.text}
            </button>
          </div>
          <textarea
            id={ids.prompt}
            ref={promptRef}
            className="prompt-input"
            rows={7}
            value={form.prompt}
            maxLength={MAX_PROMPT_LENGTH}
            placeholder={'Describe subject, pose, perspective, palette, outline, lighting, background, animation role — and a concrete pixel-art style.\n\nExample: a knight with a red cape, side view, idle stance, 16-bit SNES-era pixel art, 1px dark outline, 12-color palette'}
            onChange={(e) => setForm({ prompt: e.target.value })}
            aria-describedby={`${ids.prompt}-help`}
          />
          <div id={`${ids.prompt}-help`} className="hint row-between">
            <span>Free text or labeled lines (e.g. “Style: …”). Ctrl+Enter generates.</span>
            <span className={form.prompt.length > MAX_PROMPT_LENGTH * 0.9 ? 'warn' : ''}>
              {form.prompt.length}/{MAX_PROMPT_LENGTH}
            </span>
          </div>
          <div className="chips" role="group" aria-label="Insert labeled prompt section">
            {SECTION_CHIPS.map((c) => (
              <button key={c.label} className="chip" title={`Insert "${c.insert.trim()}" line — ${c.tip}`} onClick={() => insertSection(c.insert)}>
                + {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor={ids.negative}>Negative prompt</label>
          <textarea
            id={ids.negative}
            rows={2}
            value={form.negativePrompt}
            maxLength={MAX_NEGATIVE_LENGTH}
            placeholder="Unwanted traits, e.g. blurry, anti-aliasing, gradients, text, watermark"
            onChange={(e) => setForm({ negativePrompt: e.target.value })}
          />
          {caps && !caps.supportsNegativePrompt && form.negativePrompt.trim() && (
            <p className="hint">This provider has no negative-prompt field; it will be appended as “Avoid: …” (see final prompt).</p>
          )}
        </div>
      </section>

      <section className="group" aria-label="Output">
        <fieldset className="field">
          <legend>Output size (native pixels)</legend>
          <div className="segmented" role="radiogroup" aria-label="Output size">
            {SPRITE_SIZES.map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={form.size === s}
                aria-label={`${s}×${s} pixels`}
                className={form.size === s ? 'active' : ''}
                onClick={() => setForm({ size: s as SpriteSize })}
                title={`${s}×${s} pixels`}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="hint">
            Exactly {form.size}×{form.size}. {caps ? `Model renders ~${caps.workingSize}px, then converts with hard edges.` : ''}
          </p>
        </fieldset>
        <label className="check" title="Produce real alpha transparency (native or via background removal).">
          <input type="checkbox" checked={form.transparent} onChange={(e) => setForm({ transparent: e.target.checked })} />
          Transparent background
          {caps && form.transparent && !caps.supportsNativeTransparency && <span className="hint inline"> (removed during conversion)</span>}
        </label>
      </section>

      <section className="group" aria-label="Seed and variations">
        <div className="field">
          <label htmlFor={ids.seed}>Seed</label>
          <div className="row">
            <input
              id={ids.seed}
              type="number"
              min={0}
              max={MAX_SEED}
              step={1}
              value={Number.isFinite(form.seed) ? form.seed : ''}
              aria-invalid={seedInvalid}
              disabled={form.randomizeSeed}
              onChange={(e) => setForm({ seed: Math.floor(Number(e.target.value)) })}
            />
            <button className="icon-btn" title="New random seed" aria-label="New random seed" onClick={() => setForm({ seed: randomSeed(), randomizeSeed: false })}>
              <DiceIcon />
            </button>
            <button
              className="btn small"
              disabled={lastSeed === undefined}
              title="Reuse the seed of the most recent generation"
              onClick={() => lastSeed !== undefined && setForm({ seed: lastSeed, randomizeSeed: false })}
            >
              Last
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.randomizeSeed} onChange={(e) => setForm({ randomizeSeed: e.target.checked })} />
            New random seed for each generation
          </label>
          {seedInvalid && !form.randomizeSeed && <p className="hint error">Seed must be a whole number from 0 to {MAX_SEED}.</p>}
          {caps && !caps.supportsSeed && <p className="hint warn">{provider?.displayName} ignores seeds — results are not reproducible.</p>}
          {caps?.supportsSeed && <p className="hint">Variation N uses seed + N.</p>}
        </div>
        <div className="field field-range">
          <label htmlFor={ids.variations}>
            Variations <output className="value">{form.variations}</output>
          </label>
          <input
            id={ids.variations}
            type="range"
            min={1}
            max={caps?.maxVariations ?? 8}
            value={form.variations}
            onChange={(e) => setForm({ variations: Number(e.target.value) })}
          />
        </div>
        {caps?.generationParams.map((spec) => (
          <ParamControl key={spec.key} spec={spec} value={params[spec.key]} onChange={(v) => setProviderParam(spec.key, v)} />
        ))}
      </section>

      <details className="group">
        <summary>Technical constraints &amp; pixel conversion</summary>
        <p className="hint">Neutral constraints appended to the prompt (shown exactly in the final prompt). None of them sets an art style.</p>
        <label className="check">
          <input type="checkbox" checked={form.technical.centered} onChange={(e) => setForm({ technical: { ...form.technical, centered: e.target.checked } })} />
          Single centered subject, fully in frame
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.technical.readableAtSize}
            onChange={(e) => setForm({ technical: { ...form.technical, readableAtSize: e.target.checked } })}
          />
          Readable silhouette at {form.size}×{form.size}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.technical.isolatedBackground}
            disabled={!form.transparent}
            onChange={(e) => setForm({ technical: { ...form.technical, isolatedBackground: e.target.checked } })}
          />
          Ask for an isolated background (when transparent)
        </label>
        <h4 className="subhead">Model output → native sprite</h4>
        <div className="field">
          <label htmlFor="conv-palette">Working palette</label>
          <select
            id="conv-palette"
            value={form.conversion.paletteMode}
            onChange={(e) => setForm({ conversion: { ...form.conversion, paletteMode: e.target.value as 'auto' | 'custom' | 'off' } })}
          >
            <option value="auto">Auto (by size)</option>
            <option value="custom">Custom color count</option>
            <option value="off">Off (keep model colors)</option>
          </select>
        </div>
        {form.conversion.paletteMode === 'custom' && (
          <ParamControl
            spec={{ kind: 'range', key: 'paletteColors', label: 'Colors', min: 2, max: 64, step: 1, default: 16 }}
            value={form.conversion.paletteColors}
            onChange={(v) => setForm({ conversion: { ...form.conversion, paletteColors: Number(v) } })}
          />
        )}
        <div className="field" title="Nearest-neighbor samples each block center. Dominant color picks each block's most frequent color. Neither interpolates.">
          <label htmlFor="conv-down">Downscale sampling</label>
          <select
            id="conv-down"
            value={form.conversion.downscale}
            onChange={(e) => setForm({ conversion: { ...form.conversion, downscale: e.target.value as 'nearest' | 'dominant' } })}
          >
            <option value="nearest">Nearest-neighbor (block center)</option>
            <option value="dominant">Dominant color per block</option>
          </select>
        </div>
        <ParamControl
          spec={{ kind: 'range', key: 'alpha', label: 'Alpha threshold', min: 1, max: 255, step: 1, default: 128, tooltip: 'Pixels below become fully transparent' }}
          value={form.conversion.alphaThreshold}
          onChange={(v) => setForm({ conversion: { ...form.conversion, alphaThreshold: Number(v) } })}
        />
        <div className="field">
          <label htmlFor="conv-bg">Background removal</label>
          <select
            id="conv-bg"
            value={form.conversion.backgroundRemoval}
            onChange={(e) => setForm({ conversion: { ...form.conversion, backgroundRemoval: e.target.value as 'auto' | 'on' | 'off' } })}
          >
            <option value="auto">Auto (only if provider lacks transparency)</option>
            <option value="on">Always</option>
            <option value="off">Never</option>
          </select>
        </div>
        <ParamControl
          spec={{ kind: 'range', key: 'tol', label: 'Background tolerance', min: 0, max: 128, step: 1, default: 24 }}
          value={form.conversion.backgroundTolerance}
          onChange={(v) => setForm({ conversion: { ...form.conversion, backgroundTolerance: Number(v) } })}
        />
      </details>

      <div className="generate-bar">
        {job ? (
          <button className="btn danger wide" onClick={cancel} title="Cancel the running generation (Esc)">
            Cancel generation
          </button>
        ) : (
          <button
            className="btn primary wide"
            onClick={() => void generate()}
            disabled={!form.prompt.trim() || (!form.randomizeSeed && seedInvalid)}
            title="Generate (Ctrl+Enter)"
          >
            Generate {form.variations > 1 ? `${form.variations} variations` : 'sprite'}
          </button>
        )}
        {!job && analysis.hasErrors && form.prompt.trim() && <p className="hint error">{analysis.issues.find((i) => i.severity === 'error')?.message}</p>}
      </div>
    </div>
  );
}

