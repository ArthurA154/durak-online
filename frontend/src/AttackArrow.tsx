import { useLayoutEffect, useRef, useState } from 'react';
import { centerOf, type Point } from './fly';

/* Wer greift wen an? Ein ruhiger Pfeil über den Tisch – von Gelb (Angreifer) nach Rot (Verteidiger).
   Liegt unter den Karten, bewegt sich nicht, blendet nur weich um. */

interface Props {
  me: string;
  attackerId: string | null;
  defenderId: string | null;
  /** Neu messen, wenn sich etwas am Tisch ändert (z. B. Spieler raus) */
  layoutKey: string;
}

interface Arrow {
  d: string;
  head: string;
  from: Point;
  to: Point;
}

const MARGIN = 10;

/** Fläche eines Spielers (Figur + Kartenfächer); ich sitze unten – dann der untere Tischrand */
function areaOf(id: string, me: string, felt: DOMRect): { center: Point; rects: DOMRect[] } | null {
  if (id === me) return { center: { x: felt.left + felt.width / 2, y: felt.bottom - 18 }, rects: [] };
  const seat = document.querySelector(`[data-seat="${CSS.escape(id)}"]`);
  const avatar = seat?.querySelector('.avatar');
  if (!seat || !avatar) return null;
  const rects = [avatar, seat.querySelector('.seat-fan')]
    .filter((el): el is Element => !!el)
    .map((el) => el.getBoundingClientRect());
  return { center: centerOf(avatar.getBoundingClientRect()), rects };
}

const inside = (p: Point, rects: DOMRect[]) =>
  rects.some((r) => p.x > r.left - MARGIN && p.x < r.right + MARGIN && p.y > r.top - MARGIN && p.y < r.bottom + MARGIN);

const bez = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y,
});

const fmt = (p: Point) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

export function AttackArrow({ me, attackerId, defenderId, layoutKey }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [arrow, setArrow] = useState<Arrow | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const svg = ref.current;
      if (!svg) return;
      const box = svg.getBoundingClientRect();
      const a = attackerId && areaOf(attackerId, me, box);
      const b = defenderId && areaOf(defenderId, me, box);
      if (!a || !b || attackerId === defenderId) return setArrow(null);
      // Bogen über die Tischmitte
      const mid = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const c = { x: (a.center.x + b.center.x) / 4 + mid.x / 2, y: (a.center.y + b.center.y) / 4 + mid.y / 2 };
      // Anfang und Ende dort, wo die Kurve die Fläche des Spielers verlässt
      let t0 = 0;
      while (t0 < 0.45 && inside(bez(a.center, c, b.center, t0), a.rects)) t0 += 0.01;
      let t1 = 1;
      while (t1 > 0.55 && inside(bez(a.center, c, b.center, t1), b.rects)) t1 -= 0.01;
      const rel = (p: Point) => ({ x: p.x - box.left, y: p.y - box.top });
      const s = rel(bez(a.center, c, b.center, t0));
      const tip = rel(bez(a.center, c, b.center, t1));
      const back = rel(bez(a.center, c, b.center, t1 - 0.04));
      const ctrl = rel(bez(a.center, c, b.center, (t0 + t1) / 2));
      // Kontrollpunkt so, dass die Kurve durch die Mitte der Teilstrecke läuft
      const q = { x: 2 * ctrl.x - (s.x + tip.x) / 2, y: 2 * ctrl.y - (s.y + tip.y) / 2 };
      const dx = tip.x - back.x;
      const dy = tip.y - back.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const L = 26;
      const W = 15;
      const base = { x: tip.x - ux * L, y: tip.y - uy * L };
      const head = [tip, { x: base.x - uy * W, y: base.y + ux * W }, { x: base.x + uy * W, y: base.y - ux * W }]
        .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(' ');
      const end = { x: tip.x - ux * (L - 6), y: tip.y - uy * (L - 6) };
      setArrow({ d: `M${fmt(s)} Q${fmt(q)} ${fmt(end)}`, head, from: s, to: tip });
    };
    measure();
    // nach Layout-Änderungen (Schriften, Fenstergröße) nochmal messen
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [me, attackerId, defenderId, layoutKey]);

  return (
    <svg ref={ref} className="attack-arrow" aria-hidden="true">
      {arrow && (
        <g key={`${attackerId}-${defenderId}`} className="attack-arrow-shape">
          <defs>
            <linearGradient
              id="attack-arrow-color"
              gradientUnits="userSpaceOnUse"
              x1={arrow.from.x}
              y1={arrow.from.y}
              x2={arrow.to.x}
              y2={arrow.to.y}
            >
              <stop offset="0" stopColor="var(--yellow)" />
              <stop offset="1" stopColor="var(--red)" />
            </linearGradient>
          </defs>
          <path className="attack-arrow-shadow" d={arrow.d} />
          <path className="attack-arrow-line" d={arrow.d} stroke="url(#attack-arrow-color)" />
          <polygon points={arrow.head} />
        </g>
      )}
    </svg>
  );
}
