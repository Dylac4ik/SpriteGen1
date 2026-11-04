import { useApp } from '../store/appStore';
import { useSelected } from '../store/selectors';
import { formatTime } from '../util';
import { Thumbnail } from './Thumbnail';

export function HistoryPanel() {
  const history = useApp((s) => s.project.history);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const reopen = useApp((s) => s.reopenRecord);
  const regenerate = useApp((s) => s.regenerate);
  const deleteRecord = useApp((s) => s.deleteRecord);
  const openDialog = useApp((s) => s.openDialog);
  const exportSprite = useApp((s) => s.exportSprite);
  const job = useApp((s) => s.job);
  const selected = useSelected();

  return (
    <div className="bottom-panel">
      <section className="history" aria-label="Generation history">
        <h3 className="group-title">
          History <span className="muted">({history.length})</span>
        </h3>
        {history.length === 0 ? (
          <p className="muted small">Every generation is kept here with its prompt, seed, size, settings and filters.</p>
        ) : (
          <ul className="history-list" role="listbox" aria-label="Generations">
            {history.map((rec) => {
              const active = selection?.recordId === rec.id;
              return (
                <li key={rec.id}>
                  <button
                    role="option"
                    aria-selected={active}
                    className={`history-card ${active ? 'active' : ''}`}
                    onClick={() => select(rec.id)}
                    title={rec.request.prompt}
                  >
                    <Thumbnail image={rec.variations[0].current} display={48} />
                    <span className="history-meta">
                      <span className="history-prompt">{rec.request.prompt}</span>
                      <span className="muted small">
                        {rec.request.size}px · {rec.variations.length}× · {formatTime(rec.createdAt)}
                        {rec.isMock ? ' · MOCK' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="variations" aria-label="Variations of the selected generation">
        <div className="row-between">
          <h3 className="group-title">Variations</h3>
          {selected && (
            <div className="row">
              <button className="btn small" onClick={() => reopen(selected.record.id)} title="Load this generation's prompt and settings into the editor">
                Reopen
              </button>
              <button className="btn small" disabled={!!job} onClick={() => void regenerate(selected.record.id)} title="Generate again with the same prompt, settings and seed">
                Regenerate
              </button>
              <button className="btn small" disabled={selected.record.variations.length < 2} onClick={() => openDialog({ kind: 'export', mode: 'sheet' })}>
                Export sheet…
              </button>
              <button
                className="btn small danger-outline"
                onClick={() =>
                  openDialog({
                    kind: 'confirm',
                    title: 'Delete generation?',
                    message: 'Remove this generation and all its variations and edits from the project?',
                    confirmLabel: 'Delete',
                    danger: true,
                    onConfirm: () => deleteRecord(selected.record.id),
                  })
                }
              >
                Delete
              </button>
            </div>
          )}
        </div>
        {selected ? (
          <ul className="variation-list" role="listbox" aria-label="Variations">
            {selected.record.variations.map((v) => {
              const active = v.id === selected.variation.id;
              return (
                <li key={v.id} className={`variation ${active ? 'active' : ''}`}>
                  <button role="option" aria-selected={active} className="variation-btn" onClick={() => select(selected.record.id, v.id)} title={`Variation ${v.index + 1}`}>
                    <Thumbnail image={v.current} display={72} label={`Variation ${v.index + 1}`} />
                    <span className="small">
                      #{v.index + 1} {v.seed !== null ? `· seed ${v.seed}` : ''}
                      {v.pipeline.length ? ' · filtered' : ''}
                    </span>
                  </button>
                  {active && (
                    <button className="btn tiny" onClick={() => openDialog({ kind: 'export', mode: 'sprite' })}>
                      Export…
                    </button>
                  )}
                  {!active && (
                    <button
                      className="btn tiny"
                      onClick={() => {
                        select(selected.record.id, v.id);
                        void exportSprite({ scale: 1, includeFilters: true });
                      }}
                      title="Export this variation as a native-size PNG"
                    >
                      PNG
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small">Select a generation to see its variations.</p>
        )}
      </section>
    </div>
  );
}
