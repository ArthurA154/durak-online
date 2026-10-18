import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@durak/shared';
import { createDeck, DurakGame, GameError, shuffle } from './durak.js';

const c = (rank: Rank, suit: Suit): Card => ({ rank, suit });

/**
 * Baut einen Stapel so, dass die Spieler genau `hands` bekommen (Austeilen reihum vom Ende),
 * `trump` unten liegt und `rest` dazwischen (wird zuerst nachgezogen = Ende von rest).
 */
function rigDeck(hands: Card[][], trump: Card, rest: Card[] = []): Card[] {
  const dealt: Card[] = [];
  for (let round = 0; round < 6; round++) {
    for (const h of hands) dealt.push(h[round]);
  }
  return [trump, ...rest, ...dealt.reverse()];
}

// Trumpf: Kreuz (C). A hat den kleinsten Trumpf → greift zuerst an.
const handA = [c(6, 'C'), c(7, 'S'), c(8, 'S'), c(9, 'H'), c(10, 'H'), c(11, 'D')];
const handB = [c(7, 'C'), c(9, 'S'), c(12, 'S'), c(7, 'H'), c(13, 'H'), c(14, 'D')];
const handC = [c(8, 'C'), c(7, 'D'), c(8, 'D'), c(9, 'D'), c(10, 'D'), c(6, 'S')];

describe('Grundlagen', () => {
  it('Stapel hat 36 verschiedene Karten', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(36);
    expect(new Set(deck.map((x) => `${x.rank}${x.suit}`)).size).toBe(36);
  });

  it('verteilt 6 Karten an jeden, Trumpf = unterste Karte', () => {
    const g = new DurakGame(['a', 'b', 'c'], shuffle(createDeck()));
    for (const p of g.players) expect(p.hand).toHaveLength(6);
    expect(g.deck).toHaveLength(18);
    expect(g.deck[0]).toEqual(g.trumpCard);
  });

  it('kleinster Trumpf greift zuerst an, links davon verteidigt', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handB, handA], c(14, 'C')));
    expect(g.attacker.id).toBe('b');
    expect(g.defender.id).toBe('a');
  });

  it('braucht 2–4 Spieler', () => {
    expect(() => new DurakGame(['a'])).toThrow(GameError);
    expect(() => new DurakGame(['1', '2', '3', '4', '5'])).toThrow(GameError);
  });
});

describe('Angreifen und Schlagen', () => {
  const setup = () => new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C'), [c(6, 'H'), c(6, 'D')]));

  it('nur der Angreifer darf eröffnen', () => {
    const g = new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));
    expect(() => g.attack('c', c(6, 'S'))).toThrow('Nur der Angreifer');
    expect(() => g.attack('b', c(9, 'S'))).toThrow('Verteidiger');
  });

  it('Verteidigung mit höherer gleicher Farbe oder Trumpf', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    expect(() => g.defend('b', 0, c(7, 'H'))).toThrow('schlägt nicht');
    g.defend('b', 0, c(9, 'S'));
    expect(g.table[0].defense).toEqual(c(9, 'S'));
  });

  it('nachlegen nur mit Werten vom Tisch', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    expect(() => g.attack('a', c(10, 'H'))).toThrow('Wert');
    g.attack('a', c(9, 'H'));
    expect(g.table).toHaveLength(2);
  });

  it('Bito: geschlagene Karten weg, Verteidiger greift als nächstes an, Nachziehen', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    g.pass('a');
    expect(g.table).toHaveLength(0);
    expect(g.discardCount).toBe(2);
    expect(g.attacker.id).toBe('b');
    expect(g.players[0].hand).toHaveLength(6);
    expect(g.players[1].hand).toHaveLength(6);
  });

  it('Nehmen: Verteidiger bekommt alles, Angreifer bleibt dran', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    g.attack('a', c(9, 'H'));
    g.take('b');
    g.pass('a');
    expect(g.players[1].hand).toHaveLength(8); // 5 + 7♠ 9♠ 9♥
    expect(g.attacker.id).toBe('a'); // bei 2 Spielern: Angreifer bleibt
  });

  it('nicht mehr Karten als der Verteidiger halten kann', () => {
    const g = setup();
    g.players[1].hand = [c(14, 'S')];
    g.attack('a', c(7, 'S'));
    expect(() => g.attack('a', c(7, 'C'))).toThrow('keine Karte mehr');
  });
});

