import { createServer, type IncomingMessage } from 'node:http';
import { AVATAR_COLORS } from '@durak/shared';
import { Server, type Socket } from 'socket.io';
import type { Card, ClientToServerEvents, Result, ServerToClientEvents } from '@durak/shared';
import { GameError } from './game/durak.js';
import { ConnectionCounter, RateLimiter } from './limits.js';
import { RoomManager, viewFor, type Room } from './rooms.js';
import { createAdmin } from './admin.js';
import { Stats } from './stats.js';
import { SystemMonitor } from './system.js';

const PORT = Number(process.env.PORT ?? 3002);
const CORS_ORIGIN = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** Hinter Caddy: echte Client-IP steht in X-Forwarded-For */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const ROOM_IDLE_MS = 30 * 60 * 1000;
const DATA_DIR = process.env.DATA_DIR ?? 'data';
const LOBBY_WATCHERS = 'lobby-watchers';
const STARTED_AT = Date.now();

interface SocketData {
  roomCode?: string;
  playerId?: string;
  ip?: string;
}
type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const http = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  admin(req, res)
    .then((handled) => {
      if (!handled) res.writeHead(404).end();
    })
    .catch((err) => {
      stats.error(String(err?.stack ?? err));
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});

const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(http, {
  cors: { origin: CORS_ORIGIN },
  maxHttpBufferSize: 10_000, // Nachrichten sind winzig – große Pakete gar nicht erst annehmen
});
const stats = new Stats(`${DATA_DIR}/stats.json`);
const rooms = new RoomManager({
  roomCreated: () => stats.roomCreated(),
  gameStarted: (room) => stats.gameStarted(room.players.length),
  gameEnded: (room, outcome, durak) =>
    stats.gameEnded({
      at: Date.now(),
      durationMs: room.gameStartedAt ? Date.now() - room.gameStartedAt : 0,
      players: room.gamePlayers,
      bots: room.gameBots,
      durak,
      outcome,
    }),
});

// Schutz gegen Missbrauch: Verbindungen und neue Räume pro IP begrenzen
const connections = new ConnectionCounter(20);
const createLimit = new RateLimiter(10, 60_000);
const joinLimit = new RateLimiter(30, 60_000);
// pro Spieler: Chat höchstens 5 Nachrichten in 10 s, Werfen höchstens 1× in 2,5 s
const chatLimit = new RateLimiter(5, 10_000);
const throwLimit = new RateLimiter(1, 2_500);
// pro Verbindung: alle Nachrichten zusammen (normales Spielen bleibt weit darunter)
const actionLimit = new RateLimiter(40, 10_000);

function clientIp(socket: IoSocket): string {
  return ipFrom(socket.handshake.headers['x-forwarded-for'], socket.handshake.address);
}

function ipFrom(xff: string | string[] | undefined, address: string | undefined): string {
  if (TRUST_PROXY) {
    const first = (Array.isArray(xff) ? xff[0] : xff)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return address ?? '';
}

const httpIp = (req: IncomingMessage) => ipFrom(req.headers['x-forwarded-for'], req.socket.remoteAddress);

io.use((socket, next) => {
  const ip = clientIp(socket);
  if (!connections.open(ip)) {
    stats.limited();
    return next(new Error('Zu viele Verbindungen von deiner Adresse'));
  }
  stats.connection(ip);
  socket.data.ip = ip;
  socket.on('disconnect', () => connections.close(ip));
  next();
});

/** Ereignis an alle verbundenen Spieler im Raum */
function toRoom<E extends 'chat' | 'throw'>(room: Room, event: E, ...args: Parameters<ServerToClientEvents[E]>): void {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit(event, ...args);
  }
}

function broadcast(room: Room): void {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('state', viewFor(room, p.id));
  }
  // Ist ein Bot dran, zieht er nach kurzer Denkpause – danach wieder senden
  rooms.scheduleBot(room, () => {
    armTimer(room);
    broadcast(room);
  });
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof GameError) return { ok: false, error: err.message };
  console.error(err);
  stats.error(String((err as Error)?.stack ?? err));
  return { ok: false, error: 'Interner Fehler' };
}

