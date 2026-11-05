import { useEffect, useId, useState } from 'react';
import { EXPORT_SCALES, MAX_EXPORT_DIMENSION, SPRITE_SIZES, type SpriteSize } from '@core/sizes';
import { spriteSheetLayout } from '@core/spritesheet';
import { appendToPrompt } from '@core/prompt/compose';
import { defaultParams, sanitizeParams, type ParamValues } from '@core/params';
import type { PromptAnalysis } from '@core/prompt/analyze';
import type { ThemePreference } from '@shared/types';
import { useApp } from '../store/appStore';
import { useSelected } from '../store/selectors';
import { Modal } from './Modal';
import { ParamControl } from './ParamControl';

export function ExportDialog({ mode: initialMode }: { mode: 'sprite' | 'sheet' }) {
  const close = useApp((s) => s.closeDialog);
  const exportSprite = useApp((s) => s.exportSprite);
  const exportSheet = useApp((s) => s.exportSheet);
  const copySprite = useApp((s) => s.copySprite);
  const prefs = useApp((s) => s.prefs);
  const updatePrefs = useApp((s) => s.updatePrefs);
  const selected = useSelected();
  const [mode, setMode] = useState(initialMode);
  const [scale, setScale] = useState(prefs?.exportScale ?? 1);
  const [includeFilters, setIncludeFilters] = useState(true);
  const [columns, setColumns] = useState(Math.min(4, selected?.record.variations.length ?? 1));
  const [busy, setBusy] = useState(false);
  const scaleId = useId();

  if (!selected) {
    return (
      <Modal title="Export" onClose={close}>
        <p>Select a sprite first.</p>
      </Modal>
    );
  }
  const size = selected.record.request.size;
  const count = selected.record.variations.length;
  const layout = spriteSheetLayout(count, size, size, columns);
  const outW = (mode === 'sheet' ? layout.width : size) * scale;
  const outH = (mode === 'sheet' ? layout.height : size) * scale;
  const tooBig = outW > MAX_EXPORT_DIMENSION || outH > MAX_EXPORT_DIMENSION;
  const hasFilters = selected.record.variations.some((v) => v.pipeline.some((s) => s.enabled));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      if (prefs && prefs.exportScale !== scale) void updatePrefs({ exportScale: scale });
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export PNG"
      onClose={close}
      footer={
        <>
          {mode === 'sprite' && (
            <button className="btn" disabled={busy || tooBig} onClick={() => run(() => copySprite({ scale, includeFilters }))}>
              Copy to clipboard
            </button>
          )}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            data-autofocus
            disabled={busy || tooBig}
            onClick={() => run(() => (mode === 'sheet' ? exportSheet({ scale, includeFilters, columns }) : exportSprite({ scale, includeFilters })))}
          >
            Export…
          </button>
        </>
      }
    >
      <fieldset className="field">
        <legend>What to export</legend>
        <label className="check">
          <input type="radio" name="export-mode" checked={mode === 'sprite'} onChange={() => setMode('sprite')} />
          Selected sprite (variation {selected.variation.index + 1})
        </label>
        <label className="check">
          <input type="radio" name="export-mode" checked={mode === 'sheet'} disabled={count < 2} onChange={() => setMode('sheet')} />
          Sprite sheet of all {count} variations
        </label>
      </fieldset>
      {mode === 'sheet' && (
        <ParamControl
          spec={{ kind: 'range', key: 'cols', label: 'Columns', min: 1, max: count, step: 1, default: Math.min(4, count) }}
          value={columns}
          onChange={(v) => setColumns(Number(v))}
        />
      )}
      <div className="field">
        <label htmlFor={scaleId}>Pixel scale</label>
        <select id={scaleId} value={scale} onChange={(e) => setScale(Number(e.target.value))}>
          {EXPORT_SCALES.map((s) => (
            <option key={s} value={s}>
              {s === 1 ? '1× — native size (recommended)' : `${s}× — enlarged preview (nearest-neighbor)`}
            </option>
          ))}
        </select>
      </div>
      <label className="check" title="Export what you see on the canvas, including the live filter stack">
        <input type="checkbox" checked={includeFilters} onChange={(e) => setIncludeFilters(e.target.checked)} />
        Include active filters {hasFilters ? '' : '(none active)'}
      </label>
      <div className={`notice ${scale > 1 ? 'warn' : ''}`} role="status">
        Output: <strong>{outW}×{outH} px</strong> PNG with alpha transparency.
        {scale === 1 ? ' Exact native pixels — nothing is resized.' : ` This is NOT the native ${size}×${size} size: every pixel becomes a ${scale}×${scale} block. The file name gets an “@${scale}x” suffix.`}
        {tooBig && <div className="error">Too large: the limit is {MAX_EXPORT_DIMENSION}px per side.</div>}
      </div>
    </Modal>
  );
}

