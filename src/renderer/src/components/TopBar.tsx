import { useApp } from '../store/appStore';
import { useProvider, useSelected } from '../store/selectors';

export function TopBar() {
  const project = useApp((s) => s.project);
  const newProject = useApp((s) => s.newProject);
  const openProject = useApp((s) => s.openProject);
  const saveProject = useApp((s) => s.saveProject);
  const openDialog = useApp((s) => s.openDialog);
  const copySprite = useApp((s) => s.copySprite);
  const selected = useSelected();
  const provider = useProvider();
  return (
    <header className="topbar">
      <div className="brand" aria-label="SpriteGen">
        <span className="logo" aria-hidden />
        SpriteGen
      </div>
      <div className="project-name" title={project.path ?? 'Not saved yet'}>
        {project.name}
        {project.dirty ? ' •' : ''}
        <span className="muted small">{project.path ? '' : ' (unsaved)'}</span>
      </div>
      <nav className="top-actions" aria-label="Project">
        <button className="btn small" onClick={() => newProject()} title="New project (Ctrl+N)">
          New
        </button>
        <button className="btn small" onClick={() => void openProject()} title="Open project (Ctrl+O)">
          Open…
        </button>
        <button className="btn small" onClick={() => void saveProject(false)} title="Save project (Ctrl+S)">
          Save
        </button>
        <button className="btn small" onClick={() => void saveProject(true)} title="Save project as (Ctrl+Shift+S)">
          Save as…
        </button>
        <span className="divider" />
        <button className="btn small" disabled={!selected} onClick={() => openDialog({ kind: 'export', mode: 'sprite' })} title="Export PNG (Ctrl+E)">
          Export PNG…
        </button>
        <button className="btn small" disabled={!selected} onClick={() => void copySprite({ scale: 1, includeFilters: true })} title="Copy native-size sprite to clipboard (Ctrl+Shift+C)">
          Copy
        </button>
        <span className="divider" />
        <button className="btn small" onClick={() => openDialog({ kind: 'settings', tab: 'providers' })} title="Settings (Ctrl+,)">
          Settings
        </button>
      </nav>
      <div className={`provider-pill ${provider?.isMock ? 'mock' : ''}`} title={provider?.description}>
        {provider ? (provider.isMock ? 'MOCK provider — not AI' : provider.displayName) : 'No provider'}
      </div>
    </header>
  );
}
