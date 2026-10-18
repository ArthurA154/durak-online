import { useEffect, useRef } from 'react';
import type { GameView } from '@durak/shared';
import { sfx } from './audio';
import { turnInfo } from './turn';

const cardsOnTable = (v: GameView) => v.table.reduce((n, t) => n + (t.defense ? 2 : 1), 0);

/** Spielt passende Geräusche, wenn sich der Spielstand ändert. */
export function useGameSounds(view: GameView | null): void {
  const prev = useRef<GameView | null>(null);

  useEffect(() => {
    const p = prev.current;
    prev.current = view;
    if (!p || !view || p.roomCode !== view.roomCode) return;

    // Neue Partie: erst mischen, dann austeilen
    if (view.phase === 'playing' && (p.phase !== 'playing' || p.round !== view.round)) {
      sfx.shuffle();
      window.setTimeout(sfx.deal, 1400);
      return;
    }
    if (p.phase === 'playing' && view.phase === 'finished') {
      return view.durakId === view.you ? sfx.lose() : sfx.win();
    }

    if (cardsOnTable(view) > cardsOnTable(p)) sfx.card();
    else if (p.table.length > 0 && view.table.length === 0) {
      if (view.discardCount > p.discardCount) sfx.bito();
      else sfx.take();
    }
    if (!turnInfo(p).mine && turnInfo(view).mine) sfx.turn();
    if (view.players.some((x) => x.out && !p.players.find((y) => y.id === x.id)?.out)) sfx.out();
  }, [view]);
}
