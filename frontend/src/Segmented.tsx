/** Umschalter mit zwei (oder mehr) Möglichkeiten, z. B. „Privat | Öffentlich“. */
export function Segmented<T extends string | boolean | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented-row">
      <span className="segmented-label">{props.label}</span>
      <div className="segmented" role="radiogroup" aria-label={props.label}>
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            className={o.value === props.value ? 'on' : undefined}
            disabled={props.disabled}
            onClick={() => o.value !== props.value && props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
