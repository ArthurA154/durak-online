import { randomBytes, randomUUID } from 'node:crypto';
import {
  AVATAR_COLORS,
  AWAY_KICK_MS,
  CHAT_KEEP,
  CHAT_MAX,
  QUICK_PHRASES,
  type OpenLobby,
  type RoomSettings,
  THROW_ITEMS,
  type ChatMessage,
  type ThrowEvent,
  type ThrowItem,
  MAX_PLAYERS,
  MIN_PLAYERS,
  THROW_IN_MS,
  TURN_CHOICES,
  DEFAULT_TURN_SECONDS,
  type TurnSeconds,
  type GameView,
  type Session,
} from '@durak/shared';
import { DurakGame, GameError } from './game/durak.js';

export interface RoomPlayer {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  /** Seit wann getrennt (für Pause / Entfernen) */
  awaySince: number | null;
  color: number;
  durakCount: number;
  /** Adresse – nur im Speicher, damit Rausgeworfene nicht gleich wieder reinkommen */
  ip: string;
}

export interface Room {
  code: string;
  hostId: string;
  players: RoomPlayer[];
  game: DurakGame | null;
  /** Zeitpunkt, ab dem niemand mehr verbunden war (für Aufräumen). */
  emptySince: number | null;
  /** Zug-Timer */
  deadline: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  timerKind: 'turn' | 'throwIn';
  /** Durak der letzten Partie (Narrenkappe, mischt, fängt an) */
  lastDurakId: string | null;
  dealerId: string | null;
  round: number;
  /** Ergebnis der aktuellen Partie schon gezählt? */
  resultRecorded: boolean;
  createdAt: number;
  /** Start der aktuellen Partie und wer da mitgespielt hat (für die Statistik) */
  gameStartedAt: number | null;
  gamePlayers: string[];
  /** Letzte Chat-Nachrichten (nur im Speicher) */
  chat: ChatMessage[];
  settings: RoomSettings;
  /** Adressen, die der Gastgeber rausgeworfen hat */
  banned: Set<string>;
}

export type GameOutcome = 'durak' | 'draw' | 'aborted';

