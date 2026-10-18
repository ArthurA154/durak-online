import { useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import { t, type Key } from './i18n';

// Hintergründe („Themen“): jeder wählt für sich, gespeichert nur auf diesem Gerät.
// Alles gezeichnet (CSS + SVG) – keine Bilder, lädt sofort, gestochen scharf.
// Farben kommen als CSS-Variablen auf <html>, die Tischoberfläche über [data-theme] in styles.css,
// die Szene drumherum zeichnet <Backdrop>.

export type ThemeId = 'classic' | 'wood' | 'pub' | 'space' | 'train' | 'kitchen' | 'beach' | 'casino';

interface Theme {
  id: ThemeId;
  /** Raum (dunkel genug, damit helle Schrift lesbar bleibt) */
  room: string;
  roomLight: string;
  felt: string;
  feltEdge: string;
  rim: string;
  rimLight: string;
}

const THEMES: Theme[] = [
  {
    id: 'classic',
    room: '#131726',
    roomLight: '#1f2540',
    felt: '#1d7a6b',
    feltEdge: '#0d4740',
    rim: '#3a2316',
    rimLight: '#6b4329',
  },
  {
    id: 'wood',
    room: '#1c130d',
    roomLight: '#2d2018',
    felt: '#9a6a3f',
    feltEdge: '#5e3a1f',
    rim: '#3b2414',
    rimLight: '#7a5233',
  },
  {
    id: 'pub',
    room: '#140e0a',
    roomLight: '#2a1d14',
    felt: '#5b3a24',
    feltEdge: '#2e1c10',
    rim: '#24150c',
    rimLight: '#55361f',
  },
  {
    id: 'space',
    room: '#05060f',
    roomLight: '#161a33',
    felt: '#1a2147',
    feltEdge: '#0a0d22',
    rim: '#0f1430',
    rimLight: '#4de1ff',
  },
  {
    id: 'train',
    room: '#17211f',
    roomLight: '#26332f',
    felt: '#c9c2b0',
    feltEdge: '#a69f8c',
    rim: '#6d727a',
    rimLight: '#c5cad1',
  },
  {
    id: 'kitchen',
    room: '#1d1b12',
    roomLight: '#2e2b1d',
    felt: '#efe6d2',
    feltEdge: '#d9cdb3',
    rim: '#8a2f2a',
    rimLight: '#c2524a',
  },
  {
    id: 'beach',
    room: '#1a1430',
    roomLight: '#2b2348',
    felt: '#2f8f9d',
    feltEdge: '#1d5f69',
    rim: '#b8935a',
    rimLight: '#e3c48a',
  },
  {
    id: 'casino',
    room: '#16070b',
    roomLight: '#2c1016',
    felt: '#8e1b26',
    feltEdge: '#4a0b12',
    rim: '#5c4313',
    rimLight: '#e3bd5b',
  },
];

const KEY = 'durak.theme';

function load(): ThemeId {
  try {
    const t = localStorage.getItem(KEY) as ThemeId | null;
    if (t && THEMES.some((x) => x.id === t)) return t;
  } catch {
    /* egal */
  }
  return 'classic';
}

let current = load();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const get = () => current;

function setTheme(id: ThemeId): void {
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* nur für diese Sitzung */
  }
  listeners.forEach((fn) => fn());
}

function apply(id: ThemeId): void {
  const th = THEMES.find((x) => x.id === id) ?? THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = th.id;
  root.style.setProperty('--room', th.room);
  root.style.setProperty('--room-light', th.roomLight);
  root.style.setProperty('--felt', th.felt);
  root.style.setProperty('--felt-edge', th.feltEdge);
  root.style.setProperty('--rim', th.rim);
  root.style.setProperty('--rim-light', th.rimLight);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th.room);
}

const useTheme = () => useSyncExternalStore(subscribe, get);

// ---------- Auswahl ----------