/** Führt eine Aktion im aktuellen Raum aus, meldet Fehler per ack und sendet den neuen Stand. */
function inRoom(socket: IoSocket, ack: (r: Result) => void, action: (room: Room, playerId: string) => void) {
  if (typeof ack !== 'function') return;
  const room = currentRoom(socket);
  const playerId = socket.data.playerId;
  if (!room || !playerId) return ack({ ok: false, error: 'Du bist in keinem Raum' });
  try {
    action(room, playerId);
    rooms.recordResult(room);
    ack({ ok: true });
    armTimer(room);
    broadcast(room);
  } catch (err) {
    ack(fail(err));
  }
}

/** Raum dieser Verbindung – aber nur, wenn sie noch die aktuelle des Spielers ist (nicht ein alter Tab) */
function currentRoom(socket: IoSocket): Room | undefined {
  const { roomCode, playerId } = socket.data;
  const room = roomCode ? rooms.get(roomCode) : undefined;
  const player = room?.players.find((p) => p.id === playerId);
  return player?.socketId === socket.id ? room : undefined;
}

/** Karte vom Client nur als { rank, suit } übernehmen – Unsinn scheitert dann an den Spielregeln */
function cardOf(raw: unknown): Card {
  const c = (raw ?? {}) as Partial<Card>;
  return { rank: Number(c.rank), suit: String(c.suit) } as Card;
}

/** Nachrichten vom Client: Objekt oder leeres Objekt (nie null/Zahl/…) */
const obj = (p: unknown): Record<string, unknown> => (p && typeof p === 'object' ? (p as Record<string, unknown>) : {});

