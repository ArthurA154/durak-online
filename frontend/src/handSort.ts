import { useSyncExternalStore } from 'react';
import type { Card, Suit } from '@durak/shared';

// Reihenfolge der eigenen Handkarten – jeder für sich, gespeichert nur auf diesem Gerät.
// „Eigene“: so, wie man die Karten in der Hand hingezogen hat; neue Karten kommen rechts dazu.

export type HandSort = 'rank' | 'suit' | 'custom';

const MODE_KEY = 'durak.handSort';
const ORDER_KEY = 'durak.handOrder';

const key = (c: Card) => `${c.rank}${c.suit}`;

function read<T>(k: string, fallback: T, ok: (v: unknown) => boolean): T {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null');
    return ok(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(k: string, v: unknown): void {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* nur für diese Sitzung */
  }
}

let state = {
  mode: read<HandSort>(MODE_KEY, 'rank', (v) => v === 'rank' || v === 'suit' || v === 'custom'),
  order: read<string[]>(ORDER_KEY, [], (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')),
};
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = () => listeners.forEach((fn) => fn());

export const useHandSort = () => useSyncExternalStore(subscribe, () => state);

export function setHandSort(mode: HandSort): void {
  state = { ...state, mode };
  write(MODE_KEY, mode);
  emit();
}

/** Nach dem Umsortieren per Ziehen: diese Reihenfolge merken und auf „Eigene“ schalten */
export function setCustomOrder(cards: Card[]): void {
  state = { mode: 'custom', order: cards.map(key) };
  write(MODE_KEY, 'custom');
  write(ORDER_KEY, state.order);
  emit();
}

// ♠ ♥ ♣ ♦ – schwarz und rot abwechselnd, damit die Gruppen klar getrennt sind
const SUIT_ORDER: Suit[] = ['S', 'H', 'C', 'D'];

/** Trümpfe immer rechts; sonst nach Wert oder nach Farbe */
function byRule(cards: Card[], mode: 'rank' | 'suit', trump: Suit | null): Card[] {
  const isTrump = (c: Card) => Number(c.suit === trump);
  const suitIdx = (c: Card) => SUIT_ORDER.indexOf(c.suit);
  return [...cards].sort((a, b) =>
    mode === 'rank'
      ? isTrump(a) - isTrump(b) || a.rank - b.rank || suitIdx(a) - suitIdx(b)
      : isTrump(a) - isTrump(b) || suitIdx(a) - suitIdx(b) || a.rank - b.rank,
  );
}

export function sortHand(hand: Card[], mode: HandSort, order: string[], trump: Suit | null): Card[] {
  if (mode !== 'custom') return byRule(hand, mode, trump);
  const pos = new Map(order.map((k, i) => [k, i]));
  const known = hand.filter((c) => pos.has(key(c))).sort((a, b) => pos.get(key(a))! - pos.get(key(b))!);
  // Neue Karten: rechts anhängen, untereinander nach Wert
  const fresh = byRule(
    hand.filter((c) => !pos.has(key(c))),
    'rank',
    trump,
  );
  return [...known, ...fresh];
}
