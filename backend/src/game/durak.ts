import {
  beats,
  HAND_SIZE,
  MAX_PLAYERS,
  MAX_TABLE,
  MIN_PLAYERS,
  RANKS,
  sameCard,
  SUITS,
  type Card,
  type Suit,
  type TablePair,
} from '@durak/shared';

export class GameError extends Error {}

export interface GamePlayer {
  id: string;
  hand: Card[];
}

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Durak Perevodnoy (mit Weiterschieben), server-authoritative.
 * Jede Methode prüft den Zug und wirft GameError, wenn er nicht erlaubt ist.
 */
export class DurakGame {
  readonly players: GamePlayer[];
  /** Gezogen wird vom Ende; deck[0] ist die aufgedeckte Trumpfkarte. */
  deck: Card[];
  readonly trumpCard: Card;
  readonly trump: Suit;
  table: TablePair[] = [];
  discardCount = 0;
  attackerIdx: number;
  defenderIdx: number;
  taking = false;
  passed = new Set<string>();
  finished = false;
  durakId: string | null = null;
  /** Nachlegen nur für die beiden Nachbarn des Verteidigers (sonst alle) */
  readonly neighborsOnly: boolean;
  /** Höchstzahl Angriffskarten pro Runde (Standard 6; „unbegrenzt“ = nur durch die Hand des Verteidigers) */
  readonly maxTable: number;

  constructor(
    playerIds: string[],
    deck: Card[] = shuffle(createDeck()),
    opts: { firstAttackerId?: string | null; neighborsOnly?: boolean; unlimited?: boolean } = {},
  ) {
    this.neighborsOnly = !!opts.neighborsOnly;
    this.maxTable = opts.unlimited ? Infinity : MAX_TABLE;
    if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
      throw new GameError(`${MIN_PLAYERS}–${MAX_PLAYERS} Spieler nötig`);
    }
    this.players = playerIds.map((id) => ({ id, hand: [] }));
    this.deck = [...deck];
    this.trumpCard = this.deck[0];
    this.trump = this.trumpCard.suit;

    for (let round = 0; round < HAND_SIZE; round++) {
      for (const p of this.players) p.hand.push(this.deck.pop()!);
    }

