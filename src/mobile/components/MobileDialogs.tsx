import { useEffect } from 'react';
import { useApp } from '@renderer/store/appStore';
import { AnalysisPanel } from '@renderer/components/AnalysisPanel';
import { FilterPanel } from '@renderer/components/FilterPanel';
import { PropertiesPanel } from '@renderer/components/RightPanel';
import { ConfirmDialog, ExportDialog, StyleWarningDialog } from '@renderer/components/Dialogs';
import { Modal } from '@renderer/components/Modal';
import { useMobileUi } from '../state';

const SHEET_TITLES = { analysis: 'Prompt analysis', filters: 'Filters & presets', info: 'Sprite properties' } as const;

/** Bottom sheets plus the shared dialogs, adapted to mobile navigation. */
export function MobileDialogs() {
  const dialog = useApp((s) => s.dialog);
  const closeDialog = useApp((s) => s.closeDialog);
  const sheet = useMobileUi((s) => s.sheet);
  const openSheet = useMobileUi((s) => s.openSheet);
  const openSettings = useMobileUi((s) => s.openSettings);
  const setTab = useMobileUi((s) => s.setTab);

  useEffect(() => {
    // Settings is a full screen on mobile, not a dialog.
    if (dialog?.kind === 'settings') {
      openSettings(dialog.providerId);
      closeDialog();
    }
    if (dialog?.kind === 'style-warning') setTab('create');
  }, [dialog, openSettings, closeDialog, setTab]);

  return (
    <>
      {sheet && (
        <Modal title={SHEET_TITLES[sheet]} onClose={() => openSheet(null)}>
          {sheet === 'analysis' && <AnalysisPanel />}
          {sheet === 'filters' && <FilterPanel />}
          {sheet === 'info' && <PropertiesPanel />}
        </Modal>
      )}
      {dialog?.kind === 'export' && <ExportDialog mode={dialog.mode} />}
      {dialog?.kind === 'style-warning' && <StyleWarningDialog analysis={dialog.analysis} />}
      {dialog?.kind === 'confirm' && <ConfirmDialog {...dialog} />}
    </>
  );
}
