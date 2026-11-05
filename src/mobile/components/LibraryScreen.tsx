import { useCallback, useEffect, useState } from 'react';
import { useApp, toProjectData } from '@renderer/store/appStore';
import { Thumbnail } from '@renderer/components/Thumbnail';
import { formatTime } from '@renderer/util';
import type { MobileApi, StoredProject } from '../platform/backend';
import { useMobileUi } from '../state';

export function LibraryScreen({ backend }: { backend: MobileApi }) {
  const project = useApp((s) => s.project);
  const selection = useApp((s) => s.selection);
  const job = useApp((s) => s.job);
  const store = useApp.getState;
  const setTab = useMobileUi((s) => s.setTab);
  const [stored, setStored] = useState<StoredProject[]>([]);
  const [name, setName] = useState(project.name);

  useEffect(() => setName(project.name), [project.name]);

  const refresh = useCallback(async () => {
    const res = await backend.listProjects();
    if (res.ok) setStored(res.value);
  }, [backend]);

  useEffect(() => {
    void refresh();
  }, [refresh, project.path, project.dirty]);

  const confirmDiscard = (title: string, then: () => void) => {
    if (!store().project.dirty) return then();
    store().openDialog({ kind: 'confirm', title, message: 'The current project has unsaved changes. They will be discarded.', confirmLabel: 'Discard', danger: true, onConfirm: then });
  };

  const openStored = (p: StoredProject) =>
    confirmDiscard(`Open “${p.name}”?`, async () => {
      const res = await backend.openStoredProject(p.id);
      if (!res.ok) return store().toast('error', `Could not open project: ${res.error.message}`, res.error.details);
      store().loadProject(res.value);
      store().toast('success', `Opened ${p.name}.`);
      setTab(res.value.project.history.length ? 'edit' : 'create');
    });

  const commitName = () => {
    if (name.trim() && name.trim() !== project.name) store().setProjectName(name);
    else setName(project.name);
  };

  return (
    <div className="m-library">
      <section className="m-card" aria-labelledby="m-proj-h">
        <h2 id="m-proj-h">Current project</h2>
        <div className="field">
          <label htmlFor="m-proj-name">Name</label>
          <input id="m-proj-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </div>
        <p className="hint">
          {project.history.length} generation{project.history.length === 1 ? '' : 's'} · {project.path ? (project.dirty ? 'unsaved changes' : 'saved on this device') : 'not saved yet'}
        </p>
        <div className="m-btn-grid">
          <button className="btn primary" onClick={() => void store().saveProject(false)}>
            Save
          </button>
          <button className="btn" onClick={() => void store().saveProject(true)}>
            Save as copy
          </button>
          <button
            className="btn"
            onClick={async () => {
              const res = await backend.shareProject(toProjectData(store().project));
              if (!res.ok) store().toast('error', `Could not share the project: ${res.error.message}`);
              else if (res.value) store().toast('success', 'Project file shared.');
            }}
          >
            Share file
          </button>
          <button className="btn" onClick={() => void store().openProject().then(() => store().project.history.length && setTab('edit'))}>
            Import file…
          </button>
          <button className="btn" onClick={() => store().newProject()}>
            New project
          </button>
        </div>
      </section>

      <section className="m-card" aria-labelledby="m-saved-h">
        <h2 id="m-saved-h">Saved on this device</h2>
        {stored.length === 0 && <p className="muted">No saved projects yet.</p>}
        <ul className="m-list">
          {stored.map((p) => (
            <li key={p.id} className={project.path === p.id ? 'current' : ''}>
              <div className="m-list-main">
                <strong>{p.name}</strong>
                <span className="small muted">
                  {formatTime(new Date(p.modified).toISOString())} · {Math.max(1, Math.round(p.size / 1024))} KB{project.path === p.id ? ' · open' : ''}
                </span>
              </div>
              <button className="btn small" onClick={() => openStored(p)}>
                Open
              </button>
              <button
                className="btn small danger-outline"
                aria-label={`Delete ${p.name}`}
                onClick={() =>
                  store().openDialog({
                    kind: 'confirm',
                    title: 'Delete project?',
                    message: `Delete “${p.name}” from this device? This cannot be undone.`,
                    confirmLabel: 'Delete',
                    danger: true,
                    onConfirm: async () => {
                      const res = await backend.deleteStoredProject(p.id);
                      if (!res.ok) store().toast('error', res.error.message);
                      await refresh();
                    },
                  })
                }
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="m-card" aria-labelledby="m-hist-h">
        <h2 id="m-hist-h">Generation history</h2>
        {project.history.length === 0 && <p className="muted">Every generation is kept here with its prompt, seed, size, settings and filters.</p>}
        <ul className="m-history">
          {project.history.map((rec) => (
            <li key={rec.id} className={selection?.recordId === rec.id ? 'current' : ''}>
              <button
                className="m-history-main"
                onClick={() => {
                  store().select(rec.id);
                  setTab('edit');
                }}
                aria-label={`Open generation: ${rec.request.prompt}`}
              >
                <Thumbnail image={rec.variations[0].current} display={56} />
                <span>
                  <span className="m-history-prompt">{rec.request.prompt}</span>
                  <span className="small muted">
                    {rec.request.size}px · {rec.variations.length}× · seed {rec.variations[0].seed ?? 'n/a'} · {formatTime(rec.createdAt)}
                    {rec.isMock ? ' · MOCK' : ''}
                  </span>
                </span>
              </button>
              <div className="m-history-actions">
                <button
                  className="btn small"
                  onClick={() => {
                    store().reopenRecord(rec.id);
                    setTab('create');
                  }}
                >
                  Reopen
                </button>
                <button className="btn small" disabled={!!job} onClick={() => void store().regenerate(rec.id)}>
                  Regenerate
                </button>
                <button
                  className="btn small danger-outline"
                  onClick={() =>
                    store().openDialog({
                      kind: 'confirm',
                      title: 'Delete generation?',
                      message: 'Remove this generation and all its variations and edits from the project?',
                      confirmLabel: 'Delete',
                      danger: true,
                      onConfirm: () => store().deleteRecord(rec.id),
                    })
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
