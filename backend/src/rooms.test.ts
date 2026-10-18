import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_KICK_MS, THROW_IN_MS, TURN_MS, TURN_WARN_MS, type Card } from '@durak/shared';
import { RoomManager, cleanChat, viewFor } from './rooms.js';
import { CHAT_KEEP, CHAT_MAX } from '@durak/shared';

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

  /** Anna greift mit 7♠ an, Ben hat 9♠ (schlägt) und 7♥ (zum Nachlegen bei Anna) */
  function bout() {
    const { rooms, room } = startedRoom();
    const g = room.game!;
    const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
    g.attackerIdx = 0;
    g.defenderIdx = 1;
    g.players[0].hand = [c(7, 'S'), c(7, 'H'), c(14, 'D')];
    g.players[1].hand = [c(9, 'S'), c(6, 'D'), c(12, 'C')];
    g.attack(g.players[0].id, c(7, 'S'));
    rooms.armTimer(room, () => {});
    return { rooms, room, g, c, anna: g.players[0].id, ben: g.players[1].id };
  }

  it('nach dem Schlucken: 4-Sekunden-Countdown, dann nimmt der Verteidiger', () => {
    const { rooms, room, g, ben } = bout();
    g.take(ben);
    rooms.armTimer(room, () => {});
    expect(viewFor(room, ben).timer).toMatchObject({ kind: 'throwIn', totalMs: THROW_IN_MS });
    vi.advanceTimersByTime(THROW_IN_MS);
    expect(g.table).toEqual([]);
    expect(g.players[1].hand.length).toBeGreaterThanOrEqual(4);
  });

  it('Nachlegen setzt den Countdown nicht zurück', () => {
    const { rooms, room, g, c, anna, ben } = bout();
    g.take(ben);
    rooms.armTimer(room, () => {});
    vi.advanceTimersByTime(THROW_IN_MS - 1000);
    g.attack(anna, c(7, 'H'));
    rooms.armTimer(room, () => {});
    expect(viewFor(room, ben).timer?.remainingMs).toBe(1000);
    vi.advanceTimersByTime(1000);
    expect(g.table).toEqual([]);
  });

  it('alles geschlagen: auch nur 4 Sekunden, dann Bito', () => {
    const { rooms, room, g, c, ben } = bout();
    g.defend(ben, 0, c(9, 'S'));
    rooms.armTimer(room, () => {});
    expect(viewFor(room, ben).timer?.kind).toBe('throwIn');
    vi.advanceTimersByTime(THROW_IN_MS);
    expect(g.table).toEqual([]);
    expect(g.discardCount).toBe(2);
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


describe('Chat und Werfen', () => {
  function room2() {
    const rooms = new RoomManager();
    const { room, session: a } = rooms.create('Anna', 0, 's1');
    const { session: b } = rooms.join(room.code, 'Ben', 1, 's2');
    return { rooms, room, a: a.playerId, b: b.playerId };
  }

  it('Text wird gesäubert und gekürzt', () => {
    expect(cleanChat('  hallo\n\n  du\u0000 ')).toBe('hallo du');
    expect(cleanChat('x'.repeat(500))).toHaveLength(CHAT_MAX);
    expect(cleanChat(undefined)).toBe('');
  });

  it('Nachricht mit Name und Farbe, leere wird abgelehnt', () => {
    const { rooms, room, a } = room2();
    const msg = rooms.chat(room, a, ' GG ');
    expect(msg).toMatchObject({ from: a, name: 'Anna', color: 0, text: 'GG' });
    expect(() => rooms.chat(room, a, '   ')).toThrow('Leere Nachricht');
    expect(() => rooms.chat(room, 'fremd', 'hi')).toThrow();
  });

  it('Raum merkt sich nur die letzten Nachrichten', () => {
    const { rooms, room, a } = room2();
    for (let i = 0; i < CHAT_KEEP + 5; i++) rooms.chat(room, a, `n${i}`);
    expect(room.chat).toHaveLength(CHAT_KEEP);
    expect(room.chat[0].text).toBe('n5');
  });

  it('Werfen nur auf Mitspieler und nur erlaubte Sachen', () => {
    const { rooms, room, a, b } = room2();
    expect(rooms.throwAt(room, a, b, 'tomato')).toMatchObject({ from: a, to: b, item: 'tomato' });
    expect(() => rooms.throwAt(room, a, a, 'fish')).toThrow('Nicht auf dich selbst');
    expect(() => rooms.throwAt(room, a, b, 'brick')).toThrow();
    expect(() => rooms.throwAt(room, a, 'niemand', 'egg')).toThrow();
  });
});

describe('Öffentliche Räume und Einstellungen', () => {
  it('nur öffentliche, wartende, nicht volle Räume stehen in der Liste', () => {
    const rooms = new RoomManager();
    const pub = rooms.create('Anna', 0, 's1', true).room;
    rooms.create('Privat', 1, 's2');
    expect(rooms.openLobbies()).toEqual([{ code: pub.code, host: 'Anna', color: 0, players: 1, neighborsOnly: false, unlimited: false }]);
    const b = rooms.join(pub.code, 'Ben', 1, 's3').session;
    rooms.start(pub, pub.hostId);
    expect(rooms.openLobbies()).toEqual([]); // läuft → nicht mehr sichtbar
    expect(b.playerId).toBeTruthy();
  });

  it('nur der Gastgeber ändert Einstellungen, nicht während der Partie', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    const b = rooms.join(room.code, 'Ben', 1, 's2').session;
    expect(() => rooms.updateSettings(room, b.playerId, { public: true })).toThrow('Nur der Gastgeber');
    rooms.updateSettings(room, session.playerId, { public: true, neighborsOnly: true, unlimited: true });
    expect(room.settings).toEqual({ public: true, neighborsOnly: true, unlimited: true });
    rooms.start(room, session.playerId);
    expect(room.game!.neighborsOnly).toBe(true);
    expect(room.game!.maxTable).toBe(Infinity);
    expect(() => rooms.updateSettings(room, session.playerId, { public: false })).toThrow('Erst nach der Partie');
  });

  it('Gastgeber wirft jemanden aus der Lobby', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    const b = rooms.join(room.code, 'Ben', 1, 's2').session;
    expect(() => rooms.kickFromLobby(room, b.playerId, session.playerId)).toThrow('Nur der Gastgeber');
    expect(rooms.kickFromLobby(room, session.playerId, b.playerId)).toBe('s2');
    expect(room.players.map((p) => p.name)).toEqual(['Anna']);
  });

  it('Rausgeworfene kommen nicht wieder in denselben Raum', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1', true, '1.1.1.1');
    const b = rooms.join(room.code, 'Troll', 1, 's2', '6.6.6.6').session;
    rooms.kickFromLobby(room, session.playerId, b.playerId);
    expect(() => rooms.join(room.code, 'Troll2', 1, 's3', '6.6.6.6')).toThrow('entfernt');
    expect(rooms.join(room.code, 'Ben', 2, 's4', '2.2.2.2').room).toBe(room);
  });

  it('öffentlich: nur Schnellsprüche im Chat', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1', true);
    expect(rooms.chat(room, session.playerId, 'GG').text).toBe('GG');
    expect(() => rooms.chat(room, session.playerId, 'hallo')).toThrow('Schnellsprüche');
  });
});
