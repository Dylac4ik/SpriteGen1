import { useState } from 'react';
import { FILTERS, FILTER_TYPES, type FilterType } from '@core/filters';
import type { FilterPreset } from '@shared/types';
import { useApp } from '../store/appStore';

const NO_PRESETS: FilterPreset[] = [];
import { useSelected } from '../store/selectors';
import { ParamControl } from './ParamControl';
import { CloseIcon, DownIcon, UpIcon } from './Icons';

function PresetManager({ hasSteps, hasSelection }: { hasSteps: boolean; hasSelection: boolean }) {
  const presets = useApp((s) => s.prefs?.presets ?? NO_PRESETS);
  const savePreset = useApp((s) => s.savePreset);
  const renamePreset = useApp((s) => s.renamePreset);
  const deletePreset = useApp((s) => s.deletePreset);
  const movePreset = useApp((s) => s.movePreset);
  const applyPreset = useApp((s) => s.applyPreset);
  const openDialog = useApp((s) => s.openDialog);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  return (
    <section className="presets" aria-label="Filter presets">
      <h4 className="subhead">Presets</h4>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          savePreset(name);
          if (name.trim() && hasSteps) setName('');
        }}
      >
        <input aria-label="New preset name" placeholder="Preset name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button className="btn small" type="submit" disabled={!hasSteps || !name.trim()} title="Save the current filter stack as a preset">
          Save stack
        </button>
      </form>
      {presets.length === 0 && <p className="muted small">No presets yet. Build a filter stack, then save it here.</p>}
      <ul className="preset-list">
        {presets.map((p, i) => (
          <li key={p.id} className="preset">
            {renaming?.id === p.id ? (
              <form
                className="row grow"
                onSubmit={(e) => {
                  e.preventDefault();
                  renamePreset(p.id, renaming.name);
                  setRenaming(null);
                }}
              >
                <input
                  aria-label="Preset name"
                  autoFocus
                  value={renaming.name}
                  maxLength={80}
                  onChange={(e) => setRenaming({ id: p.id, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
                <button className="btn small" type="submit">
                  OK
                </button>
              </form>
            ) : (
              <div className="preset-name" title={p.steps.map((s) => FILTERS[s.type].label).join(' → ')}>
                <strong>{p.name}</strong>
                <span className="muted small">{p.steps.map((s) => FILTERS[s.type].label).join(' → ')}</span>
              </div>
            )}
            <div className="preset-actions">
              <button className="btn small primary" disabled={!hasSelection} onClick={() => applyPreset(p.id, 'replace')} title="Replace the current stack with this preset">
                Apply
              </button>
              <button className="btn small" disabled={!hasSelection} onClick={() => applyPreset(p.id, 'append')} title="Append this preset to the current stack">
                Append
              </button>
              <button className="btn small" onClick={() => setRenaming({ id: p.id, name: p.name })}>
                Rename
              </button>
              <button className="icon-btn" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => movePreset(p.id, -1)}>
                <UpIcon />
              </button>
              <button className="icon-btn" aria-label={`Move ${p.name} down`} disabled={i === presets.length - 1} onClick={() => movePreset(p.id, 1)}>
                <DownIcon />
              </button>
              <button
                className="icon-btn danger"
                aria-label={`Delete preset ${p.name}`}
                onClick={() =>
                  openDialog({
                    kind: 'confirm',
                    title: 'Delete preset?',
                    message: `Delete the preset “${p.name}”? This cannot be undone.`,
                    confirmLabel: 'Delete',
                    danger: true,
                    onConfirm: () => deletePreset(p.id),
                  })
                }
              >
                <CloseIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FilterPanel() {
  const selected = useSelected();
  const addFilter = useApp((s) => s.addFilter);
  const updateParam = useApp((s) => s.updateFilterParam);
  const toggle = useApp((s) => s.toggleFilter);
  const move = useApp((s) => s.moveFilter);
  const remove = useApp((s) => s.removeFilter);
  const clear = useApp((s) => s.clearFilters);
  const bake = useApp((s) => s.bakeFilters);
  const showFilters = useApp((s) => s.editor.showFilters);
  const compare = useApp((s) => s.editor.compare);
  const setEditor = useApp((s) => s.setEditor);
  const [toAdd, setToAdd] = useState<FilterType>('paletteReduce');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const steps = selected?.variation.pipeline ?? [];

  return (
    <div className="filters">
      {!selected && <p className="muted">Generate or select a sprite to edit its filter stack.</p>}
      <div className="row">
        <select aria-label="Filter to add" value={toAdd} onChange={(e) => setToAdd(e.target.value as FilterType)} disabled={!selected}>
          {FILTER_TYPES.map((t) => (
            <option key={t} value={t}>
              {FILTERS[t].label}
            </option>
          ))}
        </select>
        <button className="btn small primary" disabled={!selected} onClick={() => addFilter(toAdd)} title={FILTERS[toAdd].description}>
          Add filter
        </button>
      </div>
      <p className="hint">Non-destructive: filters run top to bottom on top of the sprite and preview live. The original generation is always kept.</p>
      <div className="row wrap">
        <label className="check compact">
          <input type="checkbox" checked={showFilters} onChange={(e) => setEditor({ showFilters: e.target.checked })} />
          Live preview
        </label>
        <label className="check compact">
          <input type="checkbox" checked={compare} disabled={!selected} onChange={(e) => setEditor({ compare: e.target.checked })} />
          Before/after
        </label>
      </div>
      <ol className="filter-stack" aria-label="Filter stack (applied in order)">
        {steps.map((step, i) => {
          const def = FILTERS[step.type];
          const open = !collapsed[step.id];
          return (
            <li key={step.id} className={`filter-step ${step.enabled ? '' : 'disabled'}`}>
              <div className="filter-head">
                <input type="checkbox" checked={step.enabled} aria-label={`Enable ${def.label}`} onChange={() => toggle(step.id)} title="Enable/disable this step" />
                <button className="link-btn filter-title" aria-expanded={open} onClick={() => setCollapsed({ ...collapsed, [step.id]: open })} title={def.description}>
                  {i + 1}. {def.label}
                </button>
                <button className="icon-btn" aria-label={`Move ${def.label} up`} disabled={i === 0} onClick={() => move(step.id, -1)}>
                  <UpIcon />
                </button>
                <button className="icon-btn" aria-label={`Move ${def.label} down`} disabled={i === steps.length - 1} onClick={() => move(step.id, 1)}>
                  <DownIcon />
                </button>
                <button className="icon-btn danger" aria-label={`Remove ${def.label}`} onClick={() => remove(step.id)}>
                  <CloseIcon />
                </button>
              </div>
              {open && (
                <div className="filter-body">
                  {def.params.map((spec) => (
                    <ParamControl key={spec.key} spec={spec} value={step.params[spec.key]} onChange={(v) => updateParam(step.id, spec.key, v)} disabled={!step.enabled} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {selected && steps.length === 0 && <p className="muted small">The stack is empty.</p>}
      <div className="row">
        <button className="btn small" disabled={!steps.some((s) => s.enabled)} onClick={bake} title="Permanently apply the stack to the sprite pixels (undoable)">
          Apply to pixels
        </button>
        <button className="btn small" disabled={steps.length === 0} onClick={clear}>
          Clear stack
        </button>
      </div>
      <PresetManager hasSteps={steps.length > 0} hasSelection={!!selected} />
    </div>
  );
}
