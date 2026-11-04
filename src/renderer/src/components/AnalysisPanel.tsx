import { useState } from 'react';
import { appendToPrompt } from '@core/prompt/compose';
import type { PromptSuggestion, SectionStatus } from '@core/prompt/analyze';
import { useApp } from '../store/appStore';
import { useAnalysis, useComposedPrompt, useProvider } from '../store/selectors';

const STATUS_LABEL: Record<SectionStatus, string> = {
  ok: 'Described',
  missing: 'Missing',
  vague: 'Too vague',
  conflict: 'Conflict',
  optional: 'Not specified',
};

function SuggestionItem({ s }: { s: PromptSuggestion }) {
  const prompt = useApp((st) => st.form.prompt);
  const setForm = useApp((st) => st.setForm);
  const reject = useApp((st) => st.rejectSuggestion);
  const toast = useApp((st) => st.toast);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.text);
  const accept = (value: string) => {
    setForm({ prompt: appendToPrompt(prompt, value) });
    toast('info', `Added “${value}” to the prompt.`);
    setEditing(false);
  };
  return (
    <li className="suggestion">
      {editing ? (
        <input
          className="suggestion-edit"
          value={text}
          autoFocus
          aria-label="Edit suggestion text"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim()) accept(text);
            if (e.key === 'Escape') {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
      ) : (
        <div className="suggestion-text">
          <span className="tag">{s.section}</span> “{s.text}”<div className="muted small">{s.rationale}</div>
        </div>
      )}
      <div className="suggestion-actions">
        {editing ? (
          <>
            <button className="btn small primary" disabled={!text.trim()} onClick={() => accept(text)}>
              Add edited
            </button>
            <button className="btn small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn small primary" onClick={() => accept(s.text)} title="Append this text to your prompt">
              Accept
            </button>
            <button className="btn small" onClick={() => setEditing(true)} title="Edit the text before adding it">
              Edit
            </button>
            <button className="btn small" onClick={() => reject(s.id)} title="Hide this suggestion">
              Reject
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function AnalysisPanel() {
  const analysis = useAnalysis();
  const composed = useComposedPrompt();
  const provider = useProvider();
  const rejected = useApp((s) => s.rejectedSuggestions);
  const restore = useApp((s) => s.restoreSuggestions);
  const toast = useApp((s) => s.toast);
  const prompt = useApp((s) => s.form.prompt);
  const suggestions = analysis.suggestions.filter((s) => !rejected.includes(s.id));
  const hiddenCount = analysis.suggestions.length - suggestions.length;
  const problems = analysis.issues.filter((i) => i.severity !== 'info');
  const infos = analysis.issues.filter((i) => i.severity === 'info');

  const copy = async () => {
    if (!composed) return;
    try {
      await navigator.clipboard.writeText(composed.negativePrompt ? `${composed.prompt}\n\nNegative: ${composed.negativePrompt}` : composed.prompt);
      toast('success', 'Final prompt copied.');
    } catch {
      toast('error', 'Could not copy text to the clipboard.');
    }
  };

  return (
    <div className="analysis" aria-label="Smart prompt viewer">
      <div className={`style-banner ${analysis.style.status}`} role="status">
        {analysis.style.status === 'concrete' && (
          <>
            <strong>Style: concrete ✓</strong> {analysis.style.matched.slice(0, 3).join(', ')}
          </>
        )}
        {analysis.style.status === 'vague' && (
          <>
            <strong>Style is too generic.</strong> Name an era/console, bit depth, palette approach, shading or outline. You will be asked to confirm before generating.
          </>
        )}
        {analysis.style.status === 'missing' && (
          <>
            <strong>No style described.</strong> SpriteGen never picks a style for you. Add one (see suggestions) — you will be asked to confirm before generating.
          </>
        )}
      </div>

      {problems.length > 0 && (
        <section aria-label="Problems">
          <h4 className="subhead">Problems</h4>
          <ul className="issues">
            {problems.map((i) => (
              <li key={i.id} className={`issue ${i.severity}`}>
                <span className="sev">{i.severity === 'error' ? 'Error' : 'Warning'}</span> {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Prompt sections">
        <h4 className="subhead">Prompt breakdown</h4>
        {!prompt.trim() && <p className="muted">Start typing a prompt to see it broken into sections.</p>}
        <dl className="sections">
          {analysis.sections.map((sec) => (
            <div key={sec.key} className={`section-row ${sec.status}`}>
              <dt>
                {sec.label}
                <span className={`status-chip ${sec.status}`}>{STATUS_LABEL[sec.status]}</span>
                {sec.source === 'labeled' && <span className="status-chip info">labeled</span>}
              </dt>
              <dd>
                {sec.items.length ? (
                  <ul>
                    {sec.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">—</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {infos.length > 0 && (
          <ul className="issues compact">
            {infos.map((i) => (
              <li key={i.id} className="issue info">
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Suggestions">
        <h4 className="subhead">
          Optional suggestions <span className="muted small">(never applied automatically)</span>
        </h4>
        {suggestions.length === 0 && <p className="muted">No suggestions.</p>}
        <ul className="suggestions">
          {suggestions.map((s) => (
            <SuggestionItem key={s.id} s={s} />
          ))}
        </ul>
        {hiddenCount > 0 && (
          <button className="link-btn" onClick={restore}>
            Show {hiddenCount} rejected suggestion{hiddenCount === 1 ? '' : 's'}
          </button>
        )}
      </section>

      <section aria-label="Final prompt">
        <h4 className="subhead row-between">
          <span>Exact final prompt → {provider?.displayName ?? 'provider'}</span>
          <button className="btn small" onClick={copy} disabled={!composed?.prompt}>
            Copy
          </button>
        </h4>
        <pre className="final-prompt" data-testid="final-prompt">
          {composed?.prompt || '—'}
        </pre>
        <div className="kv">
          <span>Negative prompt field</span>
          <span className="mono">{composed?.negativePrompt ?? (provider?.capabilities.supportsNegativePrompt ? '(empty)' : '(not supported — merged above)')}</span>
        </div>
        {composed && composed.appendedConstraints.length > 0 && (
          <p className="muted small">
            Added by app (toggle under “Technical constraints”): {composed.appendedConstraints.map((c) => `“${c}”`).join(', ')}
          </p>
        )}
        {composed?.notes.map((n) => (
          <p key={n} className={`hint ${composed.tooLong ? 'error' : ''}`}>
            {n}
          </p>
        ))}
      </section>
    </div>
  );
}
