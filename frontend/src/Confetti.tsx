import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Point } from './fly';

const COLORS = ['#ffd23f', '#ff5148', '#38d9a9', '#4dabf7', '#b197fc', '#ffa94d'];

/** Kurzer Konfetti-Knall an einer Bildschirmposition */
export function Confetti({ at }: { at: Point }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 120;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          color: COLORS[i % COLORS.length],
          size: 6 + Math.random() * 6,
          spin: (Math.random() - 0.5) * 900,
          delay: Math.random() * 0.08,
        };
      }),
    [],
  );
  return (
    <div className="confetti" style={{ left: at.x, top: at.y }} aria-hidden="true">
      {parts.map((p, i) => (
        <motion.i
          key={i}
          style={{ background: p.color, width: p.size, height: p.size * 0.55 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.dx, y: [0, p.dy - 30, p.dy + 140], opacity: [1, 1, 0], rotate: p.spin }}
          transition={{ duration: 1.4, ease: 'easeOut', delay: p.delay }}
        />
      ))}
    </div>
  );
}
