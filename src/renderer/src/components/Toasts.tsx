import { useApp } from '../store/appStore';
import { CloseIcon } from './Icons';

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <div className="toast-body">
            <div>{t.message}</div>
            {t.detail && <div className="small muted mono">{t.detail}</div>}
          </div>
          <button className="icon-btn" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
