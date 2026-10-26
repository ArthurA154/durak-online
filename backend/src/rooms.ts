import { randomBytes, randomUUID } from 'node:crypto';
import {
  AVATAR_COLORS,
  cleanLook,
  type Look,
  AWAY_KICK_MS,
  CHAT_KEEP,
  CHAT_MAX,
  QUICK,
  quickIdOf,
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
  LOOK_EYES,
  LOOK_HATS,
  LOOK_MOUTHS,
  dealDurationMs,
  drawDurationMs,
} from '@durak/shared';
import { DurakGame, GameError } from './game/durak.js';
import { applyBotMove, botMove } from './game/bot.js';

export interface RoomPlayer {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  /** Seit wann getrennt (für Pause / Entfernen) */
  awaySince: number | null;
  color: number;
  look: Look;
  durakCount: number;
  /** Adresse – nur im Speicher, damit Rausgeworfene nicht gleich wieder reinkommen */
  ip: string;
  /** Vom Server gespielt – gilt immer als verbunden */
  bot?: boolean;
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
  /** Nächster Zug eines Bots (kurze Denkpause) */
  botTimer: ReturnType<typeof setTimeout> | null;
  /** Bis dann werden noch Karten ausgeteilt/nachgezogen (Animation im Browser) – keine Züge */
  holdUntil: number;
  /** Welches Nachziehen schon berücksichtigt ist (DurakGame.drawRound) */
  seenDraws: number;
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
  /** Wie viele Bots in der aktuellen Partie mitspielen (für die Statistik) */
  gameBots: number;
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
/** Namen für Bots – zufällig, im Raum nie doppelt */
const BOT_NAMES = [
  'Iwan',
  'Olga',
  'Pjotr',
  'Sweta',
  'Mischa',
  'Dascha',
  'Boris',
  'Katja',
  'Sascha',
  'Nadja',
  'Kolja',
  'Lena',
  'Wowa',
  'Galja',
  'Fedja',
  'Mascha',
  'Tolik',
  'Ljuba',
].map((n) => `🤖 ${n}`);
/** Schnurrbart bekommen Bots nicht */
const BOT_MOUTHS = LOOK_MOUTHS.map((_, i) => i).filter((i) => LOOK_MOUTHS[i] !== 'handlebar');
/** Denkpause eines Bots vor seinem Zug – länger als jede Karten-Animation, wirkt wie ein Mensch */
const BOT_DELAY_MS = [1300, 2200] as const;

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
const isHuman = (p: RoomPlayer) => !p.bot;
/** Verbunden – Bots sind es immer */
const present = (p: RoomPlayer) => !!p.bot || p.socketId !== null;
const randomInt = (n: number) => Math.floor(Math.random() * n);
/** Zufälliges Element – aus `free`, solange es dort etwas gibt, sonst aus allen */
const pick = <T>(all: T[], free: T[]): T => {
  const from = free.length ? free : all;
  return from[randomInt(from.length)];
};

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