io.on('connection', (socket: IoSocket) => {
  const ip = socket.data.ip ?? '';
  if (notice && notice.until > Date.now()) socket.emit('notice', { text: notice.text });

  // Zu viele Nachrichten von dieser Verbindung → ablehnen, ohne sie zu verarbeiten
  socket.use((packet, next) => {
    if (actionLimit.take(socket.id)) return next();
    stats.limited();
    const ack = packet[packet.length - 1];
    if (typeof ack === 'function') ack({ ok: false, error: 'Nicht so schnell!' });
  });

  /** Wie socket.on, aber ein Fehler im Handler (kaputte Nachricht) beendet nie den Server */
  const on = <E extends keyof ClientToServerEvents>(event: E, handler: (...args: unknown[]) => void) =>
    socket.on(event, ((...args: unknown[]) => {
      try {
        handler(...args);
      } catch (err) {
        const ack = args[args.length - 1];
        const res = fail(err);
        if (typeof ack === 'function') ack(res);
      }
    }) as never);

  const enter = (room: Room, playerId: string) => {
    // Gleicher Raum, gleicher Spieler (z. B. doppeltes Wiederverbinden) → nicht „verlassen“!
    const same = socket.data.roomCode === room.code && socket.data.playerId === playerId;
    if (!same) leaveCurrent(socket);
    socket.data.roomCode = room.code;
    socket.data.playerId = playerId;
    // Pause vorbei? Dann läuft der Zug-Timer mit frischer Zeit weiter
    if (!room.timer) armTimer(room);
    socket.emit('chat:history', room.chat);
    broadcast(room);
  };

  on('room:create', (raw, ack) => {
    const p = obj(raw);
    if (typeof ack !== 'function') return;
    if (!createLimit.take(ip)) {
      stats.limited();
      return ack({ ok: false, error: 'Zu viele neue Räume – warte kurz' });
    }
    try {
      const { room, session } = rooms.create(
        String(p.name ?? ''),
        Number(p.color),
        socket.id,
        p.public === true,
        ip,
        p.look,
      );
      ack({ ok: true, ...session });
      enter(room, session.playerId);
    } catch (err) {
      ack(fail(err));
    }
  });

  on('room:join', (raw, ack) => {
    const p = obj(raw);
    if (typeof ack !== 'function') return;
    if (!joinLimit.take(ip)) {
      stats.limited();
      return ack({ ok: false, error: 'Zu viele Versuche – warte kurz' });
    }
    try {
      const { room, session } = rooms.join(
        String(p.roomCode ?? ''),
        String(p.name ?? ''),
        Number(p.color),
        socket.id,
        ip,
        p.look,
      );
      ack({ ok: true, ...session });
      enter(room, session.playerId);
    } catch (err) {
      ack(fail(err));
    }
  });

  on('room:rejoin', (raw, ack) => {
    const p = obj(raw);
    if (typeof ack !== 'function') return;
    if (!joinLimit.take(ip)) {
      stats.limited();
      return ack({ ok: false, error: 'Zu viele Versuche – warte kurz' });
    }
    try {
      const { room, session, previousSocketId } = rooms.rejoin(
        String(p.roomCode ?? ''),
        String(p.token ?? ''),
        socket.id,
      );
      // Die alte Verbindung (z. B. anderer Tab) verliert ihren Platz
      const old =
        previousSocketId && previousSocketId !== socket.id ? io.sockets.sockets.get(previousSocketId) : undefined;
      if (old) {
        old.data.roomCode = undefined;
        old.data.playerId = undefined;
      }
      ack({ ok: true, ...session });
      enter(room, session.playerId);
    } catch (err) {
      ack(fail(err));
    }
  });

  on('room:leave', () => leaveCurrent(socket));

  on('room:settings', (raw, ack) =>
    inRoom(socket, ack as (r: Result) => void, (room, id) => rooms.updateSettings(room, id, obj(raw))),
  );
  on('room:addBot', (ack) => inRoom(socket, ack as (r: Result) => void, (room, id) => void rooms.addBot(room, id)));
  on('room:kick', (raw, ack) =>
    inRoom(socket, ack as (r: Result) => void, (room, id) => {
      const kickedSocket = rooms.kickFromLobby(room, id, String(obj(raw).playerId ?? ''));
      const s = kickedSocket ? io.sockets.sockets.get(kickedSocket) : undefined;
      if (s) {
        s.data.roomCode = undefined;
        s.data.playerId = undefined;
        s.emit('kicked');
      }
    }),
  );

  // Startseite: Liste offener Spiele
  on('lobbies:watch', () => {
    void socket.join(LOBBY_WATCHERS);
    socket.emit('lobbies', rooms.openLobbies());
  });
  on('lobbies:unwatch', () => void socket.leave(LOBBY_WATCHERS));

  /** Spielzug: ack ist immer das letzte Argument */
  const move = (ack: unknown, action: (room: Room, id: string) => void) =>
    inRoom(socket, ack as (r: Result) => void, action);

  on('game:start', (ack) => move(ack, (room, id) => rooms.start(room, id)));
  on('game:attack', (raw, ack) => move(ack, (room, id) => requireGame(room).attack(id, cardOf(obj(raw).card))));
  on('game:defend', (raw, ack) =>
    move(ack, (room, id) => {
      const p = obj(raw);
      requireGame(room).defend(id, Number(p.attackIndex), cardOf(p.card));
    }),
  );
  on('game:transfer', (raw, ack) => move(ack, (room, id) => requireGame(room).transfer(id, cardOf(obj(raw).card))));
  on('game:take', (ack) => move(ack, (room, id) => requireGame(room).take(id)));
  on('game:pass', (ack) => move(ack, (room, id) => requireGame(room).pass(id)));
  on('game:kick', (raw, ack) => move(ack, (room, id) => rooms.kick(room, id, String(obj(raw).playerId ?? ''))));

  /** Chat und Werfen: im aktuellen Raum, ohne den Spielstand neu zu senden */
  const social = (ack: unknown, limit: RateLimiter, action: (room: Room, playerId: string) => void) => {
    if (typeof ack !== 'function') return;
    const room = currentRoom(socket);
    const playerId = socket.data.playerId;
    if (!room || !playerId) return ack({ ok: false, error: 'Du bist in keinem Raum' });
    if (!limit.take(playerId)) {
      stats.limited();
      return ack({ ok: false, error: 'Nicht so schnell!' });
    }
    try {
      action(room, playerId);
      ack({ ok: true });
    } catch (err) {
      ack(fail(err));
    }
  };

  on('chat:send', (raw, ack) =>
    social(ack, chatLimit, (room, id) => {
      toRoom(room, 'chat', rooms.chat(room, id, obj(raw).text));
      stats.chat();
    }),
  );
  on('throw', (raw, ack) =>
    social(ack, throwLimit, (room, id) => {
      const p = obj(raw);
      toRoom(room, 'throw', rooms.throwAt(room, id, p.to, p.item));
      stats.thrown();
    }),
  );

  socket.on('disconnect', () => {
    const room = socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined;
    if (!room) return;
    rooms.disconnect(room, socket.id);
    broadcast(room);
  });

  /** Für Spielzüge: Spiel muss laufen und darf nicht pausiert sein. */
  function requireGame(room: Room) {
    if (!room.game) throw new GameError('Das Spiel wurde noch nicht gestartet');
    if (rooms.isPaused(room)) throw new GameError('Pause – warte, bis alle wieder da sind');
    if (rooms.holdMs(room) > 0) throw new GameError('Warte, bis die Karten verteilt sind');
    return room.game;
  }
});

