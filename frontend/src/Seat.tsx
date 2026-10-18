import type { CSSProperties } from 'react';
import { CardBack } from './CardView';
import { Avatar, type Expression } from './Avatar';

/** Plätze am Tisch, von oben gesehen. „bottom“ ist immer man selbst. */
export type SeatPos = 'bottom' | 'left' | 'top' | 'right' | 'top-left' | 'top-right';

/** Sitzordnung im Uhrzeigersinn ab mir (unten) – passend zur Spielreihenfolge. */
export function opponentPositions(count: number): SeatPos[] {
  if (count <= 1) return ['top'];
  if (count === 2) return ['top-left', 'top-right'];
  return ['left', 'top', 'right'];
}

interface Props {
  pos: SeatPos;
  id?: string;
  name?: string;
  color?: number;
  expression?: Expression;
  hat?: boolean;
  /** Leerer Stuhl (Lobby) */
  empty?: boolean;
  role?: 'attacker' | 'defender' | null;
  done?: boolean;
  offline?: boolean;
  out?: boolean;
  cardCount?: number;
  note?: string;
  /** Sichtbarer Zug-Countdown (letzte 10 s) */
  countdown?: { seconds: number; fraction: number } | null;
}

/** Ein Platz am Tisch mit Figur, Name, Kartenfächer und Status. */
export function Seat(props: Props) {
  const { pos, id, name = '', color = 0, expression, hat, empty, role, done, offline, out } = props;
  const { cardCount, note, countdown } = props;
  const classes = [
    'seat',
    `pos-${pos}`,
    role && `is-${role}`,
    offline && 'is-offline',
    out && 'is-out',
    empty && 'is-empty',
    countdown && 'is-timed',
  ]
    .filter(Boolean)
    .join(' ');
  const fan = Math.min(cardCount ?? 0, 8);
  return (
    <div className={classes} data-seat={id}>
      {fan > 0 && !out && (
        <div className="seat-fan" aria-hidden="true">
          {Array.from({ length: fan }, (_, i) => (
            <CardBack
              key={i}
              mini
              style={{ '--r': `${(i - (fan - 1) / 2) * 8}deg`, '--k': i } as CSSProperties}
            />
          ))}
        </div>
      )}
      <div className="avatar">
        {!empty && <Avatar color={color} expression={expression} hat={hat} seed={id ?? name} />}
        {countdown && (
          <>
            <span className="timer-ring" style={{ '--p': countdown.fraction } as CSSProperties} />
            <span className="timer-num" aria-label={`noch ${countdown.seconds} Sekunden`}>
              {countdown.seconds}
            </span>
          </>
        )}
        {done && (
          <span className="avatar-badge done" title="ist fertig">
            ✓
          </span>
        )}
        {cardCount !== undefined && !out && <span className="avatar-badge count">{cardCount}</span>}
      </div>
      <div className="seat-name">{empty ? 'frei' : name}</div>
      {note && <div className="seat-note">{note}</div>}
    </div>
  );
}
