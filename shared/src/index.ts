// Gemeinsame Typen und Hilfsfunktionen für Frontend und Backend.

export const SUITS = ['S', 'H', 'D', 'C'] as const; // Pik, Herz, Karo, Kreuz
export type Suit = (typeof SUITS)[number];

export const RANKS = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const; // 11=Bube … 14=Ass
export type Rank = (typeof RANKS)[number];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const HAND_SIZE = 6;
export const MAX_TABLE = 6;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** Zug-Timer: erst 15 s ohne Anzeige, dann 10 s sichtbarer Countdown. */
export const TURN_SILENT_MS = 15_000;
export const TURN_WARN_MS = 10_000;
export const TURN_MS = TURN_SILENT_MS + TURN_WARN_MS;

/** Wer so lange getrennt ist, darf von den anderen aus dem Raum entfernt werden (bzw. fliegt aus der Lobby). */
export const AWAY_KICK_MS = 60_000;

/** Farben für die Figuren (Index wird übertragen) */
export const AVATAR_COLORS = [
  '#ff6b6b',
  '#ffa94d',
  '#ffd43b',
  '#a9e34b',
  '#38d9a9',
  '#3bc9db',
  '#4dabf7',
  '#748ffc',
  '#b197fc',
  '#f783ac',
  '#dee2e6',
  '#a1887f',
] as const;

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Schlägt `defense` die Karte `attack` bei Trumpf `trump`? */
export function beats(attack: Card, defense: Card, trump: Suit): boolean {
  if (defense.suit === attack.suit) return defense.rank > attack.rank;
  return defense.suit === trump && attack.suit !== trump;
}

export interface TablePair {
  attack: Card;
  defense: Card | null;
  /** Wer die Angriffskarte gelegt hat */
  by: string;
}

export type Phase = 'lobby' | 'playing' | 'finished';

export interface PlayerView {
  id: string;
  name: string;
  cardCount: number;
  connected: boolean;
  /** Keine Karten mehr und Stapel leer → raus (gewonnen). */
  out: boolean;
  /** Index in AVATAR_COLORS */
  color: number;
  /** Wie oft schon Durak in diesem Raum */
  durakCount: number;
  /** Getrennt seit … ms (beim Senden); null = verbunden */
  awayMs: number | null;
}

/** Was ein einzelner Spieler vom Spiel sieht – nur die eigenen Karten. */
export interface GameView {
  roomCode: string;
  phase: Phase;
  hostId: string;
  you: string;
  players: PlayerView[];
  hand: Card[];
  trumpSuit: Suit | null;
  /** Aufgedeckte Trumpfkarte unter dem Stapel (null, sobald sie gezogen wurde). */
  trumpCard: Card | null;
  deckCount: number;
  discardCount: number;
  table: TablePair[];
  attackerId: string | null;
  defenderId: string | null;
  /** Verteidiger hat „Schlucken“ gesagt – Angreifer dürfen noch nachlegen. */
  taking: boolean;
  passed: string[];
  /** Verlierer; bei phase=finished und null → Unentschieden. */
  durakId: string | null;
  /** Zug-Timer: auf wen gewartet wird und wie viel Zeit noch bleibt (ab Versand). */
  timer: { waitingOn: string[]; remainingMs: number } | null;
  /** Durak der letzten Partie – trägt die Narrenkappe, mischt und fängt an */
  lastDurakId: string | null;
  /** Wer für die aktuelle Partie gemischt hat (null = erste Partie) */
  dealerId: string | null;
  /** Zähler der Partien im Raum – ändert sich bei jedem Neustart */
  round: number;
  /** Jemand ist mitten im Spiel getrennt → keine Züge, Timer steht */
  paused: boolean;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface Session {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface ClientToServerEvents {
  'room:create': (p: { name: string; color: number }, ack: (r: Result<Session>) => void) => void;
  'room:join': (p: { roomCode: string; name: string; color: number }, ack: (r: Result<Session>) => void) => void;
  'room:rejoin': (p: { roomCode: string; token: string }, ack: (r: Result<Session>) => void) => void;
  'room:leave': () => void;
  'game:start': (ack: (r: Result) => void) => void;
  'game:attack': (p: { card: Card }, ack: (r: Result) => void) => void;
  'game:defend': (p: { attackIndex: number; card: Card }, ack: (r: Result) => void) => void;
  'game:transfer': (p: { card: Card }, ack: (r: Result) => void) => void;
  'game:take': (ack: (r: Result) => void) => void;
  'game:pass': (ack: (r: Result) => void) => void;
  /** Getrennten Spieler nach der Pause aus dem Raum entfernen */
  'game:kick': (p: { playerId: string }, ack: (r: Result) => void) => void;
}

export interface ServerToClientEvents {
  state: (view: GameView) => void;
  /** Nachricht vom Betreiber an alle (null = weg) */
  notice: (notice: { text: string } | null) => void;
}
