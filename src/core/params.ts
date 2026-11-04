/** Declarative parameter descriptions; the UI renders controls from these. */
export type ParamSpec =
  | {
      kind: 'range';
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
      tooltip?: string;
    }
  | {
      kind: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
      tooltip?: string;
    }
  | { kind: 'color'; key: string; label: string; default: string; tooltip?: string }
  | { kind: 'boolean'; key: string; label: string; default: boolean; tooltip?: string }
  | { kind: 'text'; key: string; label: string; default: string; maxLength?: number; placeholder?: string; tooltip?: string };

export type ParamValues = Record<string, number | string | boolean>;

export function defaultParams(specs: readonly ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}

/**
 * Coerces arbitrary input into valid values for the given specs: clamps ranges,
 * snaps to step, rejects unknown select options, validates colors. Unknown keys are dropped.
 */
export function sanitizeParams(specs: readonly ParamSpec[], input: unknown): ParamValues {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: ParamValues = {};
  for (const s of specs) {
    const v = src[s.key];
    switch (s.kind) {
      case 'range': {
        let n = typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
        if (!Number.isFinite(n)) n = s.default;
        n = Math.min(s.max, Math.max(s.min, n));
        if (s.step > 0) n = Math.round((n - s.min) / s.step) * s.step + s.min;
        out[s.key] = Number(n.toFixed(6));
        break;
      }
      case 'select':
        out[s.key] = typeof v === 'string' && s.options.some((o) => o.value === v) ? v : s.default;
        break;
      case 'color':
        out[s.key] = typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.toLowerCase() : s.default;
        break;
      case 'boolean':
        out[s.key] = typeof v === 'boolean' ? v : s.default;
        break;
      case 'text': {
        const t = typeof v === 'string' ? v : s.default;
        out[s.key] = s.maxLength ? t.slice(0, s.maxLength) : t;
        break;
      }
    }
  }
  return out;
}
