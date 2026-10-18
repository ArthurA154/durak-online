import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RoomManager, type GameOutcome } from './rooms.js';
import { Stats } from './stats.js';

const NOON = Date.parse('2026-10-18T10:00:00Z'); // 12:00 in Zürich

describe('Stats', () => {
  it('zählt Besucher pro Tag nur einmal, neuer Tag fängt neu an', () => {
    let now = NOON;
    const s = new Stats(undefined, () => now);
    s.connection('1.1.1.1');
    s.connection('1.1.1.1');
    s.connection('2.2.2.2');
    expect(s.lastDays(1)[0]).toMatchObject({ date: '2026-10-18', visitors: 2, connections: 3 });
    now += 86_400_000;
    s.connection('1.1.1.1');
    expect(s.lastDays(2).map((d) => d.visitors)).toEqual([2, 1]);
  });

  it('Tage nach Schweizer Zeit, fehlende Tage mit Nullen', () => {
    const s = new Stats(undefined, () => Date.parse('2026-10-18T22:30:00Z')); // 00:30 am 19.10.
    s.roomCreated();
    const days = s.lastDays(3);
    expect(days.map((d) => d.date)).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    expect(days.map((d) => d.roomsCreated)).toEqual([0, 0, 1]);
  });

  it('Spiele: fertig, unentschieden, abgebrochen', () => {
    const s = new Stats(undefined, () => NOON);
    const rec = (outcome: GameOutcome) => ({ at: NOON, durationMs: 60_000, players: ['A', 'B'], durak: null, outcome });
    s.gameStarted(2);
    s.gameEnded(rec('durak'));
    s.gameEnded(rec('draw'));
    s.gameEnded(rec('aborted'));
    expect(s.lastDays(1)[0]).toMatchObject({ gamesStarted: 1, gamesFinished: 2, draws: 1, aborted: 1, playMs: 120_000 });
    expect(s.recentGames().map((g) => g.outcome)).toEqual(['aborted', 'draw', 'durak']);
  });

  it('speichert und lädt, ohne IP-Adressen', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'durak-stats-')), 'stats.json');
    const a = new Stats(file, () => NOON);
    a.connection('9.8.7.6');
    a.gameStarted(3);
    a.save();
    expect(readFileSync(file, 'utf8')).not.toContain('9.8.7.6');
    const b = new Stats(file, () => NOON);
    b.connection('9.8.7.6'); // gleicher Besucher am gleichen Tag → nicht doppelt
    expect(b.lastDays(1)[0]).toMatchObject({ visitors: 1, connections: 2, gamesStarted: 1, players: 3 });
  });
});

describe('RoomManager meldet Spiele', () => {
  it('Start und Ende (abgebrochen, wenn alle anderen gehen)', () => {
    const events: string[] = [];
    const rooms = new RoomManager({
      roomCreated: () => events.push('created'),
      gameStarted: () => events.push('started'),
      gameEnded: (_r, outcome) => events.push(outcome),
    });
    const { room, session } = rooms.create('Anna', 0, 's1');
    const b = rooms.join(room.code, 'Ben', 1, 's2').session;
    rooms.start(room, session.playerId);
    expect(room.gamePlayers).toEqual(['Anna', 'Ben']);
    rooms.leave(room, b.playerId, 's2');
    expect(events).toEqual(['created', 'started', 'aborted']);
  });
});
