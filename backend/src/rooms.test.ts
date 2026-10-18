import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_KICK_MS, TURN_MS, TURN_WARN_MS } from '@durak/shared';
import { RoomManager, viewFor } from './rooms.js';

describe('Zug-Timer im Raum', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function startedRoom() {
    const rooms = new RoomManager();
    const { room } = rooms.create('Anna', 0, 's1');
    rooms.join(room.code, 'Ben', 1, 's2');
    rooms.start(room, room.hostId);
    return { rooms, room };
  }

  it('nach 25 s passiert der passive Zug, vorher nichts', () => {
    const { rooms, room } = startedRoom();
    const fired = vi.fn();
    rooms.armTimer(room, fired);
    vi.advanceTimersByTime(TURN_MS - 1);
    expect(room.game!.table).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(room.game!.table).toHaveLength(1);
    expect(fired).toHaveBeenCalledOnce();
  });

  it('der Stand enthält die Restzeit und auf wen gewartet wird', () => {
    const { rooms, room } = startedRoom();
    rooms.armTimer(room, () => {});
    vi.advanceTimersByTime(TURN_MS - TURN_WARN_MS + 3000);
    const v = viewFor(room, room.hostId);
    expect(v.timer?.waitingOn).toEqual([room.game!.attacker.id]);
    expect(v.timer?.remainingMs).toBe(TURN_WARN_MS - 3000);
  });

  it('neu starten setzt die Zeit zurück', () => {
    const { rooms, room } = startedRoom();
    const fired = vi.fn();
    rooms.armTimer(room, fired);
    vi.advanceTimersByTime(TURN_MS - 1000);
    rooms.armTimer(room, fired);
    vi.advanceTimersByTime(TURN_MS - 1000);
    expect(fired).not.toHaveBeenCalled();
  });

  it('Raum verlassen in der Lobby / Aufräumen stoppt den Timer', () => {
    const { rooms, room } = startedRoom();
    const fired = vi.fn();
    rooms.armTimer(room, fired);
    rooms.clearTimer(room);
    vi.advanceTimersByTime(TURN_MS * 2);
    expect(fired).not.toHaveBeenCalled();
  });

  it('Durak wird gezählt, trägt danach die Kappe und fängt die nächste Partie an', () => {
    const { rooms, room } = startedRoom();
    const g = room.game!;
    for (let i = 0; i < 2000 && !g.finished; i++) g.timeout();
    rooms.recordResult(room);
    rooms.recordResult(room); // doppelt darf nicht doppelt zählen
    const durakId = g.durakId;
    const counts = room.players.map((p) => p.durakCount);
    if (durakId) {
      expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
      expect(room.lastDurakId).toBe(durakId);
      rooms.start(room, room.hostId);
      expect(room.game!.attacker.id).toBe(durakId);
      expect(room.dealerId).toBe(durakId);
      expect(viewFor(room, room.hostId).round).toBe(2);
    } else {
      expect(counts).toEqual([0, 0]);
    }
  });

  it('ungültige Farbe wird auf 0 gesetzt', () => {
    const rooms = new RoomManager();
    const { room } = rooms.create('Anna', 999, 's1');
    expect(room.players[0].color).toBe(0);
  });

  it('Verbindung weg im Spiel → Pause: kein Timer, Wiederkommen hebt sie auf', () => {
    const { rooms, room } = startedRoom();
    const fired = vi.fn();
    rooms.armTimer(room, fired);
    rooms.disconnect(room, 's2');
    expect(rooms.isPaused(room)).toBe(true);
    expect(viewFor(room, room.hostId).paused).toBe(true);
    rooms.armTimer(room, fired); // in der Pause startet kein Timer
    vi.advanceTimersByTime(TURN_MS * 3);
    expect(fired).not.toHaveBeenCalled();
    const ben = room.players[1];
    rooms.rejoin(room.code, ben.token, 's3');
    expect(rooms.isPaused(room)).toBe(false);
  });

  it('Entfernen erst nach 60 s Pause, dann geht es ohne den Spieler weiter', () => {
    const rooms = new RoomManager();
    const { room } = rooms.create('Anna', 0, 's1');
    rooms.join(room.code, 'Ben', 1, 's2');
    rooms.join(room.code, 'Cleo', 2, 's3');
    rooms.start(room, room.hostId);
    const [anna, ben] = room.players;
    rooms.disconnect(room, 's2');
    expect(() => rooms.kick(room, anna.id, ben.id)).toThrow('Sekunden warten');
    vi.advanceTimersByTime(AWAY_KICK_MS);
    rooms.kick(room, anna.id, ben.id);
    expect(room.players.map((p) => p.name)).toEqual(['Anna', 'Cleo']);
    expect(room.game!.players).toHaveLength(2);
    expect(room.game!.finished).toBe(false);
    expect(rooms.isPaused(room)).toBe(false);
    // Entfernter Spieler kommt nicht mehr rein
    expect(() => rooms.rejoin(room.code, ben.token, 's9')).toThrow('Sitzung abgelaufen');
  });

  it('bleibt nur einer übrig, endet die Partie unentschieden', () => {
    const { rooms, room } = startedRoom();
    rooms.disconnect(room, 's2');
    vi.advanceTimersByTime(AWAY_KICK_MS);
    rooms.kick(room, room.players[0].id, room.players[1].id);
    expect(room.game!.finished).toBe(true);
    expect(room.game!.durakId).toBeNull();
  });

  it('alte/doppelte Verbindung kann den Spieler nicht abmelden', () => {
    const { rooms, room } = startedRoom();
    const ben = room.players[1];
    rooms.rejoin(room.code, ben.token, 's-neu');
    rooms.leave(room, ben.id, 's2'); // alte Verbindung
    expect(room.players).toHaveLength(2);
    expect(ben.socketId).toBe('s-neu');
  });

  it('Lobby: Getrennte werden nach 60 s entfernt, Spielstart nimmt nur Verbundene', () => {
    const rooms = new RoomManager();
    const { room } = rooms.create('Anna', 0, 's1');
    rooms.join(room.code, 'Ben', 1, 's2');
    rooms.join(room.code, 'Cleo', 2, 's3');
    rooms.disconnect(room, 's3');
    rooms.start(room, room.hostId);
    expect(room.game!.players.map((p) => p.id)).toHaveLength(2);
    expect(room.players.map((p) => p.name)).toEqual(['Anna', 'Ben']);

    const lobby = rooms.create('Dima', 0, 's4').room;
    rooms.join(lobby.code, 'Emil', 1, 's5');
    rooms.disconnect(lobby, 's5');
    expect(rooms.cleanup(30 * 60_000, Date.now() + AWAY_KICK_MS - 1)).toEqual([]);
    expect(rooms.cleanup(30 * 60_000, Date.now() + AWAY_KICK_MS + 1)).toEqual([lobby]);
    expect(lobby.players.map((p) => p.name)).toEqual(['Dima']);
  });
});

