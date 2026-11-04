import { useEffect } from 'react';
import type { MenuCommand } from '@shared/types';
import { api } from './api';
import { useApp } from './store/appStore';
import { isEditableTarget, nextZoom } from './util';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/LeftPanel';
import { CenterPanel } from './components/CenterPanel';
import { RightPanel } from './components/RightPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { Dialogs } from './components/Dialogs';
import { Toasts } from './components/Toasts';
import { findSelected } from './store/appStore';

function runCommand(cmd: MenuCommand) {
  const s = useApp.getState();
  const selected = findSelected(s);
  const size = selected?.record.request.size;
  const editable = isEditableTarget(document.activeElement);
  switch (cmd) {
    case 'new-project':
      return s.newProject();
    case 'open-project':
      return void s.openProject();
    case 'save-project':
      return void s.saveProject(false);
    case 'save-project-as':
      return void s.saveProject(true);
    case 'export-png':
      return selected ? s.openDialog({ kind: 'export', mode: 'sprite' }) : s.toast('warning', 'Select a sprite to export.');
    case 'export-sheet':
      return selected ? s.openDialog({ kind: 'export', mode: 'sheet' }) : s.toast('warning', 'Select a generation to export.');
    case 'copy-image':
      return void s.copySprite({ scale: 1, includeFilters: true });
    case 'undo':
      // Text fields keep their native undo; otherwise undo sprite edits/filters.
      return editable ? api().nativeEdit('undo') : s.undo();
    case 'redo':
      return editable ? api().nativeEdit('redo') : s.redo();
    case 'generate':
      return s.dialog ? undefined : void s.generate();
    case 'cancel-generation':
      return s.cancelGeneration();
    case 'zoom-in':
      return size && s.setEditor({ zoom: nextZoom(s.editor.zoom, 1, size) });
    case 'zoom-out':
      return size && s.setEditor({ zoom: nextZoom(s.editor.zoom, -1, size) });
    case 'zoom-fit':
      return s.setEditor({ fitRequest: s.editor.fitRequest + 1 });
    case 'zoom-actual':
      return s.setEditor({ zoom: 1 });
    case 'toggle-grid':
      return s.setEditor({ showGrid: !s.editor.showGrid });
    case 'toggle-compare':
      return s.setEditor({ compare: !s.editor.compare });
    case 'open-settings':
      return s.openDialog({ kind: 'settings', tab: 'providers' });
    case 'reset-original':
      return s.resetToOriginal();
  }
}

export function App() {
  const ready = useApp((s) => s.ready);
  const theme = useApp((s) => s.prefs?.theme ?? 'system');
  const init = useApp((s) => s.init);

  useEffect(() => {
    init().catch((e) => useApp.getState().toast('error', `Startup failed: ${(e as Error).message}`));
    const off = api().onMenuCommand(runCommand);
    const onKey = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (e.key === 'Escape' && s.job && !s.dialog) {
        s.cancelGeneration();
        return;
      }
      if (s.dialog || e.ctrlKey || e.metaKey || e.altKey || isEditableTarget(document.activeElement)) return;
      const tools: Record<string, 'pencil' | 'eraser' | 'picker' | 'fill'> = { b: 'pencil', e: 'eraser', i: 'picker', g: 'fill' };
      const tool = tools[e.key.toLowerCase()];
      if (tool) {
        s.setEditor({ tool });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      off();
      window.removeEventListener('keydown', onKey);
    };
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app" aria-busy={!ready}>
      <TopBar />
      <main className="workspace">
        <aside className="panel left" aria-label="Prompt and generation settings">
          <LeftPanel />
        </aside>
        <section className="panel center" aria-label="Sprite preview and editor">
          <CenterPanel />
        </section>
        <aside className="panel right" aria-label="Prompt analysis, filters and properties">
          <RightPanel />
        </aside>
      </main>
      <footer className="panel bottom" aria-label="History and variations">
        <HistoryPanel />
      </footer>
      <Dialogs />
      <Toasts />
    </div>
  );
}
