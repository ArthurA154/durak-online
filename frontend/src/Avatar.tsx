import type { CSSProperties } from 'react';
import { AVATAR_COLORS, DEFAULT_LOOK, LOOK_EYES, LOOK_HATS, LOOK_MOUTHS, type Look } from '@durak/shared';

export type Expression = 'neutral' | 'happy' | 'sad' | 'shocked' | 'focus';

const INK = '#1d1d24';

export const colorOf = (index: number) => AVATAR_COLORS[index] ?? AVATAR_COLORS[0];

interface Props {
  color: number;
  /** Augen, Mund, Accessoire (selbst gestaltet) */
  look?: Look;
  expression?: Expression;
  /** Narrenkappe für den Durak der letzten Partie (ersetzt das Accessoire) */
  hat?: boolean;
  /** Versatz fürs Blinzeln, damit nicht alle gleichzeitig blinzeln */
  seed?: string;
}

/** Einfache Figur wie bei skribbl.io: Farbe, Augen, Mund – dazu Brille, Zigarre, Hut nach Wahl. */
export function Avatar({ color, look = DEFAULT_LOOK, expression = 'neutral', hat, seed = '' }: Props) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const blink = { animationDelay: `${(h % 40) / 10}s` } as CSSProperties;
  const eyes = LOOK_EYES[look.eyes] ?? 'dots';
  const mouth = LOOK_MOUTHS[look.mouth] ?? 'plain';
  const accessory = LOOK_HATS[look.hat] ?? 'none';

  return (
    <span className="figure">
      <svg viewBox="0 0 100 100" className="figure-face" aria-hidden="true">
        {!hat && <AccessoryBack kind={accessory} />}
        <circle cx="50" cy="50" r="50" fill={colorOf(color)} />
        <ellipse cx="38" cy="24" rx="20" ry="9" fill="#fff" opacity="0.22" />
        <Eyes kind={eyes} expression={expression} blink={blink} />
        <MouthStyle kind={mouth} expression={expression} />
        {!hat && <Accessory kind={accessory} />}
      </svg>
      {hat && <JesterHat />}
    </span>
  );
}

const line = { stroke: INK, strokeWidth: 4.5, strokeLinecap: 'round' as const, fill: 'none' };

const heart = (x: number, y: number) =>
  `M${x} ${y + 7} C${x - 13} ${y - 1} ${x - 7} ${y - 11} ${x} ${y - 4} C${x + 7} ${y - 11} ${x + 13} ${y - 1} ${x} ${y + 7} Z`;