describe('Weiterschieben (Perevodnoy)', () => {
  const setup = () =>
    new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));

  it('schiebt mit gleichem Wert an den nächsten Spieler weiter', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.transfer('b', c(7, 'H'));
    expect(g.attacker.id).toBe('b');
    expect(g.defender.id).toBe('c');
    expect(g.table).toHaveLength(2);

    g.transfer('c', c(7, 'D'));
    expect(g.defender.id).toBe('a');
    expect(g.table).toHaveLength(3);
  });

  it('kein Weiterschieben mit anderem Wert oder nach dem Schlagen', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    expect(() => g.transfer('b', c(9, 'S'))).toThrow('gleichen Werts');
    g.defend('b', 0, c(9, 'S'));
    expect(() => g.transfer('b', c(7, 'H'))).toThrow('ersten Schlagen');
  });

  it('kein Weiterschieben, wenn der Nächste zu wenig Karten hat', () => {
    const g = setup();
    g.players[2].hand = [c(14, 'H')];
    g.attack('a', c(7, 'S'));
    expect(() => g.transfer('b', c(7, 'H'))).toThrow('nicht genug Karten');
  });

  it('bei 3 Spielern müssen alle Nicht-Verteidiger passen', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    g.pass('a');
    expect(g.table).toHaveLength(1);
    g.pass('c');
    expect(g.table).toHaveLength(0);
    expect(g.attacker.id).toBe('b');
    expect(g.defender.id).toBe('c');
  });

  it('nach Nehmen dürfen Mitspieler nachlegen, dann greift der Spieler links vom Verteidiger an', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.take('b');
    g.attack('c', c(7, 'D')); // Mitspieler legt beim Nehmen nach
    expect(g.table).toHaveLength(2);
    g.pass('a');
    g.pass('c');
    expect(g.attacker.id).toBe('c');
    expect(g.defender.id).toBe('a');
  });
});

describe('Spielende', () => {
  it('wer zuletzt Karten hat, ist der Durak', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S'), c(6, 'H')];
    g.players[1].hand = [c(9, 'S')];
    g.attack('a', c(7, 'S'));
    // b schlägt mit seiner letzten Karte → sofort vorbei, a muss nicht erst „Fertig“ drücken
    g.defend('b', 0, c(9, 'S'));
    expect(g.finished).toBe(true);
    expect(g.durakId).toBe('a');
  });

  it('letzte Karte gelegt: der andere ist sofort der Durak, ohne weiteren Zug', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S')];
    g.players[1].hand = [c(6, 'H')];
    g.attack('a', c(7, 'S'));
    // b kann 7♠ mit 6♥ nicht schlagen → kein Unentschieden möglich
    expect(g.finished).toBe(true);
    expect(g.durakId).toBe('b');
    expect(g.table).toEqual([]);
  });

  it('Unentschieden: letzte Karte wird mit der letzten Karte geschlagen', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S')];
    g.players[1].hand = [c(9, 'S')];
    g.attack('a', c(7, 'S'));
    expect(g.finished).toBe(false);
    expect(g.waitingOn()).toEqual(['b']);
    g.defend('b', 0, c(9, 'S'));
    expect(g.finished).toBe(true);
    expect(g.durakId).toBeNull();
  });

  it('Unentschieden möglich, aber geschluckt → Durak', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S')];
    g.players[1].hand = [c(9, 'S')];
    g.attack('a', c(7, 'S'));
    g.take('b');
    expect(g.finished).toBe(true);
    expect(g.durakId).toBe('b');
  });

  it('Unentschieden mit zwei Karten nur, wenn beide geschlagen werden können', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S'), c(7, 'H')];
    g.players[1].hand = [c(6, 'C'), c(9, 'H')];
    g.attack('a', c(7, 'S'));
    expect(g.finished).toBe(false); // b hat noch 2 Karten, a noch eine
    g.attack('a', c(7, 'H'));
    expect(g.finished).toBe(false); // 6♣ (Trumpf) schlägt 7♠, 9♥ schlägt 7♥
    g.defend('b', 1, c(9, 'H'));
    g.defend('b', 0, c(6, 'C'));
    expect(g.durakId).toBeNull();
    expect(g.finished).toBe(true);
  });

  it('bei 3 Spielern geht es weiter, wenn noch zwei Karten haben', () => {
    const g = new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S')];
    g.attack('a', c(7, 'S'));
    expect(g.finished).toBe(false);
  });

  it('Weiterschieben mit der letzten Karte beendet das Spiel ebenfalls', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handA, handB], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S'), c(8, 'H'), c(10, 'H')];
    g.players[1].hand = [c(7, 'H')];
    g.attack('a', c(7, 'S'));
    // b schiebt mit seiner letzten Karte zurück an a → b ist raus, a ist der Durak
    g.transfer('b', c(7, 'H'));
    expect(g.finished).toBe(true);
    expect(g.durakId).toBe('a');
  });

  it('ausgeschiedene Spieler werden übersprungen', () => {
    const g = new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));
    g.deck = [];
    g.players[0].hand = [c(7, 'S')];
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    g.pass('c');
    expect(g.isOut(g.players[0])).toBe(true);
    expect(g.attacker.id).toBe('b');
    expect(g.defender.id).toBe('c');
  });

  it('zufälliges Spiel läuft ohne Fehler bis zum Ende', () => {
    for (let seed = 0; seed < 200; seed++) {
      const g = new DurakGame(['a', 'b', 'c', 'd'].slice(0, 2 + (seed % 3)));
      playRandomly(g);
      expect(g.finished).toBe(true);
      const total =
        g.discardCount + g.deck.length + g.players.reduce((s, p) => s + p.hand.length, 0);
      expect(total).toBe(36);
    }
  });
});