export function ProviderSettings({ providerId, onSelect }: { providerId: string; onSelect(id: string): void }) {
  const providers = useApp((s) => s.providers);
  const appInfo = useApp((s) => s.appInfo);
  const saveSettings = useApp((s) => s.saveProviderSettings);
  const setApiKey = useApp((s) => s.setApiKey);
  const testProvider = useApp((s) => s.testProvider);
  const setProvider = useApp((s) => s.setProvider);
  const activeId = useApp((s) => s.providerId);
  const provider = providers.find((p) => p.id === providerId) ?? providers[0];
  const [settings, setSettings] = useState<ParamValues>({});
  const [key, setKey] = useState('');
  const [persist, setPersist] = useState(true);
  const [test, setTest] = useState<{ ok: boolean; message: string; hint?: string } | 'running' | null>(null);
  const keyId = useId();
  const secure = appInfo?.secureStorage.available ?? false;

  useEffect(() => {
    if (provider) setSettings(sanitizeParams(provider.settingsFields, { ...defaultParams(provider.settingsFields), ...provider.settings }));
    setKey('');
    setTest(null);
  }, [provider]);
  useEffect(() => {
    if (!secure) setPersist(false);
  }, [secure]);
  if (!provider) return null;

  return (
    <div className="provider-settings">
      <div className="provider-list" role="listbox" aria-label="Providers">
        {providers.map((p) => (
          <button key={p.id} role="option" aria-selected={p.id === provider.id} className={`provider-item ${p.id === provider.id ? 'active' : ''}`} onClick={() => onSelect(p.id)}>
            <strong>{p.displayName}</strong>
            <span className="small muted">
              {p.isMock ? 'Mock / offline' : p.requiresApiKey ? (p.apiKey.present ? 'Key configured' : 'Needs API key') : 'No key needed'}
              {p.id === activeId ? ' · active' : ''}
            </span>
          </button>
        ))}
      </div>
      <div className="provider-detail">
        <h3>
          {provider.displayName} {provider.isMock && <span className="badge mock">MOCK — not AI</span>}
        </h3>
        <p>{provider.description}</p>
        <ul className="caps small">
          <li>Seeds: {provider.capabilities.supportsSeed ? 'supported' : 'not supported'}</li>
          <li>Negative prompt: {provider.capabilities.supportsNegativePrompt ? 'separate field' : 'merged into prompt'}</li>
          <li>Transparency: {provider.capabilities.supportsNativeTransparency ? 'native' : 'via background removal'}</li>
          <li>Working resolution: ~{provider.capabilities.workingSize}px</li>
        </ul>
        {provider.docsUrl && (
          <p className="small">
            Docs:{' '}
            <a href={provider.docsUrl} target="_blank" rel="noreferrer">
              {provider.docsUrl}
            </a>
          </p>
        )}

        {provider.requiresApiKey && (
          <fieldset className="field">
            <legend>API key</legend>
            <p className={`status-line ${provider.apiKey.present ? 'ok' : 'warn'}`}>
              {provider.apiKey.present
                ? `Configured (${provider.apiKey.source === 'keychain' ? 'encrypted with the OS credential store' : provider.apiKey.source === 'env' ? `environment variable ${provider.apiKey.envVar}` : 'memory, this session only'}). The key is never shown again.`
                : `Not configured.${provider.apiKey.envVar ? ` You can also set ${provider.apiKey.envVar} before launching.` : ''}`}
            </p>
            <label htmlFor={keyId}>New API key</label>
            <input id={keyId} type="password" autoComplete="off" spellCheck={false} value={key} placeholder="Paste key" onChange={(e) => setKey(e.target.value)} />
            <label className="check" title={secure ? '' : 'No secure OS credential storage detected on this system.'}>
              <input type="checkbox" checked={persist} disabled={!secure} onChange={(e) => setPersist(e.target.checked)} />
              Remember securely in the OS credential store
            </label>
            {!secure && (
              <p className="hint warn">
                Secure storage unavailable (backend: {appInfo?.secureStorage.backend ?? 'unknown'}). Keys stay in memory for this session only — or use the environment variable.
              </p>
            )}
            <div className="row">
              <button
                className="btn small primary"
                disabled={!key.trim()}
                onClick={async () => {
                  if (await setApiKey(provider.id, key, persist)) setKey('');
                }}
              >
                Save key
              </button>
              <button className="btn small" disabled={!provider.apiKey.present || provider.apiKey.source === 'env'} onClick={() => void setApiKey(provider.id, null, true)}>
                Remove key
              </button>
            </div>
          </fieldset>
        )}

        {provider.settingsFields.length > 0 && (
          <fieldset className="field">
            <legend>Connection settings</legend>
            {provider.settingsFields.map((spec) => (
              <ParamControl key={spec.key} spec={spec} value={settings[spec.key]} onChange={(v) => setSettings({ ...settings, [spec.key]: v })} />
            ))}
            <button className="btn small" onClick={() => void saveSettings(provider.id, settings)}>
              Save settings
            </button>
          </fieldset>
        )}

        <div className="row">
          <button
            className="btn small"
            disabled={test === 'running'}
            onClick={async () => {
              setTest('running');
              setTest(await testProvider(provider.id));
            }}
          >
            {test === 'running' ? 'Testing…' : 'Test connection'}
          </button>
          <button className="btn small primary" disabled={provider.id === activeId} onClick={() => setProvider(provider.id)}>
            {provider.id === activeId ? 'Active provider' : 'Use this provider'}
          </button>
        </div>
        {test && test !== 'running' && (
          <p className={`status-line ${test.ok ? 'ok' : 'error'}`} role="status">
            {test.message}
            {test.hint ? ` — ${test.hint}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

export function PreferencesSettings() {
  const prefs = useApp((s) => s.prefs);
  const updatePrefs = useApp((s) => s.updatePrefs);
  const setForm = useApp((s) => s.setForm);
  const appInfo = useApp((s) => s.appInfo);
  if (!prefs) return null;
  return (
    <div className="prefs">
      <div className="field">
        <label htmlFor="pref-theme">Theme</label>
        <select id="pref-theme" value={prefs.theme} onChange={(e) => void updatePrefs({ theme: e.target.value as ThemePreference })}>
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="pref-size">Default output size</label>
        <select
          id="pref-size"
          value={prefs.defaults.size}
          onChange={(e) => {
            const size = Number(e.target.value) as SpriteSize;
            void updatePrefs({ defaults: { ...prefs.defaults, size } });
            setForm({ size });
          }}
        >
          {SPRITE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}×{s}
            </option>
          ))}
        </select>
      </div>
      <ParamControl
        spec={{ kind: 'range', key: 'grid', label: 'Show pixel grid from zoom', min: 2, max: 32, step: 1, default: 6, unit: '×' }}
        value={prefs.editor.gridMinZoom}
        onChange={(v) => void updatePrefs({ editor: { ...prefs.editor, gridMinZoom: Number(v) } })}
      />
      <label className="check">
        <input type="checkbox" checked={prefs.autosave} onChange={(e) => void updatePrefs({ autosave: e.target.checked })} />
        Autosave the session and restore it on launch
      </label>
      <p className="hint">
        Preferences, presets and the autosave live in <span className="mono">{appInfo?.userDataPath}</span>. API keys are stored only as OS-encrypted ciphertext.
      </p>
    </div>
  );
}

function SettingsDialog({ tab: initialTab, providerId }: { tab: 'providers' | 'preferences'; providerId?: string }) {
  const close = useApp((s) => s.closeDialog);
  const active = useApp((s) => s.providerId);
  const [tab, setTab] = useState(initialTab);
  const [selected, setSelected] = useState(providerId ?? active);
  return (
    <Modal title="Settings" onClose={close} wide footer={<button className="btn" onClick={close}>Close</button>}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'providers'} className={tab === 'providers' ? 'active' : ''} onClick={() => setTab('providers')}>
          Providers
        </button>
        <button role="tab" aria-selected={tab === 'preferences'} className={tab === 'preferences' ? 'active' : ''} onClick={() => setTab('preferences')}>
          Preferences
        </button>
      </div>
      {tab === 'providers' ? <ProviderSettings providerId={selected} onSelect={setSelected} /> : <PreferencesSettings />}
    </Modal>
  );
}

export function StyleWarningDialog({ analysis }: { analysis: PromptAnalysis }) {
  const close = useApp((s) => s.closeDialog);
  const generate = useApp((s) => s.generate);
  const prompt = useApp((s) => s.form.prompt);
  const setForm = useApp((s) => s.setForm);
  const focusPrompt = useApp((s) => s.focusPrompt);
  const styleIssue = analysis.issues.find((i) => i.section === 'style' && (i.id === 'style-missing' || i.id === 'style-vague'));
  const styleSuggestions = analysis.suggestions.filter((s) => s.section === 'style');
  const others = analysis.issues.filter((i) => i.severity === 'warning' && i !== styleIssue);
  return (
    <Modal
      title={analysis.style.status === 'missing' ? 'No style described' : 'Style is too generic'}
      onClose={close}
      footer={
        <>
          <button
            className="btn"
            data-autofocus
            onClick={() => {
              close();
              focusPrompt();
            }}
          >
            Edit prompt
          </button>
          <button
            className="btn warn"
            onClick={() => {
              close();
              void generate({ skipStyleCheck: true });
            }}
          >
            Generate anyway
          </button>
        </>
      }
    >
      <p>{styleIssue?.message}</p>
      <p className="muted">The model will choose a look on its own if you continue. Pick a concrete style to add it to your prompt (you can edit it afterwards):</p>
      <ul className="suggestions">
        {styleSuggestions.map((s) => (
          <li key={s.id} className="suggestion">
            <div className="suggestion-text">
              “{s.text}”<div className="muted small">{s.rationale}</div>
            </div>
            <button
              className="btn small primary"
              onClick={() => {
                setForm({ prompt: appendToPrompt(prompt, s.text) });
                close();
                focusPrompt();
              }}
            >
              Add to prompt
            </button>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <>
          <h4 className="subhead">Other warnings</h4>
          <ul className="issues">
            {others.map((i) => (
              <li key={i.id} className="issue warning">
                {i.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

export function ConfirmDialog(props: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm(): void }) {
  const close = useApp((s) => s.closeDialog);
  return (
    <Modal
      title={props.title}
      onClose={close}
      footer={
        <>
          <button className="btn" data-autofocus onClick={close}>
            Cancel
          </button>
          <button
            className={`btn ${props.danger ? 'danger' : 'primary'}`}
            onClick={() => {
              close();
              props.onConfirm();
            }}
          >
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p>{props.message}</p>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useApp((s) => s.dialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'export':
      return <ExportDialog mode={dialog.mode} />;
    case 'settings':
      return <SettingsDialog tab={dialog.tab} providerId={dialog.providerId} />;
    case 'style-warning':
      return <StyleWarningDialog analysis={dialog.analysis} />;
    case 'confirm':
      return <ConfirmDialog {...dialog} />;
  }
}
