// Gemeinsame Typen und Hilfsfunktionen für Frontend und Backend.

import { QUICK_BY_LANG } from './i18n';
export * from './i18n';

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

/** Zugzeit, die der Gastgeber in der Lobby wählen kann (Sekunden). Standard 25. */
export const TURN_CHOICES = [15, 25, 40, 60] as const;
export type TurnSeconds = (typeof TURN_CHOICES)[number];
export const DEFAULT_TURN_SECONDS: TurnSeconds = 25;
/** Zug-Timer: die letzten 10 s sind als Countdown sichtbar, vorher läuft er still. */
export const TURN_WARN_MS = 10_000;
/** Standard-Zugzeit in ms */
export const TURN_MS = DEFAULT_TURN_SECONDS * 1000;
/** Nach „Schlucken“: so lange dürfen die anderen noch nachlegen */
export const THROW_IN_MS = 4_000;

// ---------- Austeilen & Nachziehen ----------
// Die Animation läuft im Browser; der Server wartet genau so lange, bevor jemand ziehen darf.

/** Mischen vor dem Austeilen */
export const SHUFFLE_MS = 1500;
/** Austeilen: Abstand zwischen zwei Karten und Flugzeit einer Karte */
export const DEAL_STEP_MS = 220;
export const DEAL_FLY_MS = 450;
/** Nachziehen: erst warten, bis die Tischkarten weggeflogen sind … */
export const DRAW_DELAY_MS = 650;
/** … dann Karte für Karte, Spieler für Spieler */
export const DRAW_CARD_MS = 300;
export const DRAW_PLAYER_GAP_MS = 550;
export const DRAW_FLY_MS = 600;

/** Startzeit jeder nachgezogenen Karte (eine Spieler-ID pro Karte, in Zieh-Reihenfolge) */
export function drawTimes(steps: string[]): number[] {
  let t = 0;
  return steps.map((id, i) => {
    if (i > 0) t += id === steps[i - 1] ? DRAW_CARD_MS : DRAW_PLAYER_GAP_MS;
    return t;
  });
}

/** So lange dauert Mischen + Austeilen einer neuen Partie */
export const dealDurationMs = (players: number) => SHUFFLE_MS + (players * HAND_SIZE - 1) * DEAL_STEP_MS + DEAL_FLY_MS;

/** So lange dauert das Nachziehen nach einer Runde */
export const drawDurationMs = (steps: string[]) =>
  steps.length ? DRAW_DELAY_MS + (drawTimes(steps).at(-1) ?? 0) + DRAW_FLY_MS : 0;

/** Wer so lange getrennt ist, darf von den anderen aus dem Raum entfernt werden (bzw. fliegt aus der Lobby). */
export const AWAY_KICK_MS = 60_000;

/** Aussehen der Figur (neben der Farbe): Augen, Mund, Accessoire – je ein Index in die Listen */
export const LOOK_EYES = [
  'dots',
  'sleepy',
  'wink',
  'glasses',
  'sunglasses',
  'angry',
  'hearts',
  'stars',
  'eyepatch',
  'monocle',
  'visor',
] as const;
export const LOOK_MOUTHS = ['plain', 'grin', 'tongue', 'fangs', 'cigar', 'pipe', 'bubblegum', 'handlebar'] as const;
export const LOOK_HATS = [
  'none',
  'ushanka',
  'tophat',
  'crown',
  'headphones',
  'kerchief',
  'cap',
  'cowboy',
  'pirate',
  'beanie',
  'viking',
  'wizard',
  'halo',
  'horns',
  'party',
] as const;

export interface Look {
  eyes: number;
  mouth: number;
  hat: number;
}

export const DEFAULT_LOOK: Look = { eyes: 0, mouth: 0, hat: 0 };

/** Aussehen vom Client prüfen – Unbekanntes wird zu „normal“ */
export function cleanLook(raw: unknown): Look {
  const r = (raw ?? {}) as Partial<Record<keyof Look, unknown>>;
  const pick = (v: unknown, n: number) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : 0;
  return {
    eyes: pick(r.eyes, LOOK_EYES.length),
    mouth: pick(r.mouth, LOOK_MOUTHS.length),
    hat: pick(r.hat, LOOK_HATS.length),
  };
}

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

/** Einstellungen eines Raums – ändert der Gastgeber in der Lobby */
export interface RoomSettings {
  /** In der Liste offener Spiele sichtbar (sonst nur mit Code) */
  public: boolean;
  /** Nachlegen nur für die beiden Nachbarn des Verteidigers */
  neighborsOnly: boolean;
  /** Angriff ohne 6er-Grenze – so viele Karten, wie der Verteidiger hat */
  unlimited: boolean;
  /** Spielhilfen: passende Karten leuchten (Standard aus – selbst aufpassen) */
  hints: boolean;
  /** Zugzeit in Sekunden */
  turnSeconds: TurnSeconds;
  /** Weiterschieben erlaubt (Perevodnoy, Standard); aus = Podkidnoy */
  transfer: boolean;
}

