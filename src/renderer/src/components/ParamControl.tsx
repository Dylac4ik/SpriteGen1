import { useId } from 'react';
import type { ParamSpec } from '@core/params';

interface Props {
  spec: ParamSpec;
  value: number | string | boolean | undefined;
  onChange(value: number | string | boolean): void;
  disabled?: boolean;
}

/** Renders a labeled, keyboard-accessible control for a declarative ParamSpec. */
export function ParamControl({ spec, value, onChange, disabled }: Props) {
  const id = useId();
  const v = value ?? spec.default;
  switch (spec.kind) {
    case 'range':
      return (
        <div className="field field-range" title={spec.tooltip}>
          <label htmlFor={id}>
            {spec.label}
            <output htmlFor={id} className="value">
              {Number(v)}
              {spec.unit ?? ''}
            </output>
          </label>
          <input
            id={id}
            type="range"
            min={spec.min}
            max={spec.max}
            step={spec.step}
            value={Number(v)}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      );
    case 'select':
      return (
        <div className="field" title={spec.tooltip}>
          <label htmlFor={id}>{spec.label}</label>
          <select id={id} value={String(v)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            {spec.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case 'color':
      return (
        <div className="field field-inline" title={spec.tooltip}>
          <label htmlFor={id}>{spec.label}</label>
          <input id={id} type="color" value={String(v).slice(0, 7)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'boolean':
      return (
        <label className="check" title={spec.tooltip}>
          <input type="checkbox" checked={Boolean(v)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {spec.label}
        </label>
      );
    case 'text':
      return (
        <div className="field" title={spec.tooltip}>
          <label htmlFor={id}>{spec.label}</label>
          <input id={id} type="text" value={String(v)} maxLength={spec.maxLength} placeholder={spec.placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
  }
}
