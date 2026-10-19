import { useEffect } from 'react';

const BASE_TITLE = document.title;

/**
 * Läuft das Spiel in einem Hintergrund-Tab und ich bin dran: Tab-Titel blinkt, bis ich zurückkomme.
 * (Den Ton dazu spielt useGameSounds, sobald ich dran bin.)
 */
export function useTabAlert(active: boolean, text: string): void {
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    let on = false;
    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
      document.title = BASE_TITLE;
    };
    const update = () => {
      if (!document.hidden) return stop();
      if (timer) return;
      on = true;
      document.title = text;
      timer = window.setInterval(() => {
        on = !on;
        document.title = on ? text : BASE_TITLE;
      }, 1000);
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      stop();
    };
  }, [active, text]);
}