/** Für die Admin-Statistik: was in den Räumen passiert. */
export interface RoomEvents {
  roomCreated?(room: Room): void;
  gameStarted?(room: Room): void;
  gameEnded?(room: Room, outcome: GameOutcome, durakName: string | null): void;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let seq = 0;

/** Chat-Text säubern: Steuerzeichen raus, Leerraum zusammenfassen, kürzen */
export function cleanChat(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
}

const isRunning = (room: Room) => !!room.game && !room.game.finished;

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private events: RoomEvents = {}) {}

  /** Alle Räume (nur lesen – für die Admin-Übersicht) */
  all(): IterableIterator<Room> {
    return this.rooms.values();
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  get size(): number {
    return this.rooms.size;
  }

  create(name: string, color: number, socketId: string, isPublic = false, ip = ''): { room: Room; session: Session } {
    let code: string;
    do {
      code = Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.rooms.has(code));

    const player = newPlayer(name, color, socketId, ip);
    const room: Room = {
      code,
      hostId: player.id,
      players: [player],
      game: null,
      emptySince: null,
      deadline: null,
      timer: null,
      timerKind: 'turn',
      lastDurakId: null,
      dealerId: null,
      round: 0,
      resultRecorded: false,
      createdAt: Date.now(),
      gameStartedAt: null,
      gamePlayers: [],
      chat: [],
      settings: {
        public: isPublic,
        neighborsOnly: false,
        unlimited: false,
        hints: false,
        turnSeconds: DEFAULT_TURN_SECONDS,
        transfer: true,
      },
      banned: new Set(),
    };
    this.rooms.set(code, room);
    this.events.roomCreated?.(room);
    return { room, session: sessionOf(room, player) };
  }

  join(code: string, name: string, color: number, socketId: string, ip = ''): { room: Room; session: Session } {
    const room = this.get(code);
    if (!room) throw new GameError('Raum nicht gefunden');
    if (ip && room.banned.has(ip)) throw new GameError('Der Gastgeber hat dich aus diesem Raum entfernt');
    if (isRunning(room)) throw new GameError('Das Spiel läuft bereits');
    if (room.players.length >= MAX_PLAYERS) throw new GameError('Der Raum ist voll');

    const player = newPlayer(name, color, socketId, ip);
    room.players.push(player);
    room.emptySince = null;
    return { room, session: sessionOf(room, player) };
  }

  /** Wiederverbinden mit dem Token; gibt auch die bisherige Verbindung zurück (die damit ihren Platz verliert) */
  rejoin(
    code: string,
    token: string,
    socketId: string,
  ): { room: Room; session: Session; previousSocketId: string | null } {
    const room = this.get(code);
    const player = room?.players.find((p) => p.token === token);
    if (!room || !player) throw new GameError('Sitzung abgelaufen');
    const previousSocketId = player.socketId;
    player.socketId = socketId;
    player.awaySince = null;
    room.emptySince = null;
    return { room, session: sessionOf(room, player), previousSocketId };
  }

  /** Chat-Nachricht eines Spielers im Raum */
  chat(room: Room, playerId: string, raw: unknown, now = Date.now()): ChatMessage {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) throw new GameError('Du bist nicht in diesem Raum');
    const text = cleanChat(raw);
    if (!text) throw new GameError('Leere Nachricht');
    if (room.settings.public && !QUICK_PHRASES.includes(text)) {
      throw new GameError('In öffentlichen Räumen gehen nur Schnellsprüche');
    }
    const msg: ChatMessage = { id: ++seq, from: p.id, name: p.name, color: p.color, text, at: now };
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.splice(0, room.chat.length - CHAT_KEEP);
    return msg;
  }

  /** Etwas auf einen Mitspieler werfen (nur prüfen – gespeichert wird nichts) */
  throwAt(room: Room, playerId: string, to: unknown, item: unknown): ThrowEvent {
    if (!room.players.some((x) => x.id === playerId)) throw new GameError('Du bist nicht in diesem Raum');
    if (!THROW_ITEMS.includes(item as ThrowItem)) throw new GameError('Das kann man nicht werfen');
    const target = room.players.find((x) => x.id === to);
    if (!target) throw new GameError('Diesen Spieler gibt es nicht');
    if (target.id === playerId) throw new GameError('Nicht auf dich selbst');
    return { id: ++seq, from: playerId, to: target.id, item: item as ThrowItem };
  }

  /** Gastgeber ändert Einstellungen – nicht während einer laufenden Partie */
  updateSettings(room: Room, playerId: string, change: Partial<RoomSettings>): void {
    if (room.hostId !== playerId) throw new GameError('Nur der Gastgeber kann das ändern');
    if (isRunning(room)) throw new GameError('Erst nach der Partie');
    if (typeof change?.public === 'boolean') room.settings.public = change.public;
    if (typeof change?.neighborsOnly === 'boolean') room.settings.neighborsOnly = change.neighborsOnly;
    if (typeof change?.unlimited === 'boolean') room.settings.unlimited = change.unlimited;
    if (typeof change?.hints === 'boolean') room.settings.hints = change.hints;
    if (TURN_CHOICES.includes(change?.turnSeconds as TurnSeconds)) room.settings.turnSeconds = change.turnSeconds!;
    if (typeof change?.transfer === 'boolean') room.settings.transfer = change.transfer;
  }

  /** Gastgeber wirft jemanden aus dem Raum (nicht während einer Partie). Gibt dessen Verbindung zurück. */
  kickFromLobby(room: Room, byId: string, targetId: string): string | null {
    if (room.hostId !== byId) throw new GameError('Nur der Gastgeber kann Spieler entfernen');
    if (isRunning(room)) throw new GameError('Erst nach der Partie');
    const target = room.players.find((p) => p.id === targetId);
    if (!target) throw new GameError('Diesen Spieler gibt es nicht mehr');
    if (target.id === byId) throw new GameError('Du kannst dich nicht selbst entfernen');
    const socketId = target.socketId;
    if (target.ip) room.banned.add(target.ip);
    this.removePlayer(room, target);
    return socketId;
  }

  /** Öffentliche Räume, die noch auf Spieler warten (keine laufenden oder fertigen Partien) */
  openLobbies(): OpenLobby[] {
    const list: OpenLobby[] = [];
    for (const room of this.rooms.values()) {
      const host = room.players.find((p) => p.id === room.hostId);
      if (!room.settings.public || room.game || !host?.socketId) continue;
      if (room.players.length >= MAX_PLAYERS) continue;
      list.push({
        code: room.code,
        host: host.name,
        color: host.color,
        players: room.players.length,
        neighborsOnly: room.settings.neighborsOnly,
        unlimited: room.settings.unlimited,
        transfer: room.settings.transfer,
      });
    }
    return list.slice(0, 50);
  }

  /** Mitten im Spiel ist jemand getrennt → keine Züge, Timer steht. */
  isPaused(room: Room): boolean {
    return isRunning(room) && room.players.some((p) => !p.socketId);
  }

  start(room: Room, playerId: string): void {
    if (room.hostId !== playerId) throw new GameError('Nur der Gastgeber kann starten');
    if (isRunning(room)) throw new GameError('Das Spiel läuft bereits');
    // Wer gerade nicht verbunden ist, spielt nicht mit
    room.players = room.players.filter((p) => p.socketId);
    if (room.lastDurakId && !room.players.some((p) => p.id === room.lastDurakId)) room.lastDurakId = null;
    if (room.players.length < MIN_PLAYERS) throw new GameError(`Mindestens ${MIN_PLAYERS} Spieler nötig`);
    const ids = room.players.map((p) => p.id);
    // Der Durak der letzten Partie mischt und greift zuerst an
    const durak = room.lastDurakId;
    room.game = new DurakGame(ids, undefined, {
      firstAttackerId: durak,
      neighborsOnly: room.settings.neighborsOnly,
      unlimited: room.settings.unlimited,
      transfer: room.settings.transfer,
    });
    room.dealerId = durak;
    room.round++;
    room.resultRecorded = false;
    room.gameStartedAt = Date.now();
    room.gamePlayers = room.players.map((p) => p.name);
    this.events.gameStarted?.(room);
  }

  /** Nach jedem Zug aufrufen: zählt das Ergebnis einer beendeten Partie genau einmal. */
  recordResult(room: Room): void {
    const g = room.game;
    if (!g || !g.finished || room.resultRecorded) return;
    room.resultRecorded = true;
    room.lastDurakId = g.durakId;
    const durak = room.players.find((p) => p.id === g.durakId);
    if (durak) durak.durakCount++;
    // Nur noch einer übrig, weil die anderen gegangen sind → abgebrochen, nicht unentschieden
    const outcome: GameOutcome = durak ? 'durak' : g.players.length < 2 ? 'aborted' : 'draw';
    this.events.gameEnded?.(room, outcome, durak?.name ?? null);
  }

  /**
   * Spieler verlässt den Raum bewusst. Nur die aktuelle Verbindung des Spielers darf das –
   * eine alte/doppelte Verbindung wird ignoriert.
   */
  leave(room: Room, playerId: string, socketId: string): void {
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.socketId !== socketId) return;
    this.removePlayer(room, player);
  }

  /** Verbindung weg. Im laufenden Spiel → Pause. */
  disconnect(room: Room, socketId: string): void {
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) return;
    player.socketId = null;
    player.awaySince = Date.now();
    if (this.isPaused(room)) this.clearTimer(room);
    this.markIfEmpty(room);
  }

  /** Nach der Pause: getrennten Spieler aus dem Raum entfernen (darf jeder verbundene Mitspieler). */
  kick(room: Room, byId: string, targetId: string, now = Date.now()): void {
    const by = room.players.find((p) => p.id === byId);
    const target = room.players.find((p) => p.id === targetId);
    if (!isRunning(room)) throw new GameError('Es läuft gerade kein Spiel');
    if (!by?.socketId) throw new GameError('Du spielst nicht mit');
    if (!target) throw new GameError('Diesen Spieler gibt es nicht mehr');
    if (target.socketId || !target.awaySince) throw new GameError(`${target.name} ist wieder da`);
    const left = AWAY_KICK_MS - (now - target.awaySince);
    if (left > 0) throw new GameError(`Noch ${Math.ceil(left / 1000)} Sekunden warten`);
    this.removePlayer(room, target);
  }

  /** Spieler aus Raum (und ggf. laufender Partie) entfernen. */
  private removePlayer(room: Room, player: RoomPlayer): void {
    room.players = room.players.filter((p) => p !== player);
    if (room.lastDurakId === player.id) room.lastDurakId = null;
    if (room.hostId === player.id && room.players[0]) room.hostId = room.players[0].id;
    if (isRunning(room)) {
      room.game!.removePlayer(player.id);
      this.recordResult(room);
      // Nur noch einer übrig → abgebrochen, zurück in die Lobby (dort kann wieder jemand dazukommen)
      if (room.game!.finished && room.game!.players.length < 2) room.game = null;
    } else {
      // Ergebnisbild einer alten Partie passt nicht mehr zu den Spielern → zurück in die Lobby
      room.game = null;
    }
    if (!isRunning(room)) this.clearTimer(room);
    this.markIfEmpty(room);
  }

  /**
   * Aufräumen (regelmäßig aufrufen):
   * - in der Lobby getrennte Spieler nach AWAY_KICK_MS entfernen (blockieren sonst Plätze)
   * - Räume löschen, die leer sind oder in denen länger als `maxIdleMs` niemand verbunden war
   * Gibt die Räume zurück, die sich geändert haben (zum Senden des neuen Stands).
   */
  cleanup(maxIdleMs: number, now = Date.now()): Room[] {
    const changed: Room[] = [];
    for (const [code, room] of this.rooms) {
      if (!room.game) {
        const ghosts = room.players.filter((p) => !p.socketId && p.awaySince && now - p.awaySince > AWAY_KICK_MS);
        for (const g of ghosts) this.removePlayer(room, g);
        if (ghosts.length) changed.push(room);
      }
      if (room.players.length === 0 || (room.emptySince && now - room.emptySince > maxIdleMs)) {
        if (isRunning(room)) this.events.gameEnded?.(room, 'aborted', null);
        this.clearTimer(room);
        this.rooms.delete(code);
      }
    }
    return changed.filter((r) => this.rooms.has(r.code));
  }

  /**
   * Zug-Timer (neu) starten. Läuft er ab, macht das Spiel die passive Variante
   * (siehe DurakGame.timeout) und `onTimeout` wird aufgerufen (Stand senden, neu starten).
   * In der Pause läuft kein Timer.
   */
  armTimer(room: Room, onTimeout: () => void): void {
    const kind = isRunning(room) && room.game!.inThrowIn() ? 'throwIn' : 'turn';
    // Der Nachlege-Countdown läuft durch – Nachlegen oder „Fertig“ setzen ihn nicht zurück
    if (kind === 'throwIn' && room.timerKind === 'throwIn' && room.timer && !this.isPaused(room)) return;
    this.clearTimer(room);
    if (!isRunning(room) || this.isPaused(room)) return;
    const ms = kind === 'throwIn' ? THROW_IN_MS : room.settings.turnSeconds * 1000;
    room.timerKind = kind;
    room.deadline = Date.now() + ms;
    room.timer = setTimeout(() => {
      room.timer = null;
      room.deadline = null;
      if (!isRunning(room) || this.isPaused(room)) return;
      room.game!.timeout();
      this.recordResult(room);
      onTimeout();
    }, ms);
  }

  clearTimer(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = null;
  }

  private markIfEmpty(room: Room): void {
    if (room.players.every((p) => !p.socketId)) room.emptySince ??= Date.now();
  }
}