/** Eintrag in der Liste offener Spiele auf der Startseite */
export interface OpenLobby {
  code: string;
  host: string;
  /** Index in AVATAR_COLORS */
  color: number;
  look: Look;
  players: number;
  /** davon Bots – ein Mensch, der beitritt, nimmt einem Bot den Platz */
  bots: number;
  neighborsOnly: boolean;
  unlimited: boolean;
  transfer: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  cardCount: number;
  connected: boolean;
  /** Keine Karten mehr und Stapel leer → raus (gewonnen). */
  out: boolean;
  /** Index in AVATAR_COLORS */
  color: number;
  look: Look;
  /** Wie oft schon Durak in diesem Raum */
  durakCount: number;
  /** Getrennt seit … ms (beim Senden); null = verbunden */
  awayMs: number | null;
  /** Vom Server gespielt (kein Mensch) */
  bot: boolean;
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
  timer: {
    waitingOn: string[];
    remainingMs: number;
    /** Gesamtdauer dieses Timers (für den Ring) */
    totalMs: number;
    /** 'throwIn' = kurzer Countdown zum Nachlegen */
    kind: 'turn' | 'throwIn';
  } | null;
  /** Durak der letzten Partie – trägt die Narrenkappe, mischt und fängt an */
  lastDurakId: string | null;
  /** Wer für die aktuelle Partie gemischt hat (null = erste Partie) */
  dealerId: string | null;
  /** Zähler der Partien im Raum – ändert sich bei jedem Neustart */
  round: number;
  /** Jemand ist mitten im Spiel getrennt → keine Züge, Timer steht */
  paused: boolean;
  settings: RoomSettings;
  /** Wer gerade nachlegen darf (bei „nur Nachbarn“ nicht alle) */
  throwers: string[];
  /** Karten werden noch ausgeteilt/nachgezogen – so lange (ms ab Versand) darf niemand ziehen */
  holdMs: number;
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface Session {
  roomCode: string;
  playerId: string;
  token: string;
}

// ---------- Chat & Werfen ----------

export const CHAT_MAX = 120;

/** Alle Schnellsprüche (jede Sprache) – in öffentlichen Räumen die einzigen erlaubten Nachrichten */
export const QUICK_PHRASES = [...new Set(Object.values(QUICK_BY_LANG).flat())];
/** So viele Nachrichten merkt sich ein Raum */
export const CHAT_KEEP = 50;

export interface ChatMessage {
  id: number;
  from: string;
  name: string;
  /** Index in AVATAR_COLORS */
  color: number;
  text: string;
  at: number;
}

export const THROW_ITEMS = ['tomato', 'slipper', 'egg', 'flowers', 'fish'] as const;
export type ThrowItem = (typeof THROW_ITEMS)[number];

export interface ThrowEvent {
  id: number;
  from: string;
  to: string;
  item: ThrowItem;
}

export interface ClientToServerEvents {
  'room:create': (
    p: { name: string; color: number; look?: Look; public?: boolean },
    ack: (r: Result<Session>) => void,
  ) => void;
  'room:join': (
    p: { roomCode: string; name: string; color: number; look?: Look },
    ack: (r: Result<Session>) => void,
  ) => void;
  'room:rejoin': (p: { roomCode: string; token: string }, ack: (r: Result<Session>) => void) => void;
  'room:leave': () => void;
  /** Gastgeber: Einstellungen ändern (nicht während einer Partie) */
  'room:settings': (p: Partial<RoomSettings>, ack: (r: Result) => void) => void;
  /** Gastgeber: Spieler (oder Bot) aus der Lobby werfen */
  'room:kick': (p: { playerId: string }, ack: (r: Result) => void) => void;
  /** Gastgeber: Bot auf einen freien Platz setzen */
  'room:addBot': (ack: (r: Result) => void) => void;
  /** Startseite: Liste offener Spiele abonnieren / abbestellen */
  'lobbies:watch': () => void;
  'lobbies:unwatch': () => void;
  'game:start': (ack: (r: Result) => void) => void;
  'game:attack': (p: { card: Card }, ack: (r: Result) => void) => void;
  'game:defend': (p: { attackIndex: number; card: Card }, ack: (r: Result) => void) => void;
  'game:transfer': (p: { card: Card }, ack: (r: Result) => void) => void;
  'game:take': (ack: (r: Result) => void) => void;
  'game:pass': (ack: (r: Result) => void) => void;
  /** Getrennten Spieler nach der Pause aus dem Raum entfernen */
  'game:kick': (p: { playerId: string }, ack: (r: Result) => void) => void;
  'chat:send': (p: { text: string }, ack: (r: Result) => void) => void;
  /** Etwas auf einen Mitspieler werfen */
  throw: (p: { to: string; item: ThrowItem }, ack: (r: Result) => void) => void;
}

export interface ServerToClientEvents {
  state: (view: GameView) => void;
  /** Nachricht vom Betreiber an alle (null = weg) */
  notice: (notice: { text: string } | null) => void;
  chat: (msg: ChatMessage) => void;
  /** Ganzer Verlauf beim Betreten/Wiederverbinden */
  'chat:history': (msgs: ChatMessage[]) => void;
  throw: (t: ThrowEvent) => void;
  lobbies: (list: OpenLobby[]) => void;
  /** Du wurdest vom Gastgeber aus dem Raum entfernt */
  kicked: () => void;
}
