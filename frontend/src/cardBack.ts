import { useSyncExternalStore, type CSSProperties } from 'react';

// Kartenrücken – jeder wählt für sich (wie der Hintergrund), nur auf diesem Gerät.
// Die Farben kommen als CSS-Variablen auf <html>; .card.back in styles.css nutzt sie.

export type CardBackId = 'classic' | 'red' | 'green' | 'night' | 'violet' | 'sand';

interface CardBackDesign {
  id: CardBackId;
  /** Grundfarbe */
  base: string;
  /** Punkte im Muster */
  dot: string;
  /** Rautenlinien */
  line: string;
}

export const CARD_BACKS: CardBackDesign[] = [
  { id: 'classic', base: '#2b3a8f', dot: 'rgba(255, 210, 63, 0.9)', line: 'rgba(255, 255, 255, 0.12)' },
  { id: 'red', base: '#a61e3a', dot: 'rgba(255, 236, 200, 0.9)', line: 'rgba(255, 255, 255, 0.12)' },
  { id: 'green', base: '#1f6b45', dot: 'rgba(255, 210, 63, 0.9)', line: 'rgba(255, 255, 255, 0.1)' },
  { id: 'night', base: '#17171f', dot: 'rgba(255, 200, 80, 0.95)', line: 'rgba(255, 200, 80, 0.18)' },
  { id: 'violet', base: '#5b2ca0', dot: 'rgba(120, 230, 255, 0.9)', line: 'rgba(255, 255, 255, 0.12)' },
  { id: 'sand', base: '#b07a3a', dot: 'rgba(255, 250, 235, 0.9)', line: 'rgba(80, 40, 10, 0.2)' },
];

const KEY = 'durak.cardBack';

/** CSS-Variablen eines Designs – für <html> oder eine einzelne Vorschaukarte */
export const backVars = (d: CardBackDesign) =>
  ({ '--back': d.base, '--back-dot': d.dot, '--back-line': d.line }) as CSSProperties;

function load(): CardBackId {
  try {
    const v = localStorage.getItem(KEY);
    if (CARD_BACKS.some((b) => b.id === v)) return v as CardBackId;
  } catch {
    /* egal */
  }
  return 'classic';
}

function apply(id: CardBackId): void {
  const d = CARD_BACKS.find((b) => b.id === id) ?? CARD_BACKS[0];
  for (const [k, v] of Object.entries(backVars(d))) document.documentElement.style.setProperty(k, String(v));
}

let current = load();
apply(current);
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useCardBack = () => useSyncExternalStore(subscribe, () => current);

export function setCardBack(id: CardBackId): void {
  current = id;
  apply(id);
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* nur für diese Sitzung */
  }
  listeners.forEach((fn) => fn());
}