function star(x: number, y: number, r: number) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(x + Math.cos(a) * rr).toFixed(1)},${(y + Math.sin(a) * rr).toFixed(1)}`;
  });
  return pts.join(' ');
}

function Eyes({ kind, expression, blink }: { kind: string; expression: Expression; blink: CSSProperties }) {
  const r = expression === 'shocked' ? 7 : 5.5;
  const left = <circle cx="36" cy="46" r={r} fill={INK} />;
  const right = <circle cx="64" cy="46" r={r} fill={INK} />;
  const dots = (
    <g className="figure-eyes" style={blink}>
      {left}
      {right}
    </g>
  );
  switch (kind) {
    case 'sleepy':
      return (
        <g>
          <path d="M29 47 Q36 52 43 47" {...line} />
          <path d="M57 47 Q64 52 71 47" {...line} />
        </g>
      );
    case 'wink':
      return (
        <g>
          {left}
          <path d="M57 47 Q64 40 71 47" {...line} />
        </g>
      );
    case 'glasses':
      return (
        <g>
          {dots}
          <circle cx="36" cy="46" r="12" fill="#fff" fillOpacity="0.18" stroke={INK} strokeWidth="3.5" />
          <circle cx="64" cy="46" r="12" fill="#fff" fillOpacity="0.18" stroke={INK} strokeWidth="3.5" />
          <path d="M48 45 Q50 42 52 45" stroke={INK} strokeWidth="3.5" fill="none" />
        </g>
      );
    case 'sunglasses':
      return (
        <g>
          <path d="M18 38 H48 Q48 56 34 56 Q20 56 18 38 Z" fill={INK} />
          <path d="M52 38 H82 Q80 56 66 56 Q52 56 52 38 Z" fill={INK} />
          <path d="M14 38 H86" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <path d="M24 42 L32 42" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
          <path d="M58 42 L66 42" stroke="#fff" strokeOpacity="0.5" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'angry':
      return (
        <g>
          {dots}
          <path d="M26 33 L44 39" {...line} />
          <path d="M74 33 L56 39" {...line} />
        </g>
      );
    case 'hearts':
      return (
        <g>
          <path d={heart(36, 46)} fill="#e03131" />
          <path d={heart(64, 46)} fill="#e03131" />
        </g>
      );
    case 'stars':
      return (
        <g>
          <polygon points={star(36, 46, 10)} fill="#ffd43b" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <polygon points={star(64, 46, 10)} fill="#ffd43b" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        </g>
      );
    case 'eyepatch':
      return (
        <g>
          {left}
          <path d="M6 30 L94 54" stroke={INK} strokeWidth="3" />
          <ellipse cx="64" cy="47" rx="12" ry="10" fill={INK} />
        </g>
      );
    case 'monocle':
      return (
        <g>
          {dots}
          <path d="M28 36 L44 36" {...line} strokeWidth="3.5" />
          <circle cx="64" cy="46" r="12" fill="#fff" fillOpacity="0.2" stroke="#fcc419" strokeWidth="3.5" />
          <path d="M75 52 Q82 70 72 86" stroke="#fcc419" strokeWidth="2" fill="none" />
        </g>
      );
    case 'visor':
      return (
        <g>
          <rect x="14" y="37" width="72" height="17" rx="8.5" fill="#ff2d55" />
          <rect x="14" y="37" width="72" height="17" rx="8.5" fill="none" stroke={INK} strokeWidth="3" />
          <path d="M22 43 H50" stroke="#fff" strokeOpacity="0.7" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    default:
      return dots;
  }
}

/** Mund: Grinsen, Zunge, Vampir ersetzen den normalen Mund (außer bei traurig/schockiert); Rest kommt dazu */
function MouthStyle({ kind, expression }: { kind: string; expression: Expression }) {
  const moody = expression === 'sad' || expression === 'shocked';
  if (!moody && kind === 'grin')
    return (
      <g>
        <path d="M28 60 H72 Q70 84 50 85 Q30 84 28 60 Z" fill={INK} />
        <path d="M31 61 H69 V67 Q50 70 31 67 Z" fill="#fff" />
        <path d="M43 61 V68 M57 61 V68" stroke={INK} strokeWidth="1.5" />
        <path d="M40 79 Q50 74 60 79 Q50 84 40 79 Z" fill="#ff6b8a" />
      </g>
    );
  if (!moody && kind === 'tongue')
    return (
      <g>
        <path d="M44 66 Q44 84 51 84 Q58 84 58 66 Z" fill="#ff6b8a" stroke={INK} strokeWidth="2.5" />
        <path d="M51 70 V78" stroke="#c2255c" strokeWidth="2" strokeLinecap="round" />
        <path d="M32 62 Q50 72 68 62" {...line} />
      </g>
    );
  if (!moody && kind === 'fangs')
    return (
      <g>
        <path d="M33 62 Q50 76 67 62" {...line} />
        <path d="M39 65 L42 75 L46 67 Z" fill="#fff" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M54 67 L58 75 L61 65 Z" fill="#fff" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      </g>
    );
  return (
    <g>
      <Mouth expression={expression} />
      {kind === 'cigar' && (
        <g transform="rotate(14 62 68)">
          <rect x="58" y="64" width="28" height="7" rx="2" fill="#8d5524" />
          <rect x="58" y="64" width="6" height="7" fill="#c9a26b" />
          <rect x="84" y="64" width="5" height="7" rx="1.5" fill="#ff6b3d" />
        </g>
      )}
      {kind === 'pipe' && (
        <g>
          <path d="M56 67 Q66 72 74 70" stroke="#5c3a21" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <path d="M70 58 H84 V68 Q84 76 77 76 Q70 76 70 68 Z" fill="#7a4a29" />
          <ellipse cx="77" cy="58" rx="7" ry="2.5" fill="#3b2416" />
          <circle cx="80" cy="48" r="3" fill="#fff" opacity="0.45" />
          <circle cx="85" cy="40" r="4" fill="#fff" opacity="0.3" />
        </g>
      )}
      {kind === 'bubblegum' && (
        <g>
          <circle cx="58" cy="72" r="13" fill="#ff8cc6" stroke="#e64980" strokeWidth="2" />
          <ellipse cx="53" cy="67" rx="4" ry="2.5" fill="#fff" opacity="0.7" />
        </g>
      )}
      {kind === 'handlebar' && (
        <path
          d="M50 59 Q40 53 31 59 Q24 64 19 56 Q19 66 28 66 Q38 66 50 62 Q62 66 72 66 Q81 66 81 56 Q76 64 69 59 Q60 53 50 59 Z"
          fill="#3b2a20"
        />
      )}
    </g>
  );
}

/** Kappe, die den Kopf oberhalb von y = `bottom` genau abdeckt (Kopf: Kreis r=50 um 50/50) – darunter guckt nichts raus */
function capPath(bottom: number, r = 52): string {
  const w = Math.sqrt(r * r - (50 - bottom) ** 2);
  return `M${(50 - w).toFixed(1)} ${bottom} A ${r} ${r} 0 0 1 ${(50 + w).toFixed(1)} ${bottom} Z`;
}

/** Teile hinter dem Kopf (z. B. Hörner des Wikingers liegen sonst über dem Gesicht) */
function AccessoryBack({ kind }: { kind: string }) {
  if (kind === 'halo')
    return <ellipse cx="50" cy="-10" rx="30" ry="8" fill="none" stroke="#ffe066" strokeWidth="5" opacity="0.95" />;
  return null;
}

function Accessory({ kind }: { kind: string }) {
  switch (kind) {
    case 'ushanka':
      return (
        <g>
          <ellipse cx="10" cy="52" rx="11" ry="19" fill="#d8c3a0" />
          <ellipse cx="90" cy="52" rx="11" ry="19" fill="#d8c3a0" />
          <path d={capPath(30)} fill="#6b4a2f" />
          <path d="M8 32 Q10 -12 50 -13 Q90 -12 92 32 Z" fill="#6b4a2f" />
          <rect x="2" y="20" width="96" height="17" rx="8.5" fill="#d8c3a0" />
          <path d="M50 -6 L53 1 L60 1 L54.5 5.5 L56.5 12 L50 8 L43.5 12 L45.5 5.5 L40 1 L47 1 Z" fill="#e03131" />
        </g>
      );
    case 'tophat':
      return (
        <g>
          <rect x="25" y="-42" width="50" height="54" rx="4" fill={INK} />
          <rect x="25" y="0" width="50" height="8" fill="#c92a2a" />
          <ellipse cx="50" cy="12" rx="44" ry="7" fill={INK} />
        </g>
      );
    case 'crown':
      return (
        <g>
          <path
            d="M18 16 L16 -14 L33 2 L50 -22 L67 2 L84 -14 L82 16 Z"
            fill="#fcc419"
            stroke="#e8a400"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="6" r="4.5" fill="#e03131" />
          <circle cx="32" cy="9" r="3.5" fill="#228be6" />
          <circle cx="68" cy="9" r="3.5" fill="#40c057" />
        </g>
      );
    case 'headphones':
      return (
        <g>
          <path d="M9 48 Q8 -8 50 -8 Q92 -8 91 48" stroke="#343a40" strokeWidth="8" fill="none" />
          <rect x="-6" y="34" width="18" height="30" rx="7" fill="#e03131" />
          <rect x="88" y="34" width="18" height="30" rx="7" fill="#e03131" />
        </g>
      );
    case 'kerchief':
      return (
        <g>
          <path d="M0 52 Q0 -10 50 -10 Q100 -10 100 52 Q84 24 50 24 Q16 24 0 52 Z" fill="#e64980" />
          {[
            [26, 6],
            [50, -1],
            [74, 6],
            [14, 26],
            [86, 26],
            [38, 14],
            [62, 14],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3" fill="#fff" opacity="0.85" />
          ))}
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d={capPath(33)} fill="#1971c2" />
          <path d="M10 32 Q12 -10 50 -10 Q88 -10 90 32 Z" fill="#1971c2" />
          <path d="M50 26 Q92 18 108 32 Q84 36 50 32 Z" fill="#1864ab" />
          <circle cx="50" cy="-9" r="4" fill="#1864ab" />
        </g>
      );
    case 'cowboy':
      return (
        <g>
          <path d={capPath(26)} fill="#a0522d" />
          <path d="M14 20 Q14 -20 34 -18 Q50 -8 66 -18 Q86 -20 86 20 Z" fill="#a0522d" />
          <path d="M8 22 Q50 30 92 22 L92 14 Q50 22 8 14 Z" fill="#3b2416" />
          <path d="M-10 24 Q4 14 22 20 Q50 28 78 20 Q96 14 110 24 Q92 36 50 33 Q8 36 -10 24 Z" fill="#8b4513" />
        </g>
      );
    case 'pirate':
      return (
        <g>
          <path d="M-4 22 Q20 -34 50 -30 Q80 -34 104 22 Q78 8 50 12 Q22 8 -4 22 Z" fill={INK} />
          <path d="M-4 22 Q22 8 50 12 Q78 8 104 22" stroke="#fcc419" strokeWidth="3" fill="none" />
          <circle cx="50" cy="-6" r="6.5" fill="#fff" />
          <rect x="46.5" y="-1" width="7" height="4" rx="1" fill="#fff" />
          <path d="M40 4 L60 -14 M40 -14 L60 4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="47.5" cy="-7" r="1.6" fill={INK} />
          <circle cx="52.5" cy="-7" r="1.6" fill={INK} />
        </g>
      );
    case 'beanie':
      return (
        <g>
          <path d={capPath(30, 53)} fill="#f03e3e" />
          <path d="M6 30 Q8 -16 50 -16 Q92 -16 94 30 Z" fill="#f03e3e" />
          <path d="M30 -10 V24 M50 -14 V24 M70 -10 V24" stroke="#c92a2a" strokeWidth="2.5" />
          <rect x="-1" y="21" width="102" height="14" rx="7" fill="#c92a2a" />
          <circle cx="50" cy="-20" r="9" fill="#fff" />
        </g>
      );
    case 'viking':
      return (
        <g>
          <path d="M16 16 Q-4 8 -6 -24 Q4 0 24 6 Z" fill="#f1e3c6" stroke="#c9b48a" strokeWidth="2" />
          <path d="M84 16 Q104 8 106 -24 Q96 0 76 6 Z" fill="#f1e3c6" stroke="#c9b48a" strokeWidth="2" />
          <path d={capPath(33)} fill="#adb5bd" />
          <path d="M50 -2 V24" stroke="#868e96" strokeWidth="5" />
          <rect x="0" y="24" width="100" height="10" rx="5" fill="#868e96" />
          {[12, 30, 70, 88].map((x) => (
            <circle key={x} cx={x} cy="29" r="2" fill="#e9ecef" />
          ))}
        </g>
      );
    case 'wizard':
      return (
        <g>
          <path d={capPath(22)} fill="#5f3dc4" />
          <path d="M8 22 Q36 -20 56 -44 Q60 -20 92 22 Z" fill="#5f3dc4" />
          <ellipse cx="50" cy="22" rx="52" ry="8" fill="#4c2fa1" />
          <polygon points={star(44, -6, 6)} fill="#ffd43b" />
          <polygon points={star(62, 8, 4.5)} fill="#ffd43b" />
          <circle cx="34" cy="10" r="2" fill="#ffd43b" />
        </g>
      );
    case 'halo':
      return <ellipse cx="50" cy="-10" rx="30" ry="8" fill="none" stroke="#fff3bf" strokeWidth="2" opacity="0.8" />;
    case 'horns':
      return (
        <g>
          <path d="M20 14 Q10 -6 20 -26 Q26 -4 36 6 Z" fill="#e03131" stroke="#a51111" strokeWidth="2" />
          <path d="M80 14 Q90 -6 80 -26 Q74 -4 64 6 Z" fill="#e03131" stroke="#a51111" strokeWidth="2" />
        </g>
      );
    case 'party':
      return (
        <g transform="rotate(-12 50 10)">
          <path d="M30 14 L50 -40 L70 14 Z" fill="#4dabf7" />
          <path d="M35 0 L65 0 M40 -14 L60 -14 M45 -28 L55 -28" stroke="#fff" strokeWidth="3.5" />
          <ellipse cx="50" cy="14" rx="20" ry="4" fill="#339af0" />
          <circle cx="50" cy="-42" r="6" fill="#fcc419" />
        </g>
      );
    default:
      return null;
  }
}

/** Mund je nach Gesichtsausdruck */
function Mouth({ expression }: { expression: Expression }) {
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
