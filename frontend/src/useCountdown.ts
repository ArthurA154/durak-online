import { useEffect, useMemo, useState } from 'react';
import { TURN_WARN_MS, type GameView } from '@durak/shared';

export interface Countdown {
  /** Sekunden, die noch sichtbar heruntergezählt werden (10 … 0) */
  seconds: number;
  /** 1 → 0 über die sichtbaren 10 Sekunden */
  fraction: number;
  waitingOn: string[];
}

/** Sichtbarer Countdown – erst in den letzten 10 Sekunden, vorher null. */
export function useCountdown(view: GameView): Countdown | null {
  // Restzeit kommt relativ vom Server → unabhängig von falsch gehenden Uhren
  const deadline = useMemo(() => (view.timer ? Date.now() + view.timer.remainingMs : null), [view]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [deadline]);

  if (!deadline || !view.timer) return null;
  const left = deadline - now;
  if (left > TURN_WARN_MS) return null;
  return {
    seconds: Math.max(0, Math.ceil(left / 1000)),
    fraction: Math.max(0, Math.min(1, left / TURN_WARN_MS)),
    waitingOn: view.timer.waitingOn,
  };
}
