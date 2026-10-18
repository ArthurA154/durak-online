import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Knopf in der Kopfleiste, der ein kleines Fenster darunter öffnet (schließt bei Escape/Klick daneben). */
export function Popover(props: { icon: ReactNode; label: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="popover" ref={ref}>
      <button
        type="button"
        className={`icon-btn${open ? ' active' : ''}`}
        aria-label={props.label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {props.icon}
      </button>
      {open && (
        <div className={`popover-panel ${props.className ?? ''}`} role="dialog" aria-label={props.label}>
          {props.children}
        </div>
      )}
    </div>
  );
}
