import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { useApp, toProjectData } from '@renderer/store/appStore';
import { useProvider } from '@renderer/store/selectors';
import { GenerationStatus } from '@renderer/components/CenterPanel';
import { Toasts } from '@renderer/components/Toasts';
import type { MobileApi } from './platform/backend';
import { useMobileUi, type MobileTab } from './state';
import { CreateScreen } from './components/CreateScreen';
import { EditScreen } from './components/EditScreen';
import { LibraryScreen } from './components/LibraryScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { MobileDialogs } from './components/MobileDialogs';
import { TabIcon } from './components/icons';

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'create', label: 'Create' },
  { id: 'edit', label: 'Editor' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' },
];

const TITLES: Record<MobileTab, string> = { create: 'Create sprite', edit: 'Editor', library: 'Library', settings: 'Settings' };

export function MobileApp({ backend }: { backend: MobileApi }) {
  const ready = useApp((s) => s.ready);
  const init = useApp((s) => s.init);
  const theme = useApp((s) => s.prefs?.theme ?? 'system');
  const project = useApp((s) => s.project);
  const historyHead = useApp((s) => s.project.history[0]?.id);
  const tab = useMobileUi((s) => s.tab);
  const setTab = useMobileUi((s) => s.setTab);
  const provider = useProvider();
  const lastHead = useRef<string | undefined>(undefined);

  useEffect(() => {
    init().catch((e) => useApp.getState().toast('error', `Startup failed: ${(e as Error).message}`));
  }, [init]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // A finished generation opens the editor on the new sprite.
  useEffect(() => {
    if (!ready) return;
    if (lastHead.current !== undefined && historyHead && historyHead !== lastHead.current) setTab('edit');
    lastHead.current = historyHead ?? '';
  }, [historyHead, ready, setTab]);

  // Native lifecycle: save when backgrounded; Android back button closes overlays first.
  useEffect(() => {
    if (!backend.platform.isNative) return;
    const handles = [
      CapApp.addListener('pause', () => {
        const s = useApp.getState();
        void backend.flushAutosave(toProjectData(s.project), s.project.path);
      }),
      CapApp.addListener('backButton', () => {
        const app = useApp.getState();
        const ui = useMobileUi.getState();
        if (app.dialog) app.closeDialog();
        else if (ui.sheet) ui.openSheet(null);
        else if (ui.tab !== 'create') ui.setTab('create');
        else void CapApp.minimizeApp();
      }),
    ];
    return () => handles.forEach((h) => void h.then((x) => x.remove()));
  }, [backend]);

  return (
    <div className="m-app" aria-busy={!ready}>
      <header className="m-topbar">
        <div className="m-title">
          <span className="logo" aria-hidden />
          <div>
            <h1>{TITLES[tab]}</h1>
            <div className="m-subtitle" title={project.path ?? 'Not saved yet'}>
              {project.name}
              {project.dirty ? ' •' : ''}
            </div>
          </div>
        </div>
        <button className={`provider-pill ${provider?.isMock ? 'mock' : ''}`} onClick={() => useMobileUi.getState().openSettings(provider?.id)}>
          {provider ? (provider.isMock ? 'MOCK — not AI' : provider.displayName.split(' (')[0]) : '—'}
        </button>
      </header>
      <div className="m-status">
        <GenerationStatus />
      </div>
      <main className={`m-screen m-screen-${tab}`}>
        {tab === 'create' && <CreateScreen />}
        {tab === 'edit' && <EditScreen />}
        {tab === 'library' && <LibraryScreen backend={backend} />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
      <nav className="m-tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <TabIcon tab={t.id} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <MobileDialogs />
      <Toasts />
    </div>
  );
}
