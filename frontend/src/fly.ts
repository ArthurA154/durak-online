import { useLayoutEffect, type RefObject } from 'react';

// Karten „fliegen“ beim Erscheinen von dort, wo sie herkommen (Hand, Platz eines Spielers, Stapel).
// Bewusst mit der Web Animations API auf einem eigenen Wrapper statt framer-layoutId:
// das kommt sich nicht mit Drag & Drop und Layout-Animationen in die Quere.

export interface Point {
  x: number;
  y: number;
}

export const centerOf = (r: DOMRect): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function pointOf(selector: string): Point | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? centerOf(r) : null;
}

/** Mitte der Figur eines Spielers am Tisch */
export const seatPoint = (id: string | null | undefined) =>
  id ? pointOf(`[data-seat="${CSS.escape(id)}"] .avatar`) : null;

/** Letzte bekannte Position von Karten, die gerade verschwunden sind (z. B. aus der Hand gespielt) */
export type RectRegistry = Map<string, DOMRect>;

interface FlyOptions {
  delay?: number;
  duration?: number;
  /** unsichtbar starten (z. B. beim Austeilen, solange gemischt wird) */
  fade?: boolean;
  fromScale?: number;
  /** beim Verschwinden die Position hier merken */
  registry?: RectRegistry;
  registryKey?: string;
}

export function useFlyIn(ref: RefObject<HTMLElement>, getFrom: () => Point | null, opts: FlyOptions = {}): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let anim: Animation | undefined;
    const from = getFrom();
    if (from && typeof el.animate === 'function') {
      const to = centerOf(el.getBoundingClientRect());
      const dx = from.x - to.x;
      const dy = from.y - to.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        anim = el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${opts.fromScale ?? 1})`, opacity: opts.fade ? 0 : 1 },
            { transform: 'none', opacity: 1 },
          ],
          {
            duration: opts.duration ?? 430,
            delay: opts.delay ?? 0,
            easing: 'cubic-bezier(0.2, 0.85, 0.3, 1.08)',
            fill: 'backwards',
          },
        );
      }
    }
    return () => {
      if (opts.registry && opts.registryKey) {
        const r = (el.querySelector('.card') ?? el).getBoundingClientRect();
        if (r.width) opts.registry.set(opts.registryKey, r);
      }
      anim?.cancel();
    };
    // nur beim Erscheinen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
