import { useMemo } from 'react';
import { uniqueColors, unpackRgba, countOpaque } from '@core/image';
import { useApp, type RightTab } from '../store/appStore';
import { useDisplayImages, useSelected } from '../store/selectors';
import { formatTime, rgbaHex } from '../util';
import { AnalysisPanel } from './AnalysisPanel';
import { FilterPanel } from './FilterPanel';
import { Thumbnail } from './Thumbnail';

function PropertiesPanel() {
  const selected = useSelected();
  const images = useDisplayImages(selected?.variation);
  const setEditor = useApp((s) => s.setEditor);
  const setForm = useApp((s) => s.setForm);
  const reopen = useApp((s) => s.reopenRecord);
  const regenerate = useApp((s) => s.regenerate);
  const job = useApp((s) => s.job);
  const palette = useMemo(() => (images ? uniqueColors(images.after, 64).filter((c) => c !== 0) : []), [images]);
  if (!selected || !images) return <p className="muted">Select a sprite to see its properties.</p>;
  const { record, variation } = selected;
  const size = record.request.size;
  return (
    <div className="properties">
      <section aria-label="Native preview">
        <h4 className="subhead">Native resolution</h4>
        <div className="native-previews">
          <figure>
            <Thumbnail image={images.after} display={size} label="Native 1× preview" />
            <figcaption>1× ({size}px)</figcaption>
          </figure>
          {size <= 128 && (
            <figure>
              <Thumbnail image={images.after} display={size * 2} label="2× nearest-neighbor preview" />
              <figcaption>2×</figcaption>
            </figure>
          )}
        </div>
      </section>
      <section aria-label="Details">
        <h4 className="subhead">Details</h4>
        <dl className="kv-list">
          <dt>Size</dt>
          <dd>
            {size}×{size} px (native)
          </dd>
          <dt>Provider</dt>
          <dd>
            {record.providerName} {record.isMock && <span className="badge mock">MOCK — not AI</span>}
          </dd>
          <dt>Seed</dt>
          <dd>
            {variation.seed ?? 'not supported'}
            {variation.seed !== null && (
              <button className="link-btn" onClick={() => setForm({ seed: variation.seed!, randomizeSeed: false })}>
                use
              </button>
            )}
          </dd>
          <dt>Variation</dt>
          <dd>
            {variation.index + 1} of {record.variations.length}
          </dd>
          <dt>Created</dt>
          <dd>{formatTime(record.createdAt)}</dd>
          <dt>Model output</dt>
          <dd>
            {variation.sourceWidth}×{variation.sourceHeight} px
          </dd>
          <dt>Colors</dt>
          <dd>{palette.length >= 64 ? '64+' : palette.length}</dd>
          <dt>Opaque pixels</dt>
          <dd>
            {countOpaque(images.after)} / {size * size}
          </dd>
          <dt>Filters</dt>
          <dd>{variation.pipeline.filter((s) => s.enabled).length} active</dd>
        </dl>
        <div className="row wrap">
          <button className="btn small" onClick={() => reopen(record.id)}>
            Reopen settings
          </button>
          <button className="btn small" disabled={!!job} onClick={() => void regenerate(record.id)}>
            Regenerate
          </button>
        </div>
      </section>
      <section aria-label="Palette">
        <h4 className="subhead">Palette (click to draw with it)</h4>
        <div className="palette">
          {palette.slice(0, 64).map((key) => {
            const c = unpackRgba(key);
            return (
              <button
                key={key}
                className="swatch"
                style={{ background: rgbaHex(c) }}
                title={rgbaHex(c)}
                aria-label={`Use color ${rgbaHex(c)}`}
                onClick={() => setEditor({ color: c, tool: 'pencil' })}
              />
            );
          })}
        </div>
      </section>
      <section aria-label="Conversion">
        <h4 className="subhead">Pixel conversion applied</h4>
        <ul className="notes">
          {variation.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </section>
      <section aria-label="Prompt used">
        <h4 className="subhead">Prompt sent</h4>
        <pre className="final-prompt">{record.finalPrompt}</pre>
        {record.finalNegativePrompt && (
          <div className="kv">
            <span>Negative</span>
            <span className="mono">{record.finalNegativePrompt}</span>
          </div>
        )}
        {record.promptNotes.map((n) => (
          <p key={n} className="hint">
            {n}
          </p>
        ))}
      </section>
    </div>
  );
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'analysis', label: 'Prompt analysis' },
  { id: 'filters', label: 'Filters' },
  { id: 'properties', label: 'Properties' },
];

export function RightPanel() {
  const tab = useApp((s) => s.rightTab);
  const setTab = useApp((s) => s.setRightTab);
  const selected = useSelected();
  const filterCount = selected?.variation.pipeline.length ?? 0;
  return (
    <div className="right-panel">
      <div className="tabs" role="tablist" aria-label="Inspector">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const i = TABS.findIndex((x) => x.id === tab);
              const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
              setTab(next.id);
              document.getElementById(`tab-${next.id}`)?.focus();
            }}
          >
            {t.label}
            {t.id === 'filters' && filterCount > 0 ? ` (${filterCount})` : ''}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'analysis' && <AnalysisPanel />}
        {tab === 'filters' && <FilterPanel />}
        {tab === 'properties' && <PropertiesPanel />}
      </div>
    </div>
  );
}
