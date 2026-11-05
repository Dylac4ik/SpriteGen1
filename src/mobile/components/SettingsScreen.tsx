import { useEffect, useState } from 'react';
import { useApp } from '@renderer/store/appStore';
import { PreferencesSettings, ProviderSettings } from '@renderer/components/Dialogs';
import { useMobileUi } from '../state';

export function SettingsScreen() {
  const appInfo = useApp((s) => s.appInfo);
  const activeId = useApp((s) => s.providerId);
  const requested = useMobileUi((s) => s.settingsProviderId);
  const [selected, setSelected] = useState(requested ?? activeId);
  useEffect(() => {
    if (requested) setSelected(requested);
  }, [requested]);
  return (
    <div className="m-settings">
      <section className="m-card" aria-labelledby="m-providers-h">
        <h2 id="m-providers-h">Generation providers</h2>
        <ProviderSettings providerId={selected} onSelect={setSelected} />
      </section>
      <section className="m-card" aria-labelledby="m-prefs-h">
        <h2 id="m-prefs-h">Preferences</h2>
        <PreferencesSettings />
      </section>
      <section className="m-card" aria-labelledby="m-about-h">
        <h2 id="m-about-h">About</h2>
        <dl className="kv-list">
          <dt>Version</dt>
          <dd>{appInfo?.version ?? '—'}</dd>
          <dt>Platform</dt>
          <dd>{appInfo?.platform ?? '—'}</dd>
          <dt>API key storage</dt>
          <dd>{appInfo?.secureStorage.available ? `Secure (${appInfo.secureStorage.backend})` : 'Session only (no secure storage in this build)'}</dd>
          <dt>Data</dt>
          <dd>{appInfo?.userDataPath ?? '—'}</dd>
        </dl>
        <p className="hint">The Mock provider makes procedural placeholder sprites offline. It is not AI and does not depict your subject.</p>
      </section>
    </div>
  );
}