export function viewFor(room: Room, playerId: string, now = Date.now()): GameView {
  const g = room.game;
  const handOf = (id: string) => g?.players.find((p) => p.id === id)?.hand ?? [];
  return {
    roomCode: room.code,
    phase: !g ? 'lobby' : g.finished ? 'finished' : 'playing',
    hostId: room.hostId,
    you: playerId,
    players: room.players.map((p) => {
      const gp = g?.players.find((x) => x.id === p.id);
      return {
        id: p.id,
        name: p.name,
        cardCount: handOf(p.id).length,
        connected: p.socketId !== null,
        out: !!g && !!gp && g.isOut(gp),
        color: p.color,
        durakCount: p.durakCount,
        awayMs: !p.socketId && p.awaySince ? now - p.awaySince : null,
      };
    }),
    hand: [...handOf(playerId)].sort(
      (a, b) =>
        Number(a.suit === g?.trump) - Number(b.suit === g?.trump) || a.rank - b.rank || a.suit.localeCompare(b.suit),
    ),
    trumpSuit: g?.trump ?? null,
    trumpCard: g && g.deck.length > 0 ? g.trumpCard : null,
    deckCount: g?.deck.length ?? 0,
    discardCount: g?.discardCount ?? 0,
    table: g?.table ?? [],
    attackerId: g && !g.finished ? g.attacker.id : null,
    defenderId: g && !g.finished ? g.defender.id : null,
    taking: g?.taking ?? false,
    passed: g ? [...g.passed] : [],
    durakId: g?.durakId ?? null,
    timer:
      g && !g.finished && room.deadline
        ? {
            waitingOn: g.waitingOn(),
            remainingMs: Math.max(0, room.deadline - now),
            totalMs: room.timerKind === 'throwIn' ? THROW_IN_MS : room.settings.turnSeconds * 1000,
            kind: room.timerKind,
          }
        : null,
    lastDurakId: room.lastDurakId,
    dealerId: room.dealerId,
    round: room.round,
    paused: isRunning(room) && room.players.some((p) => !p.socketId),
    settings: { ...room.settings },
    throwers: g && !g.finished ? g.throwers().map((p) => p.id) : [],
  };
}

function newPlayer(name: string, color: number, socketId: string, ip: string): RoomPlayer {
  const clean = name.trim().slice(0, 20);
  if (!clean) throw new GameError('Bitte einen Namen eingeben');
  const validColor = Number.isInteger(color) && color >= 0 && color < AVATAR_COLORS.length ? color : 0;
  return {
    id: randomUUID(),
    name: clean,
    token: randomUUID(),
    socketId,
    awaySince: null,
    color: validColor,
    durakCount: 0,
    ip,
  };
}

function sessionOf(room: Room, p: RoomPlayer): Session {
  return { roomCode: room.code, playerId: p.id, token: p.token };
}
