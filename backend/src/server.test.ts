import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';

// Echter Server als eigener Prozess: kaputte Nachrichten dürfen ihn nie beenden.
const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
let server: ChildProcess;
let exited = false;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'durak-srv-')) },
    stdio: 'ignore',
  });
  server.on('exit', () => (exited = true));
  for (let i = 0; i < 100; i++) {
    if (await healthy()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
}, 15_000);

afterAll(() => {
  for (const s of sockets) s.close();
  server.kill();
});

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${URL}/health`)).ok;
  } catch {
    return false;
  }
}

async function client(): Promise<Socket> {
  const s = connect(URL, { transports: ['websocket'], forceNew: true });
  sockets.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once('connect', resolve);
    s.once('connect_error', reject);
  });
  return s;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ask = (s: Socket, event: string, ...args: unknown[]): Promise<any> =>
  new Promise((resolve) => s.emit(event, ...args, resolve));

describe('Server', () => {
  it('überlebt kaputte Nachrichten an alle Ereignisse', async () => {
    const s = await client();
    const events = [
      'room:create',
      'room:join',
      'room:rejoin',
      'room:settings',
      'room:kick',
      'game:attack',
      'game:defend',
      'game:transfer',
      'game:kick',
      'chat:send',
      'throw',
    ];
    for (const e of events) {
      for (const bad of [null, 0, 'x', [], { card: null }]) s.emit(e, bad, () => {});
      s.emit(e, null); // ohne ack
    }
    for (const e of ['game:start', 'game:take', 'game:pass', 'room:leave', 'lobbies:watch']) s.emit(e, null, null);
    // Im Raum, mit laufendem Spiel: kaputte Karten
    const a = await client();
    const b = await client();
    const host = await ask(a, 'room:create', { name: 'A', color: 0 });
    await ask(b, 'room:join', { roomCode: host.roomCode, name: 'B', color: 1 });
    expect((await ask(a, 'game:start')).ok).toBe(true);
    for (const card of [null, 5, {}, { rank: 'x', suit: { toString: 1 } }]) {
      const r = await ask(a, 'game:attack', { card });
      expect(r.ok).toBe(false);
    }
    expect(await healthy()).toBe(true);
    expect(exited).toBe(false);
  });

  it('alte Verbindung verliert nach dem Wiederverbinden ihre Rechte', async () => {
    const a = await client();
    const host = await ask(a, 'room:create', { name: 'A', color: 0 });
    const a2 = await client();
    expect((await ask(a2, 'room:rejoin', { roomCode: host.roomCode, token: host.token })).ok).toBe(true);
    expect(await ask(a, 'chat:send', { text: 'hallo' })).toEqual({ ok: false, error: 'Du bist in keinem Raum' });
    expect((await ask(a2, 'chat:send', { text: 'hallo' })).ok).toBe(true);
  });

  it('bremst zu viele Nachrichten einer Verbindung', async () => {
    const s = await client();
    const results = await Promise.all(Array.from({ length: 50 }, () => ask(s, 'game:pass')));
    expect(results.filter((r) => r.error === 'Nicht so schnell!').length).toBeGreaterThan(0);
  });
});