    // Erste Partie: kleinster Trumpf. Danach fängt der Durak der letzten Partie an.
    const durakIdx = opts.firstAttackerId ? playerIds.indexOf(opts.firstAttackerId) : -1;
    this.attackerIdx = durakIdx >= 0 ? durakIdx : this.lowestTrumpHolder();
    this.defenderIdx = this.nextActive(this.attackerIdx);
  }

  // ---------- Abfragen ----------

  get attacker(): GamePlayer {
    return this.players[this.attackerIdx];
  }

  get defender(): GamePlayer {
    return this.players[this.defenderIdx];
  }

  isOut(p: GamePlayer): boolean {
    return p.hand.length === 0 && this.deck.length === 0;
  }

  /** Darf dieser Spieler gerade Karten nachlegen? (nicht der Verteidiger, hat Karten, ggf. nur Nachbarn) */
  mayThrowIn(p: GamePlayer): boolean {
    if (p === this.defender || p.hand.length === 0) return false;
    if (!this.neighborsOnly) return true;
    return p === this.attacker || p === this.players[this.nextActive(this.defenderIdx)];
  }

  /** Nur noch Nachlegen offen (Verteidiger schluckt oder hat alles geschlagen)? */
  inThrowIn(): boolean {
    return !this.finished && this.table.length > 0 && (this.taking || this.table.every((t) => t.defense !== null));
  }

  /** Wer darf in dieser Runde nachlegen? */
  throwers(): GamePlayer[] {
    return this.players.filter((p) => this.mayThrowIn(p));
  }

  // ---------- Züge ----------

  attack(playerId: string, card: Card): void {
    const p = this.requirePlayer(playerId);
    this.requireRunning();
    if (p === this.defender) throw new GameError('Der Verteidiger kann nicht angreifen');
    if (this.table.length === 0) {
      if (p !== this.attacker) throw new GameError('Nur der Angreifer darf den ersten Zug machen');
    } else if (!this.mayThrowIn(p)) {
      throw new GameError('Nur die Nachbarn des Verteidigers dürfen nachlegen');
    } else if (!this.tableRanks().has(card.rank)) {
      throw new GameError('Nur Karten mit einem Wert, der schon auf dem Tisch liegt');
    }
    if (!this.roomForAttack()) throw new GameError('Es darf keine Karte mehr gelegt werden');

    this.removeFromHand(p, card);
    this.table.push({ attack: card, defense: null, by: p.id });
    this.passed.clear();
    this.checkBoutEnd();
  }

  defend(playerId: string, attackIndex: number, card: Card): void {
    const p = this.requirePlayer(playerId);
    this.requireRunning();
    if (p !== this.defender) throw new GameError('Nur der Verteidiger darf schlagen');
    if (this.taking) throw new GameError('Du hast schon „Schlucken“ gewählt');
    const pair = this.table[attackIndex];
    if (!pair) throw new GameError('Diese Karte gibt es nicht');
    if (pair.defense) throw new GameError('Diese Karte ist schon geschlagen');
    if (!beats(pair.attack, card, this.trump)) throw new GameError('Diese Karte schlägt nicht');

    this.removeFromHand(p, card);
    pair.defense = card;
    this.passed.clear();
    this.checkBoutEnd();
  }

  transfer(playerId: string, card: Card): void {
    const p = this.requirePlayer(playerId);
    this.requireRunning();
    if (p !== this.defender) throw new GameError('Nur der Verteidiger darf weiterschieben');
    if (this.taking) throw new GameError('Du hast schon „Schlucken“ gewählt');
    if (this.table.length === 0) throw new GameError('Es liegt nichts auf dem Tisch');
    if (this.table.some((t) => t.defense)) {
      throw new GameError('Nach dem ersten Schlagen kann nicht mehr weitergeschoben werden');
    }
    if (this.table.some((t) => t.attack.rank !== card.rank)) {
      throw new GameError('Weiterschieben nur mit einer Karte gleichen Werts');
    }
    if (this.table.length + 1 > this.maxTable) throw new GameError('Zu viele Karten auf dem Tisch');

    const nextIdx = this.nextActive(this.defenderIdx);
    const next = this.players[nextIdx];
    if (next.hand.length < this.table.length + 1) {
      throw new GameError('Der nächste Spieler hat nicht genug Karten zum Verteidigen');
    }

    this.removeFromHand(p, card);
    this.table.push({ attack: card, defense: null, by: p.id });
    this.attackerIdx = this.defenderIdx;
    this.defenderIdx = nextIdx;
    this.passed.clear();
    this.checkBoutEnd();
  }

  take(playerId: string): void {
    const p = this.requirePlayer(playerId);
    this.requireRunning();
    if (p !== this.defender) throw new GameError('Nur der Verteidiger kann schlucken');
    if (this.table.length === 0) throw new GameError('Es liegt nichts auf dem Tisch');
    if (this.taking) throw new GameError('Du schluckst bereits');
    if (this.table.every((t) => t.defense)) throw new GameError('Alles ist geschlagen');

    this.taking = true;
    this.passed.clear();
    this.checkBoutEnd();
  }

  /** Angreifer/Mitspieler: „Ich lege nichts mehr nach“ (Fertig). */
  pass(playerId: string): void {
    const p = this.requirePlayer(playerId);
    this.requireRunning();
    if (p === this.defender) throw new GameError('Der Verteidiger kann nicht passen');
    if (this.table.length === 0) throw new GameError('Es liegt nichts auf dem Tisch');
    if (!this.taking && this.table.some((t) => !t.defense)) {
      throw new GameError('Warte, bis der Verteidiger geschlagen hat');
    }
    this.passed.add(p.id);
    this.checkBoutEnd();
  }

  /**
   * Spieler verlässt die laufende Partie (gegangen oder nach der Pause entfernt).
   * Seine Karten und die offene Runde kommen aus dem Spiel; weiter geht es beim nächsten Spieler.
   */
  removePlayer(playerId: string): void {
    const idx = this.players.findIndex((p) => p.id === playerId);
    if (idx === -1 || this.finished) return;
    const removed = this.players[idx];
    const tableCards = this.table.reduce((n, t) => n + (t.defense ? 2 : 1), 0);
    this.discardCount += removed.hand.length + tableCards;
    removed.hand = [];
    this.table = [];
    this.taking = false;
    this.passed.clear();
    this.players.splice(idx, 1);

    if (this.players.length < 2) {
      this.finished = true;
      this.durakId = null;
      return;
    }
    // Wer nach dem Entfernten saß, greift an
    this.attackerIdx = this.firstActiveFrom(idx % this.players.length);
    this.defenderIdx = this.nextActive(this.attackerIdx);
    this.refillHands();
    if (this.finishIfOver()) return;
    this.attackerIdx = this.firstActiveFrom(this.attackerIdx);
    this.defenderIdx = this.nextActive(this.attackerIdx);
  }

  // ---------- Zug-Timer ----------

  /** Auf wen wird gerade gewartet? */
  waitingOn(): string[] {
    if (this.finished) return [];
    if (this.table.length === 0) return [this.attacker.id];
    if (!this.taking && this.table.some((t) => !t.defense)) return [this.defender.id];
    return this.throwers()
      .filter((p) => !this.passed.has(p.id))
      .map((p) => p.id);
  }

  /**
   * Zeit abgelaufen – wer nichts tut, „verpennt“: Verteidiger schluckt, Mitspieler sind fertig.
   * Nur der Angreifer bei leerem Tisch muss etwas legen: seine kleinste Karte (möglichst kein Trumpf).
   */
  timeout(): void {
    if (this.finished) return;
    if (this.table.length === 0) {
      const a = this.attacker;
      const lowest = [...a.hand].sort(
        (x, y) => Number(x.suit === this.trump) - Number(y.suit === this.trump) || x.rank - y.rank,
      )[0];
      this.attack(a.id, lowest);
      return;
    }
    if (!this.taking && this.table.some((t) => !t.defense)) {
      this.take(this.defender.id);
      return;
    }
    for (const id of this.waitingOn()) {
      if (this.table.length === 0) break; // Runde ist schon vorbei
      this.pass(id);
    }
  }

  // ---------- Ablauf ----------

  private checkBoutEnd(): void {
    // Stapel leer und nur noch einer hat Karten → sofort Schluss, der ist der Durak.
    // Ausnahme: Er verteidigt und kann alles mit seinen letzten Karten schlagen → er darf es
    // versuchen; schafft er es, ist es unentschieden.
    if (
      this.deck.length === 0 &&
      this.players.filter((p) => p.hand.length > 0).length <= 1 &&
      !this.canStillDraw()
    ) {
      const cards = this.table.reduce((n, t) => n + (t.defense ? 2 : 1), 0);
      this.discardCount += cards;
      this.table = [];
      this.taking = false;
      this.passed.clear();
      this.finishIfOver();
      return;
    }
    const undefended = this.table.filter((t) => !t.defense).length;
    if (undefended > 0 && !this.taking) {
      // Verteidiger ist dran – außer er hat keine Karten mehr (kann nicht passieren, da Limit).
      return;
    }
    const waitingFor = this.throwers().filter((p) => !this.passed.has(p.id));
    if (this.roomForAttack() && waitingFor.length > 0) return;
    this.endBout();
  }

  private roomForAttack(): boolean {
    const undefended = this.table.filter((t) => !t.defense).length;
    return this.table.length < this.maxTable && undefended < this.defender.hand.length;
  }

  private endBout(): void {
    const tookCards = this.taking;
    const cards = this.table.flatMap((t) => (t.defense ? [t.attack, t.defense] : [t.attack]));
    if (tookCards) this.defender.hand.push(...cards);
    else this.discardCount += cards.length;

    this.table = [];
    this.taking = false;
    this.passed.clear();
    this.refillHands();

    if (this.finishIfOver()) return;

    this.attackerIdx = tookCards
      ? this.nextActive(this.defenderIdx)
      : this.firstActiveFrom(this.defenderIdx);
    this.defenderIdx = this.nextActive(this.attackerIdx);
  }

  /** Kann der Verteidiger mit genau seinen restlichen Karten alles Offene schlagen? */
  private canStillDraw(): boolean {
    const d = this.defender;
    if (this.taking || d.hand.length === 0) return false;
    const open = this.table.filter((t) => !t.defense).map((t) => t.attack);
    if (open.length !== d.hand.length) return false;
    const match = (attacks: Card[], hand: Card[]): boolean =>
      attacks.length === 0 ||
      hand.some(
        (card, i) =>
          beats(attacks[0], card, this.trump) &&
          match(attacks.slice(1), hand.filter((_, j) => j !== i)),
      );
    return match(open, d.hand);
  }

  /** Stapel leer und höchstens einer hat noch Karten → Spiel vorbei. */
  private finishIfOver(): boolean {
    const withCards = this.players.filter((p) => p.hand.length > 0);
    if (this.deck.length > 0 || withCards.length > 1) return false;
    this.finished = true;
    this.durakId = withCards[0]?.id ?? null;
    return true;
  }

  /** Nachziehen: Angreifer zuerst, dann reihum, Verteidiger zuletzt. */
  private refillHands(): void {
    const n = this.players.length;
    const order: GamePlayer[] = [];
    for (let i = 0; i < n; i++) {
      const p = this.players[(this.attackerIdx + i) % n];
      if (p !== this.defender) order.push(p);
    }
    order.push(this.defender);
    for (const p of order) {
      while (p.hand.length < HAND_SIZE && this.deck.length > 0) p.hand.push(this.deck.pop()!);
    }
  }

  // ---------- Hilfen ----------

  private lowestTrumpHolder(): number {
    let best = -1;
    let bestRank = Infinity;
    this.players.forEach((p, i) => {
      for (const c of p.hand) {
        if (c.suit === this.trump && c.rank < bestRank) {
          bestRank = c.rank;
          best = i;
        }
      }
    });
    return best === -1 ? 0 : best;
  }

  private firstActiveFrom(idx: number): number {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const j = (idx + i) % n;
      if (!this.isOut(this.players[j])) return j;
    }
    return idx;
  }

  private nextActive(idx: number): number {
    return this.firstActiveFrom((idx + 1) % this.players.length);
  }

  private tableRanks(): Set<number> {
    const ranks = new Set<number>();
    for (const t of this.table) {
      ranks.add(t.attack.rank);
      if (t.defense) ranks.add(t.defense.rank);
    }
    return ranks;
  }

  private requirePlayer(id: string): GamePlayer {
    const p = this.players.find((x) => x.id === id);
    if (!p) throw new GameError('Du spielst nicht mit');
    return p;
  }

  private requireRunning(): void {
    if (this.finished) throw new GameError('Das Spiel ist vorbei');
  }

  private removeFromHand(p: GamePlayer, card: Card): void {
    const i = p.hand.findIndex((c) => sameCard(c, card));
    if (i === -1) throw new GameError('Diese Karte hast du nicht');
    p.hand.splice(i, 1);
  }
}
