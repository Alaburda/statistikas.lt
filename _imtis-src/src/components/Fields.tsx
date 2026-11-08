import { useId, type ReactNode } from "react";
import { PCT } from "../i18n";

/** Text input for numbers: type="number" rejects the decimal comma on many phones. */
export function NumField({
  label,
  hint,
  value,
  onChange,
  suffix,
  error,
  placeholder,
  decimal = true,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  error?: string | null;
  placeholder?: string;
  decimal?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input
          id={id}
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          aria-invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      {error ? <p className="field-error">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/** A percentage dragged rather than typed, for rough guesses. The value stays in the URL as text. */
export function SliderField({
  label,
  hint,
  value,
  onChange,
  min = 1,
  max = 100,
  error,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  error?: string | null;
}) {
  const id = useId();
  const n = Number(value.replace(",", "."));
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      <div className="slider-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {value}
          {PCT}
        </output>
      </div>
      <input
        id={id}
        className="slider"
        type="range"
        min={min}
        max={max}
        step={1}
        value={Number.isFinite(n) ? n : min}
        aria-valuetext={`${value}${PCT}`}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <p className="field-error">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <input id={id} type="text" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const withIcons = options.some((o) => o.icon);
  return (
    <div className="field">
      <span className="field-label" id={`seg-${label}`}>
        {label}
      </span>
      <div className={`segmented ${withIcons ? "with-icons" : ""}`} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Check({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function More({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="more" open={open}>
      <summary>{title}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

/** The live answer pinned under the fold on phones, where the result card is off screen. */
export function Peek({ value, label }: { value: string; label: string }) {
  return (
    <div className="peek" aria-hidden="true">
      <b>{value}</b> {label}
    </div>
  );
}

/** A warning or a note attached to the result. Always text plus label, never colour alone. */
export function Notice({ kind = "warn", title, children }: { kind?: "warn" | "info"; title: string; children?: ReactNode }) {
  return (
    <div className={`notice ${kind}`} role={kind === "warn" ? "alert" : undefined}>
      <strong>{title}</strong>
      {children && <span> {children}</span>}
    </div>
  );
}