/** Spielt mit zufälligen gültigen Zügen, bis das Spiel vorbei ist. */
function playRandomly(g: DurakGame): void {
  const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  for (let step = 0; step < 5000 && !g.finished; step++) {
    const moves: (() => void)[] = [];
    const def = g.defender;
    for (const p of g.players) {
      for (const card of p.hand) {
        if (p === def) {
          g.table.forEach((_, i) => moves.push(() => g.defend(p.id, i, card)));
          moves.push(() => g.transfer(p.id, card));
        } else {
          moves.push(() => g.attack(p.id, card));
        }
      }
      if (p === def) moves.push(() => g.take(p.id));
      else moves.push(() => g.pass(p.id));
    }
    // Zufällig probieren, bis ein gültiger Zug dabei ist
    for (let tries = 0; tries < 500; tries++) {
      try {
        pick(moves)();
        break;
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
      }
    }
  }
}

describe('Zeit abgelaufen (verpennt)', () => {
  const setup = () => new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));

  it('Angreifer bei leerem Tisch: kleinste Karte, möglichst kein Trumpf', () => {
    const g = setup();
    expect(g.waitingOn()).toEqual(['a']);
    g.timeout();
    expect(g.table[0].attack).toEqual(c(7, 'S')); // nicht 6♣ (Trumpf)
  });

  it('Verteidiger schluckt', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    expect(g.waitingOn()).toEqual(['b']);
    g.timeout();
    expect(g.taking).toBe(true);
    expect(g.waitingOn().sort()).toEqual(['a', 'c']);
  });

  it('Mitspieler sind fertig → Runde endet', () => {
    const g = setup();
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    g.pass('a');
    expect(g.waitingOn()).toEqual(['c']);
    g.timeout();
    expect(g.table).toHaveLength(0);
    expect(g.attacker.id).toBe('b');
  });

  it('nur Timeouts: Spiel läuft trotzdem bis zum Ende', () => {
    const g = new DurakGame(['a', 'b', 'c', 'd']);
    for (let i = 0; i < 2000 && !g.finished; i++) g.timeout();
    expect(g.finished).toBe(true);
  });
});

describe('Wer fängt an', () => {
  it('ohne Vorgabe: kleinster Trumpf', () => {
    const g = new DurakGame(['a', 'b'], rigDeck([handB, handA], c(14, 'C')));
    expect(g.attacker.id).toBe('b');
  });

  it('nach einer Partie: der Durak', () => {
    const g = new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')), { firstAttackerId: 'c' });
    expect(g.attacker.id).toBe('c');
    expect(g.defender.id).toBe('a');
  });

  it('Angriffskarten merken sich, wer sie gelegt hat', () => {
    const g = new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));
    g.attack('a', c(7, 'S'));
    g.transfer('b', c(7, 'H'));
    expect(g.table.map((t) => t.by)).toEqual(['a', 'b']);
  });
});

describe('Spieler verlässt die Partie', () => {
  it('Karten und offene Runde kommen aus dem Spiel, der Nächste greift an', () => {
    const g = new DurakGame(['a', 'b', 'c'], rigDeck([handA, handB, handC], c(14, 'C')));
    const count = () => g.discardCount + g.deck.length + g.players.reduce((s, p) => s + p.hand.length, 0);
    const before = count();
    g.attack('a', c(7, 'S'));
    g.removePlayer('b'); // Verteidiger geht
    expect(g.players.map((p) => p.id)).toEqual(['a', 'c']);
    expect(g.table).toHaveLength(0);
    expect(g.attacker.id).toBe('c');
    expect(g.defender.id).toBe('a');
    expect(count()).toBe(before);
  });

  it('zufällig: Spieler gehen mitten im Spiel, Spiel bleibt konsistent', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = new DurakGame(['a', 'b', 'c', 'd']);
      for (let i = 0; i < 2000 && !g.finished; i++) {
        if (i === 7) g.removePlayer('c');
        if (i === 40) g.removePlayer('a');
        g.timeout();
      }
      expect(g.finished).toBe(true);
      const total = g.discardCount + g.deck.length + g.players.reduce((s, p) => s + p.hand.length, 0);
      expect(total).toBe(36);
    }
  });
});


