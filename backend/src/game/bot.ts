import { beats, type Card, type Suit } from '@durak/shared';
import type { DurakGame } from './durak.js';

/**
 * Einfacher Bot: entscheidet nur mit dem, was ein Mensch an seinem Platz auch sieht –
 * eigene Hand, Tisch, Trumpf, Anzahl Karten im Stapel. Fremde Hände schaut er nicht an.
 */
export type BotMove =
  | { kind: 'attack'; card: Card }
  | { kind: 'defend'; index: number; card: Card }
  | { kind: 'take' }
  | { kind: 'pass' };

/** Wie „teuer“ eine Karte ist: Trümpfe zählen viel mehr – die hebt der Bot auf */
const cost = (c: Card, trump: Suit) => c.rank + (c.suit === trump ? 20 : 0);

/** Nächster Zug des Bots – oder null, wenn gerade nicht auf ihn gewartet wird */
export function botMove(g: DurakGame, botId: string): BotMove | null {
  if (g.finished || !g.waitingOn().includes(botId)) return null;
  const me = g.players.find((p) => p.id === botId);
  if (!me) return null;
  const cheapFirst = (cards: Card[]) => [...cards].sort((a, b) => cost(a, g.trump) - cost(b, g.trump));

  if (me === g.defender) {
    // Für jede offene Karte die billigste, die sie schlägt (teuerste Angriffe zuerst verteilen)
    const hand = cheapFirst(me.hand);
    const used = new Set<number>();
    let first: BotMove | null = null;
    const open = g.table
      .map((pair, index) => ({ pair, index }))
      .filter((x) => !x.pair.defense)
      .sort((a, b) => cost(b.pair.attack, g.trump) - cost(a.pair.attack, g.trump));
    for (const { pair, index } of open) {
      const j = hand.findIndex((c, k) => !used.has(k) && beats(pair.attack, c, g.trump));
      if (j === -1) return { kind: 'take' };
      used.add(j);
      first ??= { kind: 'defend', index, card: hand[j] };
    }
    // Solange noch viel im Stapel ist: lieber schlucken, als König oder Ass in Trumpf herzugeben
    const costly = [...used].some((k) => hand[k].suit === g.trump && hand[k].rank >= 13);
    if (costly && g.deck.length > 6) return { kind: 'take' };
    return first;
  }

  // Angreifen: kleinste Karte, möglichst kein Trumpf
  if (g.table.length === 0) return { kind: 'attack', card: cheapFirst(me.hand)[0] };

  // Nachlegen: passende kleine Karten; Trümpfe und Hohes erst, wenn der Stapel leer ist
  const ranks = new Set(g.table.flatMap((t) => (t.defense ? [t.attack.rank, t.defense.rank] : [t.attack.rank])));
  const undefended = g.table.filter((t) => !t.defense).length;
  const room = g.table.length < g.maxTable && undefended < g.defender.hand.length;
  if (room && g.mayThrowIn(me)) {
    const early = g.deck.length > 0;
    const card = cheapFirst(me.hand).find((c) => ranks.has(c.rank) && (!early || (c.suit !== g.trump && c.rank <= 10)));
    if (card) return { kind: 'attack', card };
  }
  return { kind: 'pass' };
}

/** Zug ausführen – dieselben Spielfunktionen wie bei Menschen (der Bot kann nicht schummeln) */
export function applyBotMove(g: DurakGame, botId: string, m: BotMove): void {
  if (m.kind === 'attack') g.attack(botId, m.card);
  else if (m.kind === 'defend') g.defend(botId, m.index, m.card);
  else if (m.kind === 'take') g.take(botId);
  else g.pass(botId);
}
