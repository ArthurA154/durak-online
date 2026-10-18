import { useEffect, useRef, useState, type RefObject } from 'react';
import { HAND_SIZE, type GameView } from '@durak/shared';
import { centerOf, pointOf, seatPoint, type Point } from './fly';
import { sfx } from './audio';

// Mischen, Austeilen und Nachziehen: wer bekommt wann welche Karte (nur Optik – der Server hat längst verteilt).

/** So lange dauert das Mischen, bevor ausgeteilt wird */
export const SHUFFLE_MS = 1500;

/** Abstand zwischen zwei nachgezogenen Karten */
const DRAW_STEP_MS = 700;
/** Kurz warten, bis die alten Tischkarten weggeflogen sind */
const DRAW_DELAY_MS = 350;
const DRAW_FLY_MS = 600;
/** Austeilen zu Beginn: zügiger, wie beim echten Geben */
const DEAL_STEP_MS = 220;
const DEAL_FLY_MS = 450;

/**
 * Runde vorbei und nachgezogen? Dann: wer bekommt in welcher Reihenfolge wie viele Karten.
 * Wie auf dem Server: Angreifer zuerst, dann reihum, Verteidiger zuletzt. Eine ID pro Karte.
 */
function drawOrder(prev: GameView, view: GameView): string[] | null {
  if (prev.round !== view.round || prev.phase !== 'playing') return null;
  if (prev.table.length === 0 || view.table.length > 0) return null;
  const total = prev.deckCount - view.deckCount;
  if (total <= 0) return null;
  const took = view.discardCount === prev.discardCount;
  const tableCards = prev.table.reduce((n, t) => n + (t.defense ? 2 : 1), 0);
  const ids = prev.players.map((p) => p.id);
  const start = Math.max(0, ids.indexOf(prev.attackerId ?? ''));
  const order = [...ids.slice(start), ...ids.slice(0, start)].filter((id) => id !== prev.defenderId);
  if (prev.defenderId) order.push(prev.defenderId);
  const steps: string[] = [];
  for (const id of order) {
    const before = prev.players.find((p) => p.id === id)?.cardCount;
    const after = view.players.find((p) => p.id === id)?.cardCount;
    if (before === undefined || after === undefined) return null;
    const drawn = after - before - (took && id === prev.defenderId ? tableCards : 0);
    for (let i = 0; i < drawn; i++) steps.push(id);
  }
  return steps.length === total ? steps : null;
}

/** Frisch ausgeteilt? (beim ersten Anzeigen des Tisches – nicht nach einem Neuladen mitten im Spiel) */
export const isFreshDeal = (v: GameView) =>
  v.phase === 'playing' &&
  v.table.length === 0 &&
  v.discardCount === 0 &&
  v.players.every((p) => p.cardCount === HAND_SIZE);

/** Ein Kartenrücken fliegt im Bogen vom Stapel zum Platz eines Mitspielers; dort wippt der Fächer kurz. */
function flyBack(from: Point | null, to: Point | null, duration: number, id: string): void {
  if (!from || !to || typeof document.body.animate !== 'function') return;
  const el = document.createElement('div');
  el.className = 'card back draw-flyer';
  el.style.left = `${from.x}px`;
  el.style.top = `${from.y}px`;
  document.body.append(el);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = Math.min(120, 40 + Math.hypot(dx, dy) * 0.2);
  const at = (p: number, rot: number, scale: number) => ({
    transform: `translate(-50%, -50%) translate(${dx * p}px, ${dy * p - lift * 4 * p * (1 - p)}px) rotate(${rot}deg) scale(${scale})`,
  });
  const anim = el.animate([at(0, -6, 1), at(0.5, 4, 1.05), at(1, 12, 0.55)], {
    duration,
    easing: 'cubic-bezier(0.35, 0.6, 0.45, 1)',
  });
  anim.onfinish = () => {
    el.remove();
    document
      .querySelector<HTMLElement>(`[data-seat="${CSS.escape(id)}"] .seat-fan`)
      ?.animate([{ scale: '1' }, { scale: '1.15' }, { scale: '1' }], { duration: 220, easing: 'ease-out' });
  };
}

interface Sequence {
  /** Spieler-ID pro Karte, in der Reihenfolge, in der sie fliegen */
  steps: string[];
  start: number;
  step: number;
  fly: number;
}

/**
 * Austeilen (neue Partie, nach dem Mischen) und Nachziehen (nach der Runde) Karte für Karte.
 * Liefert, welche Karten noch „unterwegs“ sind – damit Fächer und Stapel erst beim Ankommen zählen.
 * Läuft weiter, auch wenn schon der nächste Zug kommt; nur ein neues Austeilen/Nachziehen ersetzt es.
 */
export function useDrawSequence(
  prev: GameView | null,
  view: GameView,
  newRound: boolean,
  deckRef: RefObject<HTMLElement>,
) {
  const seq = useRef<Sequence | null>(null);
  const [, redraw] = useState(0);

  const newDraws = prev && prev !== view && !newRound ? drawOrder(prev, view) : null;
  // Neue Partie: reihum austeilen – 6 Runden, eine Karte pro Spieler (wie der Server)
  const newDeal =
    newRound && view.phase === 'playing' && view.hand.length > 0
      ? Array.from({ length: HAND_SIZE }, () => view.players.map((p) => p.id)).flat()
      : null;
  if (newDraws)
    seq.current = { steps: newDraws, start: Date.now() + DRAW_DELAY_MS, step: DRAW_STEP_MS, fly: DRAW_FLY_MS };
  if (newDeal) seq.current = { steps: newDeal, start: Date.now() + SHUFFLE_MS, step: DEAL_STEP_MS, fly: DEAL_FLY_MS };

  const drawInfo = seq.current;
  const now = Date.now();
  /** Karten, die bei diesem Spieler noch nicht angekommen sind */
  const drawPending = (id: string) =>
    drawInfo
      ? drawInfo.steps.filter((s, i) => s === id && now < drawInfo.start + i * drawInfo.step + drawInfo.fly).length
      : 0;
  /** Karten, die noch auf dem Stapel liegen sollten (noch nicht losgeflogen) */
  const deckPending = drawInfo ? drawInfo.steps.filter((_, i) => now < drawInfo.start + i * drawInfo.step).length : 0;

  const key = drawInfo?.start ?? 0;
  useEffect(() => {
    const d = seq.current;
    if (!d) return;
    const deckPoint = () =>
      deckRef.current ? centerOf(deckRef.current.getBoundingClientRect()) : pointOf('.play-area');
    const timers: number[] = [];
    d.steps.forEach((id, i) => {
      const launch = d.start + i * d.step - Date.now();
      timers.push(
        window.setTimeout(
          () => {
            sfx.draw();
            redraw((n) => n + 1);
            // Eigene Karten fliegen als Handkarten (FlySlot), für die anderen ein Kartenrücken
            if (id !== view.you) flyBack(deckPoint(), seatPoint(id), d.fly, id);
          },
          Math.max(0, launch),
        ),
      );
      timers.push(window.setTimeout(() => redraw((n) => n + 1), Math.max(0, launch + d.fly)));
    });
    const end = d.start + d.steps.length * d.step + d.fly - Date.now();
    timers.push(
      window.setTimeout(() => {
        if (seq.current === d) seq.current = null;
        redraw((n) => n + 1);
      }, end + 50),
    );
    return () => timers.forEach(clearTimeout);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { newDraws, newDeal, drawInfo, drawPending, deckPending };
}
