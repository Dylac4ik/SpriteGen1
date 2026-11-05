import { LeftPanel } from '@renderer/components/LeftPanel';
import { useAnalysis } from '@renderer/store/selectors';
import { useMobileUi } from '../state';

/** Prompt + settings. Reuses the desktop left panel, which is already a single column. */
export function CreateScreen() {
  const analysis = useAnalysis();
  const openSheet = useMobileUi((s) => s.openSheet);
  const warnings = analysis.issues.filter((i) => i.severity === 'warning').length;
  const errors = analysis.issues.filter((i) => i.severity === 'error').length;
  return (
    <div
      className="m-create"
      onClickCapture={(e) => {
        // The style badge next to the prompt label opens the analysis sheet on mobile.
        if ((e.target as HTMLElement).closest('.badge-btn')) {
          e.stopPropagation();
          openSheet('analysis');
        }
      }}
    >
      <button className={`m-analysis-card ${analysis.style.status}`} onClick={() => openSheet('analysis')}>
        <span>
          <strong>Prompt analysis</strong>
          <span className="small">
            {analysis.style.status === 'concrete' ? 'Style described' : analysis.style.status === 'vague' ? 'Style too generic' : 'No style yet'}
            {errors ? ` · ${errors} error${errors > 1 ? 's' : ''}` : ''}
            {warnings ? ` · ${warnings} warning${warnings > 1 ? 's' : ''}` : ''} · sections, suggestions, final prompt
          </span>
        </span>
        <span aria-hidden>›</span>
      </button>
      <LeftPanel showShortcuts={false} />
    </div>
  );
}