function leaveCurrent(socket: IoSocket): void {
  const { roomCode, playerId } = socket.data;
  const room = roomCode ? rooms.get(roomCode) : undefined;
  socket.data.roomCode = undefined;
  socket.data.playerId = undefined;
  if (!room || !playerId) return;
  rooms.leave(room, playerId, socket.id);
  armTimer(room);
  broadcast(room);
}

/** Nach jedem Zug startet der Zug-Timer neu; läuft er ab, wird der Stand gesendet und neu gestartet. */
function armTimer(room: Room): void {
  rooms.armTimer(room, () => {
    armTimer(room);
    broadcast(room);
  });
}

// Aufräumen: Lobby-Geister entfernen, verlassene Räume löschen
setInterval(() => {
  for (const room of rooms.cleanup(ROOM_IDLE_MS)) broadcast(room);
  createLimit.prune();
  joinLimit.prune();
  chatLimit.prune();
  throwLimit.prune();
  actionLimit.prune();
  const { online, games } = liveCounts();
  stats.observe(online, games);
}, 10_000).unref();
setInterval(() => stats.save(), 30_000).unref();

// Liste offener Spiele an alle auf der Startseite – nur wenn sie sich geändert hat
let lastLobbies = '';
setInterval(() => {
  const list = rooms.openLobbies();
  const json = JSON.stringify(list);
  if (json === lastLobbies) return;
  lastLobbies = json;
  io.to(LOBBY_WATCHERS).emit('lobbies', list);
}, 1_500).unref();

// ---------- Admin-Seite ----------

/** Nachricht an alle – neue Verbindungen bekommen sie, solange sie gilt */
const NOTICE_MS = 15 * 60 * 1000;
let notice: { text: string; at: number; until: number } | null = null;

function liveCounts() {
  let games = 0;
  for (const r of rooms.all()) if (r.game && !r.game.finished) games++;
  return { online: io.engine.clientsCount, games };
}

const system = new SystemMonitor(liveCounts);

const admin = createAdmin({
  password: process.env.ADMIN_PASSWORD,
  secureCookie: TRUST_PROXY,
  ipOf: httpIp,
  api: {
    notice(text) {
      notice = text ? { text, at: Date.now(), until: Date.now() + NOTICE_MS } : null;
      io.emit('notice', text ? { text } : null);
    },
    state() {
      const now = Date.now();
      const list = [...rooms.all()].map((r) => ({
        code: r.code,
        public: r.settings.public,
        neighborsOnly: r.settings.neighborsOnly,
        phase: !r.game ? 'lobby' : r.game.finished ? 'finished' : 'playing',
        paused: rooms.isPaused(r),
        round: r.round,
        createdAt: r.createdAt,
        gameStartedAt: r.game && !r.game.finished ? r.gameStartedAt : null,
        deckCount: r.game?.deck.length ?? null,
        players: r.players.map((p) => ({
          name: p.name,
          color: AVATAR_COLORS[p.color] ?? AVATAR_COLORS[0],
          connected: !!p.socketId || !!p.bot,
          bot: !!p.bot,
          host: p.id === r.hostId,
          cards: r.game?.players.find((g) => g.id === p.id)?.hand.length ?? null,
          durakCount: p.durakCount,
        })),
      }));
      return {
        now,
        startedAt: STARTED_AT,
        live: {
          ...liveCounts(),
          players: list.reduce((n, r) => n + r.players.filter((p) => p.connected).length, 0),
          lobbies: list.filter((r) => r.phase === 'lobby').length,
          rooms: list,
        },
        system: system.snapshot(),
        history: system.samples,
        days: stats.lastDays(30),
        totals: stats.totals(),
        games: stats.recentGames(30),
        errors: stats.recentErrors(20),
        notice: notice && notice.until > now ? notice : null,
      };
    },
  },
});

http.listen(PORT, () => {
  console.log(`Durak-Backend läuft auf Port ${PORT} (CORS: ${CORS_ORIGIN.join(', ')})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    stats.save();
    io.close();
    process.exit(0);
  });
}
