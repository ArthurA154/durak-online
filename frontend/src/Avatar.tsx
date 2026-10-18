import type { CSSProperties } from 'react';
import { AVATAR_COLORS } from '@durak/shared';

export type Expression = 'neutral' | 'happy' | 'sad' | 'shocked' | 'focus';

const INK = '#1d1d24';

export const colorOf = (index: number) => AVATAR_COLORS[index] ?? AVATAR_COLORS[0];

interface Props {
  color: number;
  expression?: Expression;
  /** Narrenkappe für den Durak der letzten Partie */
  hat?: boolean;
  /** Versatz fürs Blinzeln, damit nicht alle gleichzeitig blinzeln */
  seed?: string;
}

/** Einfache Figur wie bei skribbl.io: Farbe, zwei Punkte als Augen, ein Strich als Mund. */
export function Avatar({ color, expression = 'neutral', hat, seed = '' }: Props) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const blink = { animationDelay: `${(h % 40) / 10}s` } as CSSProperties;
  const eyeR = expression === 'shocked' ? 7 : 5.5;

  return (
    <span className="figure">
      <svg viewBox="0 0 100 100" className="figure-face" aria-hidden="true">
        <circle cx="50" cy="50" r="50" fill={colorOf(color)} />
        <ellipse cx="38" cy="24" rx="20" ry="9" fill="#fff" opacity="0.22" />
        <g className="figure-eyes" style={blink}>
          <circle cx="36" cy="46" r={eyeR} fill={INK} />
          <circle cx="64" cy="46" r={eyeR} fill={INK} />
        </g>
        <Mouth expression={expression} />
      </svg>
      {hat && <JesterHat />}
    </span>
  );
}

function Mouth({ expression }: { expression: Expression }) {
  const line = { stroke: INK, strokeWidth: 5, strokeLinecap: 'round' as const, fill: 'none' };
  switch (expression) {
    case 'happy':
      return <path d="M34 62 Q50 78 66 62" {...line} />;
    case 'sad':
      return <path d="M36 72 Q50 60 64 72" {...line} />;
    case 'shocked':
      return <ellipse cx="50" cy="69" rx="7" ry="9" fill={INK} />;
    case 'focus':
      return <path d="M42 68 L58 68" {...line} />;
    default:
      return <path d="M37 66 L63 66" {...line} />;
  }
}

function JesterHat() {
  return (
    <svg viewBox="0 0 100 62" className="figure-hat" aria-label="Narrenkappe">
      <path d="M24 50 Q12 24 3 15 Q28 18 44 48 Z" fill="#e03131" />
      <path d="M76 50 Q88 24 97 15 Q72 18 56 48 Z" fill="#e03131" />
      <path d="M36 49 Q46 14 50 5 Q54 14 64 49 Z" fill="#7048e8" />
      <rect x="18" y="44" width="64" height="14" rx="7" fill="#ffd43b" />
      <circle cx="3" cy="15" r="6" fill="#ffd43b" />
      <circle cx="97" cy="15" r="6" fill="#ffd43b" />
      <circle cx="50" cy="5" r="6" fill="#ffd43b" />
    </svg>
  );
}