  create(
    name: string,
    color: number,
    socketId: string,
    isPublic = false,
    ip = '',
    look?: unknown,
  ): { room: Room; session: Session } {
    let code: string;
    do {
      code = Array.from(randomBytes(5), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    } while (this.rooms.has(code));

    const player = newPlayer(name, color, socketId, ip, look);
    const room: Room = {
      code,
      hostId: player.id,
      players: [player],
      game: null,
      emptySince: null,
      deadline: null,
      timer: null,
      timerKind: 'turn',
      botTimer: null,
      holdUntil: 0,
      seenDraws: 0,
      lastDurakId: null,
      dealerId: null,
      round: 0,
      resultRecorded: false,
      createdAt: Date.now(),
      gameStartedAt: null,
      gamePlayers: [],
      gameBots: 0,
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

  join(
    code: string,
    name: string,
    color: number,
    socketId: string,
    ip = '',
    look?: unknown,
  ): { room: Room; session: Session } {
    const room = this.get(code);
    if (!room) throw new GameError('Raum nicht gefunden');
    if (ip && room.banned.has(ip)) throw new GameError('Der Gastgeber hat dich aus diesem Raum entfernt');
    if (isRunning(room)) throw new GameError('Das Spiel läuft bereits');
    if (room.players.length >= MAX_PLAYERS) {
      // Bots halten nur Plätze warm: ein Mensch bekommt den Platz des zuletzt hinzugefügten Bots
      const bot = [...room.players].reverse().find((p) => p.bot);
      if (!bot) throw new GameError('Der Raum ist voll');
      room.players = room.players.filter((p) => p !== bot);
      room.game = null;
    }

    const player = newPlayer(name, color, socketId, ip, look);
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

  /**
   * Chat-Nachricht eines Spielers im Raum: freier Text oder ein Schnellspruch (`{ quick: 'lucky' }`).
   * Ein Schnellspruch wird als Kennung verschickt – jeder liest ihn in seiner Sprache.
   */
  chat(room: Room, playerId: string, raw: unknown, now = Date.now()): ChatMessage {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) throw new GameError('Du bist nicht in diesem Raum');
    const input = (raw && typeof raw === 'object' ? raw : { text: raw }) as { text?: unknown; quick?: unknown };
    const text = cleanChat(input.text);
    // Kennung direkt, oder ein Text, der einem Spruch entspricht (ältere Browser schicken noch Text)
    const quick =
      typeof input.quick === 'string' && Object.hasOwn(QUICK, input.quick) ? input.quick : text && quickIdOf(text);
    if (room.settings.public && !quick) throw new GameError('In öffentlichen Räumen gehen nur Schnellsprüche');
    if (!quick && !text) throw new GameError('Leere Nachricht');
    const msg: ChatMessage = {
      id: ++seq,
      from: p.id,
      name: p.name,
      color: p.color,
      text: quick ? QUICK[quick].de : text,
      ...(quick ? { quick } : {}),
      at: now,
    };
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

  /** Gastgeber setzt einen Bot auf einen freien Platz (nicht während einer Partie) */
  addBot(room: Room, byId: string): RoomPlayer {
    if (room.hostId !== byId) throw new GameError('Nur der Gastgeber kann Bots hinzufügen');
    if (isRunning(room)) throw new GameError('Erst nach der Partie');
    if (room.players.length >= MAX_PLAYERS) throw new GameError('Der Raum ist voll');
    const names = new Set(room.players.map((p) => p.name));
    const colors = new Set(room.players.map((p) => p.color));
    const allColors = AVATAR_COLORS.map((_, i) => i);
    const bot: RoomPlayer = {
      id: randomUUID(),
      name: pick(
        BOT_NAMES,
        BOT_NAMES.filter((n) => !names.has(n)),
      ),
      token: randomUUID(),
      socketId: null,
      awaySince: null,
      // Farbe, die im Raum noch niemand hat
      color: pick(
        allColors,
        allColors.filter((c) => !colors.has(c)),
      ),
      look: cleanLook({
        eyes: randomInt(LOOK_EYES.length),
        mouth: pick(BOT_MOUTHS, BOT_MOUTHS),
        hat: randomInt(LOOK_HATS.length),
      }),
      durakCount: 0,
      ip: '',
      bot: true,
    };
    room.players.push(bot);
    // altes Ergebnisbild passt nicht mehr zu den Spielern
    room.game = null;
    return bot;
  }

  /** Öffentliche Räume, die noch auf Spieler warten (keine laufenden oder fertigen Partien) */
  openLobbies(): OpenLobby[] {
    const list: OpenLobby[] = [];
    for (const room of this.rooms.values()) {
      const host = room.players.find((p) => p.id === room.hostId);
      if (!room.settings.public || room.game || !host?.socketId) continue;
      const bots = room.players.filter((p) => p.bot).length;
      if (room.players.length >= MAX_PLAYERS && bots === 0) continue;
      list.push({
        code: room.code,
        host: host.name,
        color: host.color,
        look: host.look,
        players: room.players.length,
        bots,
        neighborsOnly: room.settings.neighborsOnly,
        unlimited: room.settings.unlimited,
        transfer: room.settings.transfer,
      });
    }
    return list.slice(0, 50);
  }

  /** Mitten im Spiel ist jemand getrennt → keine Züge, Timer steht. */
  isPaused(room: Room): boolean {
    return isRunning(room) && room.players.some((p) => !present(p));
  }

  start(room: Room, playerId: string): void {
    if (room.hostId !== playerId) throw new GameError('Nur der Gastgeber kann starten');
    if (isRunning(room)) throw new GameError('Das Spiel läuft bereits');
    // Wer gerade nicht verbunden ist, spielt nicht mit
    room.players = room.players.filter(present);
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
    room.gameBots = room.players.filter((p) => p.bot).length;
    // Erst wenn alle ihre Karten haben, geht es los
    room.holdUntil = Date.now() + dealDurationMs(room.players.length);
    room.seenDraws = 0;
    this.events.gameStarted?.(room);
  }

  /** Wie lange noch ausgeteilt/nachgezogen wird (ms) – so lange zieht niemand */
  holdMs(room: Room, now = Date.now()): number {
    return isRunning(room) ? Math.max(0, room.holdUntil - now) : 0;
  }

  /**
   * Nach jedem Zug aufrufen: wurde nachgezogen, warten alle, bis die Karten angekommen sind;
   * eine beendete Partie wird genau einmal gezählt.
   */
  recordResult(room: Room): void {
    const g = room.game;
    if (g && g.drawRound !== room.seenDraws) {
      room.seenDraws = g.drawRound;
      if (!g.finished) room.holdUntil = Date.now() + drawDurationMs(g.lastDraws);
    }
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
    // Letzter Mensch weg → Bots spielen nicht allein weiter, der Raum wird aufgeräumt
    if (!room.players.some(isHuman)) {
      if (isRunning(room)) this.events.gameEnded?.(room, 'aborted', null);
      room.players = [];
      room.game = null;
      this.clearTimer(room);
      this.clearBotTimer(room);
      this.markIfEmpty(room);
      return;
    }
    if (room.lastDurakId === player.id) room.lastDurakId = null;
    if (room.hostId === player.id) room.hostId = room.players.find(isHuman)!.id;
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
        this.clearBotTimer(room);
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
    // Die Zugzeit beginnt erst, wenn alle Karten angekommen sind
    const ms = (kind === 'throwIn' ? THROW_IN_MS : room.settings.turnSeconds * 1000) + this.holdMs(room);
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

  /**
   * Ist ein Bot dran? Dann nach kurzer Denkpause seinen Zug machen und `after` aufrufen
   * (Stand senden – danach wird hier erneut geprüft). Immer nur ein Bot-Zug gleichzeitig.
   */
  scheduleBot(room: Room, after: () => void, delayMs?: number): void {
    if (room.botTimer || !isRunning(room) || this.isPaused(room)) return;
    const g = room.game!;
    const waiting = g.waitingOn();
    const bot = room.players.find((p) => p.bot && waiting.includes(p.id));
    if (!bot) return;
    const think = delayMs ?? BOT_DELAY_MS[0] + Math.random() * (BOT_DELAY_MS[1] - BOT_DELAY_MS[0]);
    const ms = this.holdMs(room) + think;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (room.game !== g || !isRunning(room) || this.isPaused(room)) return;
      const move = botMove(g, bot.id);
      if (!move) return after();
      try {
        applyBotMove(g, bot.id, move);
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
        // Sollte nicht passieren – dann eben schlucken bzw. fertig sein, damit es weitergeht
        try {
          if (bot.id === g.defender.id) g.take(bot.id);
          else g.pass(bot.id);
        } catch {
          /* der Zug-Timer regelt es */
        }
      }
      this.recordResult(room);
      after();
    }, ms);
  }

  clearBotTimer(room: Room): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    room.botTimer = null;
  }

  clearTimer(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = null;
  }

  private markIfEmpty(room: Room): void {
    if (room.players.filter(isHuman).every((p) => !p.socketId)) room.emptySince ??= Date.now();
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
        connected: present(p),
        out: !!g && !!gp && g.isOut(gp),
        color: p.color,
        look: p.look,
        durakCount: p.durakCount,
        awayMs: !p.socketId && p.awaySince ? now - p.awaySince : null,
        bot: !!p.bot,
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
    // Spiel vorbei: die letzten Tischkarten bleiben sichtbar (womit es ausging)
    table: g ? (g.finished ? g.finalTable : g.table) : [],
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
    paused: isRunning(room) && room.players.some((p) => !present(p)),
    settings: { ...room.settings },
    throwers: g && !g.finished ? g.throwers().map((p) => p.id) : [],
    holdMs: isRunning(room) ? Math.max(0, room.holdUntil - now) : 0,
  };
}

function newPlayer(name: string, color: number, socketId: string, ip: string, look?: unknown): RoomPlayer {
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
    look: cleanLook(look),
    durakCount: 0,
    ip,
  };
}

function sessionOf(room: Room, p: RoomPlayer): Session {
  return { roomCode: room.code, playerId: p.id, token: p.token };
}