export function ThemeGrid() {
  const theme = useTheme();
  return (
    <div className="theme-grid" role="radiogroup" aria-label={t('background')}>
      {THEMES.map((th) => (
        <button
          key={th.id}
          type="button"
          role="radio"
          aria-checked={th.id === theme}
          className={`theme-tile${th.id === theme ? ' on' : ''}`}
          onClick={() => setTheme(th.id)}
        >
          <span
            className="theme-preview"
            data-preview={th.id}
            style={
              {
                '--p-room': th.room,
                '--p-felt': th.felt,
                '--p-edge': th.feltEdge,
                '--p-rim': th.rimLight,
              } as CSSProperties
            }
          >
            <i />
          </span>
          <span className="theme-name">{t(`theme.${th.id}` as Key)}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Szene hinter allem ----------

/** Feste Pseudo-Zufallszahlen – Sterne/Flaschen springen nicht bei jedem Neuzeichnen */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

export function Backdrop() {
  const theme = useTheme();
  useEffect(() => apply(theme), [theme]);
  return (
    <div className="backdrop" aria-hidden="true" data-scene={theme}>
      {theme === 'space' && <Space />}
      {theme === 'pub' && <Pub />}
      {theme === 'train' && <Train />}
      {theme === 'kitchen' && <Kitchen />}
      {theme === 'beach' && <Beach />}
      {theme === 'casino' && <Casino />}
      {theme === 'wood' && <Wood />}
      <div className="backdrop-vignette" />
    </div>
  );
}

const SCENE = { viewBox: '0 0 1600 1000', preserveAspectRatio: 'xMidYMid slice', className: 'scene' } as const;

function Space() {
  const r = rng(7);
  const stars = Array.from({ length: 160 }, () => ({ x: r() * 1600, y: r() * 1000, s: r() ** 3 * 2.2 + 0.4, t: r() }));
  return (
    <svg {...SCENE}>
      <defs>
        <radialGradient id="neb1">
          <stop offset="0" stopColor="#7b3fe4" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7b3fe4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="neb2">
          <stop offset="0" stopColor="#14b8c9" stopOpacity="0.4" />
          <stop offset="1" stopColor="#14b8c9" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="planet" cx="0.35" cy="0.3">
          <stop offset="0" stopColor="#ffb86b" />
          <stop offset="0.6" stopColor="#d2552f" />
          <stop offset="1" stopColor="#4a1410" />
        </radialGradient>
      </defs>
      <ellipse cx="300" cy="250" rx="520" ry="300" fill="url(#neb1)" />
      <ellipse cx="1350" cy="780" rx="560" ry="320" fill="url(#neb2)" />
      <ellipse cx="1150" cy="180" rx="380" ry="200" fill="url(#neb1)" opacity="0.5" />
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x}
          cy={s.y}
          r={s.s}
          fill="#fff"
          className={s.t > 0.82 ? 'twinkle' : undefined}
          style={{ animationDelay: `${s.t * 4}s` }}
          opacity={0.4 + s.t * 0.6}
        />
      ))}
      <g transform="translate(1420 170)">
        <circle r="70" fill="url(#planet)" />
        <ellipse
          rx="120"
          ry="22"
          fill="none"
          stroke="#f3d3a1"
          strokeOpacity="0.55"
          strokeWidth="6"
          transform="rotate(-18)"
        />
      </g>
    </svg>
  );
}

function Pub() {
  const r = rng(11);
  const colors = ['#2f6b3a', '#7a4a17', '#4b2a12', '#9b6a1e', '#3c5a2a', '#6b2a1a'];
  const shelf = (y: number) =>
    Array.from({ length: 22 }, (_, i) => {
      const w = 26 + r() * 18;
      const h = 90 + r() * 70;
      const x = 40 + i * 72 + r() * 20;
      return { x, y: y - h, w, h, c: colors[Math.floor(r() * colors.length)] };
    });
  const bokeh = Array.from({ length: 26 }, () => ({
    x: r() * 1600,
    y: r() * 1000,
    rr: 20 + r() * 60,
    o: 0.06 + r() * 0.14,
  }));
  return (
    <svg {...SCENE}>
      <defs>
        <filter id="blur">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <radialGradient id="lamp" cx="0.5" cy="0">
          <stop offset="0" stopColor="#ffb35c" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffb35c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g filter="url(#blur)" opacity="0.7">
        {[260, 520].map((y) => (
          <g key={y}>
            {shelf(y).map((b, i) => (
              <g key={i} fill={b.c}>
                <rect x={b.x} y={b.y + 30} width={b.w} height={b.h - 30} rx="6" />
                <rect x={b.x + b.w / 2 - 5} y={b.y} width="10" height="40" rx="3" />
              </g>
            ))}
            <rect x="0" y={y} width="1600" height="14" fill="#3a2414" />
          </g>
        ))}
      </g>
      <g filter="url(#blur)">
        {bokeh.map((b, i) => (
          <circle key={i} cx={b.x} cy={b.y} r={b.rr} fill="#ffc46b" opacity={b.o} />
        ))}
      </g>
      <ellipse cx="800" cy="0" rx="700" ry="520" fill="url(#lamp)" />
    </svg>
  );
}

function Train() {
  // Großes Panoramafenster hinter dem Tisch: an den Rändern zieht die Landschaft vorbei
  return (
    <svg {...SCENE}>
      <defs>
        <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141d3a" />
          <stop offset="0.55" stopColor="#5b3a5e" />
          <stop offset="0.8" stopColor="#c46a4a" />
        </linearGradient>
        <clipPath id="window">
          <rect x="70" y="120" width="1460" height="640" rx="60" />
        </clipPath>
      </defs>
      <rect width="1600" height="1000" fill="#1d2926" />
      <g clipPath="url(#window)">
        <rect x="70" y="120" width="1460" height="640" fill="url(#dusk)" />
        <circle cx="1180" cy="620" r="60" fill="#ffc98a" opacity="0.85" />
        <g className="train-far">
          {[0, 1].map((k) => (
            <path
              key={k}
              transform={`translate(${k * 1600} 0)`}
              d="M0 640 Q120 560 260 610 T540 590 T820 615 T1100 585 T1380 620 T1600 600 V760 H0Z"
              fill="#3d2a48"
            />
          ))}
        </g>
        <g className="train-near">
          {[0, 1].map((k) => (
            <g key={k} transform={`translate(${k * 1600} 0)`}>
              <path d="M0 700 Q200 660 400 690 T800 680 T1200 695 T1600 690 V760 H0Z" fill="#221a2c" />
              {Array.from({ length: 8 }, (_, i) => (
                <g key={i} transform={`translate(${i * 200 + 60} 0)`} fill="#1a1422">
                  <rect x="0" y="480" width="7" height="230" />
                  <rect x="-20" y="494" width="47" height="6" />
                </g>
              ))}
              {/* Birken */}
              {Array.from({ length: 5 }, (_, i) => (
                <g key={i} transform={`translate(${i * 320 + 150} 0)`}>
                  <rect x="0" y="560" width="9" height="150" fill="#d9d4c8" opacity="0.75" />
                  <ellipse cx="4" cy="560" rx="38" ry="52" fill="#2c2a3a" />
                </g>
              ))}
            </g>
          ))}
        </g>
      </g>
      <rect x="70" y="120" width="1460" height="640" rx="60" fill="none" stroke="#7d848c" strokeWidth="18" />
      <rect x="70" y="430" width="1460" height="12" fill="#7d848c" />
      {/* Vorhänge links und rechts */}
      <path d="M40 110 h150 q-40 160 0 320 q30 170 -50 340 h-100z" fill="#6e1c22" />
      <path d="M1560 110 h-150 q40 160 0 320 q-30 170 50 340 h100z" fill="#6e1c22" />
      <rect y="800" width="1600" height="200" fill="#26332f" />
    </svg>
  );
}

function Kitchen() {
  return (
    <svg {...SCENE}>
      <defs>
        <pattern id="wallpaper" width="120" height="120" patternUnits="userSpaceOnUse">
          <rect width="120" height="120" fill="#24301f" />
          <rect x="0" width="4" height="120" fill="#2c3a26" />
          <rect x="60" width="4" height="120" fill="#2c3a26" />
          <g transform="translate(32 34)" fill="#3e5236">
            <circle r="7" />
            <circle cx="-9" cy="-6" r="5" />
            <circle cx="9" cy="-6" r="5" />
            <circle cx="0" cy="11" r="5" />
            <path d="M0 14 q4 18 -6 30" stroke="#3e5236" strokeWidth="3" fill="none" />
          </g>
          <g transform="translate(92 94)" fill="#4a3426">
            <circle r="6" />
            <circle cx="-8" cy="-5" r="4" />
            <circle cx="8" cy="-5" r="4" />
          </g>
        </pattern>
      </defs>
      <rect width="1600" height="1000" fill="url(#wallpaper)" />
      {/* Uhr und Bild an der Wand */}
      <g transform="translate(220 170)">
        <circle r="62" fill="#e9dcc0" stroke="#5a3a22" strokeWidth="10" />
        <path d="M0 0 V-38 M0 0 L26 14" stroke="#2a2018" strokeWidth="6" strokeLinecap="round" />
      </g>
      <g transform="translate(1290 120)">
        <rect width="190" height="140" fill="#6b4a2b" />
        <rect x="14" y="14" width="162" height="112" fill="#3d5a6e" />
        <path d="M14 126 L70 70 L110 105 L140 80 L176 126Z" fill="#2c4a37" />
      </g>
    </svg>
  );
}

function Beach() {
  return (
    <svg {...SCENE}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1438" />
          <stop offset="0.55" stopColor="#6a2f5c" />
          <stop offset="0.82" stopColor="#d26a4f" />
        </linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24375e" />
          <stop offset="1" stopColor="#141c38" />
        </linearGradient>
      </defs>
      <rect width="1600" height="560" fill="url(#sky)" />
      <circle cx="800" cy="560" r="120" fill="#ffb36b" opacity="0.85" />
      <rect y="560" width="1600" height="260" fill="url(#sea)" />
      {Array.from({ length: 7 }, (_, i) => (
        <path
          key={i}
          d={`M${120 + i * 210} ${610 + (i % 3) * 50} q30 -12 60 0 t60 0`}
          stroke="#ffb36b"
          strokeOpacity="0.35"
          strokeWidth="4"
          fill="none"
        />
      ))}
      <path d="M0 820 Q400 780 800 810 T1600 800 V1000 H0Z" fill="#3a2c2a" />
      {/* Palme */}
      <g transform="translate(160 820)" fill="#120c1c">
        <path d="M0 0 C10 -120 30 -240 70 -330 L82 -326 C46 -236 26 -120 18 0Z" />
        <path d="M76 -330 q-90 -20 -150 30 q70 -40 150 -24z" />
        <path d="M76 -330 q90 -30 150 20 q-70 -36 -150 -14z" />
        <path d="M76 -330 q-40 -80 -120 -90 q70 30 116 92z" />
        <path d="M76 -330 q50 -80 130 -80 q-74 26 -126 82z" />
      </g>
    </svg>
  );
}

function Casino() {
  return (
    <svg {...SCENE}>
      <defs>
        <pattern id="lattice" width="80" height="80" patternUnits="userSpaceOnUse">
          <rect width="80" height="80" fill="#1a080d" />
          <path d="M40 0 L80 40 L40 80 L0 40Z" fill="none" stroke="#3a1a1f" strokeWidth="2" />
          <circle cx="40" cy="40" r="3" fill="#5c4313" />
        </pattern>
        <radialGradient id="glow" cx="0.5" cy="0.45">
          <stop offset="0" stopColor="#ffcf6b" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ffcf6b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#lattice)" />
      <ellipse cx="800" cy="450" rx="900" ry="560" fill="url(#glow)" />
    </svg>
  );
}

function Wood() {
  return (
    <svg {...SCENE}>
      <defs>
        <radialGradient id="woodlamp" cx="0.5" cy="0.1">
          <stop offset="0" stopColor="#ffcf8a" stopOpacity="0.3" />
          <stop offset="1" stopColor="#ffcf8a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={i * 140} y="0" width="138" height="1000" fill={i % 2 ? '#22170f' : '#1e140d'} />
      ))}
      <ellipse cx="800" cy="80" rx="760" ry="620" fill="url(#woodlamp)" />
      <g transform="translate(800 0)">
        <rect x="-2" y="0" width="4" height="70" fill="#0d0805" />
        <path d="M-70 120 Q0 50 70 120Z" fill="#2a1b10" />
        <ellipse cx="0" cy="122" rx="42" ry="8" fill="#ffd9a0" opacity="0.8" />
      </g>
    </svg>
  );
}
