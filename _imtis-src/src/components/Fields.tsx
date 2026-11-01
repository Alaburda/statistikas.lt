import { useId, type ReactNode } from "react";

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
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <span className="field-label" id={`seg-${label}`}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={o.value === value ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
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
