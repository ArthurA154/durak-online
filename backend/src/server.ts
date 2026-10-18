import { createServer, type IncomingMessage } from 'node:http';
import { AVATAR_COLORS } from '@durak/shared';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, Result, ServerToClientEvents } from '@durak/shared';
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
      durak,
      outcome,
    }),
});

// Schutz gegen Missbrauch: Verbindungen und neue Räume pro IP begrenzen
const connections = new ConnectionCounter(20);
const createLimit = new RateLimiter(10, 60_000);
const joinLimit = new RateLimiter(30, 60_000);

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

function broadcast(room: Room): void {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit('state', viewFor(room, p.id));
  }
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
  const { roomCode, playerId } = socket.data;
  const room = roomCode ? rooms.get(roomCode) : undefined;
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

io.on('connection', (socket: IoSocket) => {
  const ip = socket.data.ip ?? '';
  if (notice && notice.until > Date.now()) socket.emit('notice', { text: notice.text });

  const enter = (room: Room, playerId: string) => {
    // Gleicher Raum, gleicher Spieler (z. B. doppeltes Wiederverbinden) → nicht „verlassen“!
    const same = socket.data.roomCode === room.code && socket.data.playerId === playerId;
    if (!same) leaveCurrent(socket);
    socket.data.roomCode = room.code;
    socket.data.playerId = playerId;
    // Pause vorbei? Dann läuft der Zug-Timer mit frischer Zeit weiter
    if (!room.timer) armTimer(room);
    broadcast(room);
  };

  socket.on('room:create', ({ name, color }, ack) => {
    if (typeof ack !== 'function') return;
    if (!createLimit.take(ip)) {
      stats.limited();
      return ack({ ok: false, error: 'Zu viele neue Räume – warte kurz' });
    }
    try {
      const { room, session } = rooms.create(String(name ?? ''), Number(color), socket.id);
      ack({ ok: true, ...session });
      enter(room, session.playerId);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:join', ({ roomCode, name, color }, ack) => {
    if (typeof ack !== 'function') return;
    if (!joinLimit.take(ip)) {
      stats.limited();
      return ack({ ok: false, error: 'Zu viele Versuche – warte kurz' });
    }
    try {
      const { room, session } = rooms.join(String(roomCode ?? ''), String(name ?? ''), Number(color), socket.id);
      ack({ ok: true, ...session });
      enter(room, session.playerId);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:rejoin', ({ roomCode, token }, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const { room, session } = rooms.rejoin(String(roomCode ?? ''), String(token ?? ''), socket.id);
      ack({ ok: true, ...session });
      enter(room, session.playerId);
    } catch (err) {
      ack(fail(err));
    }
  });

  socket.on('room:leave', () => leaveCurrent(socket));

  socket.on('game:start', (ack) => inRoom(socket, ack, (room, id) => rooms.start(room, id)));
  socket.on('game:attack', ({ card }, ack) =>
    inRoom(socket, ack, (room, id) => requireGame(room).attack(id, card)),
  );
  socket.on('game:defend', ({ attackIndex, card }, ack) =>
    inRoom(socket, ack, (room, id) => requireGame(room).defend(id, attackIndex, card)),
  );
  socket.on('game:transfer', ({ card }, ack) =>
    inRoom(socket, ack, (room, id) => requireGame(room).transfer(id, card)),
  );
  socket.on('game:take', (ack) => inRoom(socket, ack, (room, id) => requireGame(room).take(id)));
  socket.on('game:pass', (ack) => inRoom(socket, ack, (room, id) => requireGame(room).pass(id)));
  socket.on('game:kick', ({ playerId: target }, ack) =>
    inRoom(socket, ack, (room, id) => rooms.kick(room, id, String(target ?? ''))),
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
  const { online, games } = liveCounts();
  stats.observe(online, games);
}, 10_000).unref();
setInterval(() => stats.save(), 30_000).unref();

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
        phase: !r.game ? 'lobby' : r.game.finished ? 'finished' : 'playing',
        paused: rooms.isPaused(r),
        round: r.round,
        createdAt: r.createdAt,
        gameStartedAt: r.game && !r.game.finished ? r.gameStartedAt : null,
        deckCount: r.game?.deck.length ?? null,
        players: r.players.map((p) => ({
          name: p.name,
          color: AVATAR_COLORS[p.color] ?? AVATAR_COLORS[0],
          connected: !!p.socketId,
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
