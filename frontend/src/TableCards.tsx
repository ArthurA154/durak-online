import { useRef, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { SUITS, type Card, type TablePair } from '@durak/shared';
import { CardFace, cardKey } from './CardView';
import { centerOf, useFlyIn, type Point, type RectRegistry } from './fly';

// Bausteine für Karten auf dem Tisch und in der Hand, die beim Erscheinen an ihren Platz fliegen.

/** Leichte, pro Karte feste Schräglage – wie hingeworfen. */
export const tilt = (c: Card) => ((c.rank * 7 + SUITS.indexOf(c.suit) * 13) % 11) - 5;

/**
 * Karten, die gerade vom Tisch verschwunden sind, fliegen als unabhängige Kopie weg
 * (zur Ablage oder zum Spieler, der schluckt). Die echten Tischkarten werden so nie verschoben.
 */
export interface Ghost {
  id: number;
  pair: TablePair;
  rect: DOMRect;
  cw: number;
  target: Point | null;
  mode: 'done' | 'took';
}

export function GhostPair({ ghost, onDone }: { ghost: Ghost; onDone: () => void }) {
  const { pair, rect, cw, mode } = ghost;
  const from = centerOf(rect);
  const to = ghost.target ?? { x: from.x, y: from.y - 140 };
  return (
    <motion.div
      className="pair ghost"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, ['--cw' as string]: `${cw}px` }}
      initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
      animate={{
        x: to.x - from.x,
        y: to.y - from.y,
        scale: mode === 'done' ? 0.45 : 0.3,
        rotate: mode === 'done' ? 35 : 0,
        opacity: 0,
      }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.6, 1] }}
      onAnimationComplete={onDone}
      aria-hidden="true"
    >
      <div className="table-card">
        <div className="table-card-tilt" style={{ transform: `rotate(${tilt(pair.attack)}deg)` }}>
          <CardFace card={pair.attack} />
        </div>
      </div>
      {pair.defense && (
        <div className="table-card defense">
          <div className="table-card-tilt" style={{ transform: `rotate(${tilt(pair.defense) + 14}deg)` }}>
            <CardFace card={pair.defense} />
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** Ein Element, das beim Erscheinen von `from` an seinen Platz fliegt. */
export function FlySlot(props: {
  from: () => Point | null;
  className: string;
  style?: CSSProperties;
  delay?: number;
  duration?: number;
  fade?: boolean;
  registry?: RectRegistry;
  registryKey?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFlyIn(ref, props.from, {
    delay: props.delay,
    duration: props.duration,
    fade: props.fade,
    registry: props.registry,
    registryKey: props.registryKey,
  });
  return (
    <div ref={ref} className={props.className} style={props.style}>
      {props.children}
    </div>
  );
}

/** Karte auf dem Tisch */
export function FlyCard(props: {
  card: Card;
  from: () => Point | null;
  className: string;
  rotate: number;
  drop?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFlyIn(ref, props.from);
  return (
    <div
      ref={ref}
      className={props.className}
      data-drop={props.drop}
      data-table-card={cardKey(props.card)}
      onClick={props.onClick}
    >
      <div className="table-card-tilt" style={{ transform: `rotate(${props.rotate}deg)` }}>
        <CardFace card={props.card} />
      </div>
    </div>
  );
}