describe('Nachlegen nur für Nachbarn', () => {
  function fourPlayers(neighborsOnly: boolean) {
    const g = new DurakGame(['a', 'b', 'c', 'd'], shuffle(createDeck()), { neighborsOnly });
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    g.players[0].hand = [c(7, 'S'), c(12, 'S')];
    g.players[1].hand = [c(9, 'S'), c(10, 'S'), c(11, 'S')];
    g.players[2].hand = [c(7, 'H'), c(6, 'H')];
    g.players[3].hand = [c(7, 'D'), c(6, 'D')];
    return g;
  }

  it('gegenüber darf nicht nachlegen, der andere Nachbar schon', () => {
    const g = fourPlayers(true);
    g.attack('a', c(7, 'S'));
    expect(() => g.attack('d', c(7, 'D'))).toThrow('Nur die Nachbarn');
    g.attack('c', c(7, 'H'));
    expect(g.table).toHaveLength(2);
  });

  it('auf den Gegenüber wird nicht gewartet', () => {
    const g = fourPlayers(true);
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    expect(g.waitingOn().sort()).toEqual(['a', 'c']);
    g.pass('a');
    g.pass('c');
    expect(g.table).toEqual([]); // Runde vorbei, ohne dass d passen musste
  });

  it('ohne die Regel dürfen alle', () => {
    const g = fourPlayers(false);
    g.attack('a', c(7, 'S'));
    g.attack('d', c(7, 'D'));
    expect(g.table).toHaveLength(2);
  });
});

describe('Angriff ohne 6er-Grenze', () => {
  it('unbegrenzt: mehr als 6, aber nicht mehr als der Verteidiger Karten hat', () => {
    const g = new DurakGame(['a', 'b'], shuffle(createDeck()), { unlimited: true });
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    g.players[0].hand = [c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C')];
    g.players[1].hand = [c(14, 'S'), c(14, 'H'), c(14, 'D')];
    g.attack('a', c(7, 'S'));
    g.attack('a', c(7, 'H'));
    g.attack('a', c(7, 'D'));
    expect(() => g.attack('a', c(7, 'C'))).toThrow('Es darf keine Karte mehr gelegt werden');
  });

  it('unbegrenzt: 7 Karten auf einmal sind möglich', () => {
    const g = new DurakGame(['a', 'b'], shuffle(createDeck()), { unlimited: true });
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    // a hat Siebener und Neuner, b hat 10 Karten
    g.players[0].hand = [c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C'), c(9, 'H'), c(9, 'D'), c(9, 'C')];
    g.players[1].hand = [c(9, 'S'), c(10, 'S'), c(10, 'H'), c(10, 'D'), c(10, 'C'), c(11, 'S'), c(11, 'H'), c(11, 'D'), c(11, 'C'), c(12, 'S')];
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S')); // jetzt liegen 7 und 9 → beide Werte erlaubt
    for (const card of [c(7, 'H'), c(7, 'D'), c(7, 'C'), c(9, 'H'), c(9, 'D'), c(9, 'C')]) g.attack('a', card);
    expect(g.table).toHaveLength(7);
  });

  it('Standard: bei 6 ist Schluss', () => {
    const g = new DurakGame(['a', 'b'], shuffle(createDeck()), {});
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    g.players[0].hand = [c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C'), c(9, 'H'), c(9, 'D'), c(9, 'C')];
    g.players[1].hand = [c(9, 'S'), c(10, 'S'), c(10, 'H'), c(10, 'D'), c(10, 'C'), c(11, 'S'), c(11, 'H'), c(11, 'D'), c(11, 'C'), c(12, 'S')];
    g.attack('a', c(7, 'S'));
    g.defend('b', 0, c(9, 'S'));
    for (const card of [c(7, 'H'), c(7, 'D'), c(7, 'C'), c(9, 'H'), c(9, 'D')]) g.attack('a', card);
    expect(() => g.attack('a', c(9, 'C'))).toThrow('Es darf keine Karte mehr gelegt werden');
  });
});
