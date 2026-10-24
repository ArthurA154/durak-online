import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@durak/shared';
import { DurakGame } from './durak.js';
import { applyBotMove, botMove } from './bot.js';

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

/** Nur Bots am Tisch: spielt, bis das Spiel vorbei ist. Wartet das Spiel auf jemanden, muss der Bot ziehen. */
function playBots(g: DurakGame): number {
  let steps = 0;
  while (!g.finished && steps < 3000) {
    const id = g.waitingOn()[0];
    const m = botMove(g, id);
    expect(m, `Bot ${id} weiß nicht weiter`).not.toBeNull();
    applyBotMove(g, id, m!);
    steps++;
  }
  return steps;
}

describe('Bot', () => {
  it('Bots spielen ganze Partien zu Ende – ohne ungültige Züge', () => {
    for (let i = 0; i < 300; i++) {
      const ids = ['a', 'b', 'c', 'd'].slice(0, 2 + (i % 3));
      const g = new DurakGame(ids, undefined, { transfer: i % 2 === 0, unlimited: i % 5 === 0 });
      playBots(g);
      expect(g.finished).toBe(true);
      const total = g.discardCount + g.deck.length + g.players.reduce((s, p) => s + p.hand.length, 0);
      expect(total).toBe(36);
    }
  });

  it('zieht nur, wenn er dran ist', () => {
    const g = new DurakGame(['a', 'b']);
    const waiting = g.attacker.id;
    const other = g.defender.id;
    expect(botMove(g, other)).toBeNull();
    expect(botMove(g, waiting)?.kind).toBe('attack');
  });

  it('greift mit der kleinsten Karte an, Trumpf zuletzt', () => {
    const g = new DurakGame(['a', 'b']);
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    g.players[0].hand = [c(14, g.trump), c(9, g.trump === 'S' ? 'H' : 'S'), c(7, g.trump)];
    const m = botMove(g, 'a');
    expect(m).toEqual({ kind: 'attack', card: c(9, g.trump === 'S' ? 'H' : 'S') });
  });

  it('schlägt mit der billigsten passenden Karte, sonst schluckt er', () => {
    const g = new DurakGame(['a', 'b']);
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    const plain: Suit = g.trump === 'S' ? 'H' : 'S';
    g.players[0].hand = [c(8, plain)];
    g.players[1].hand = [c(14, plain), c(10, plain), c(6, g.trump)];
    g.attack('a', c(8, plain));
    expect(botMove(g, 'b')).toEqual({ kind: 'defend', index: 0, card: c(10, plain) });
    g.players[1].hand = [c(6, plain), c(7, plain)];
    expect(botMove(g, 'b')).toEqual({ kind: 'take' });
  });
});
