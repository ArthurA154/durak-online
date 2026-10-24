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
    room.holdUntil = 0; // Austeilen überspringen (eigener Test unten)
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

  it('gewählte Zugzeit gilt (z. B. 15 s)', () => {
    const rooms = new RoomManager();
    const { room } = rooms.create('Anna', 0, 's1');
    rooms.join(room.code, 'Ben', 1, 's2');
    rooms.updateSettings(room, room.hostId, { turnSeconds: 15 });
    rooms.start(room, room.hostId);
    room.holdUntil = 0;
    rooms.armTimer(room, () => {});
    expect(viewFor(room, room.hostId).timer).toMatchObject({ totalMs: 15_000 });
    vi.advanceTimersByTime(14_999);
    expect(room.game!.table).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(room.game!.table).toHaveLength(1);
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

  it('alles geschlagen: normaler Zug-Timer, kein Countdown', () => {
    const { rooms, room, g, c, ben } = bout();
    g.defend(ben, 0, c(9, 'S'));
    rooms.armTimer(room, () => {});
    expect(viewFor(room, ben).timer).toMatchObject({ kind: 'turn', totalMs: TURN_MS });
    vi.advanceTimersByTime(THROW_IN_MS);
    expect(g.table).toHaveLength(1);
    vi.advanceTimersByTime(TURN_MS - THROW_IN_MS);
    expect(g.table).toEqual([]);
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

  it('Aussehen der Figur wird übernommen, Ungültiges wird „normal“', () => {
    const rooms = new RoomManager();
    const { room } = rooms.create('Anna', 0, 's1', false, '', { eyes: 2, mouth: 1, hat: 3 });
    rooms.join(room.code, 'Ben', 1, 's2', '', { eyes: 99, mouth: -1, hat: 'krone' });
    rooms.join(room.code, 'Cleo', 2, 's3');
    const v = viewFor(room, room.hostId);
    expect(v.players.map((p) => p.look)).toEqual([
      { eyes: 2, mouth: 1, hat: 3 },
      { eyes: 0, mouth: 0, hat: 0 },
      { eyes: 0, mouth: 0, hat: 0 },
    ]);
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

  it('bleibt nur einer übrig, ist die Partie abgebrochen und er wartet in der Lobby', () => {
    const { rooms, room } = startedRoom();
    rooms.disconnect(room, 's2');
    vi.advanceTimersByTime(AWAY_KICK_MS);
    rooms.kick(room, room.players[0].id, room.players[1].id);
    expect(room.game).toBeNull();
    expect(room.players).toHaveLength(1);
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
    expect(rooms.openLobbies()).toEqual([
      {
        code: pub.code,
        host: 'Anna',
        color: 0,
        look: { eyes: 0, mouth: 0, hat: 0 },
        players: 1,
        bots: 0,
        neighborsOnly: false,
        unlimited: false,
        transfer: true,
      },
    ]);
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
    expect(room.settings.hints).toBe(false); // Standard: selbst aufpassen
    expect(room.settings).toMatchObject({ turnSeconds: 25, transfer: true }); // Standard
    rooms.updateSettings(room, session.playerId, {
      public: true,
      neighborsOnly: true,
      unlimited: true,
      hints: true,
      turnSeconds: 40,
      transfer: false,
    });
    expect(room.settings).toEqual({
      public: true,
      neighborsOnly: true,
      unlimited: true,
      hints: true,
      turnSeconds: 40,
      transfer: false,
    });
    // Ungültige Zugzeit wird ignoriert
    rooms.updateSettings(room, session.playerId, { turnSeconds: 7 as never });
    expect(room.settings.turnSeconds).toBe(40);
    rooms.start(room, session.playerId);
    expect(room.game!.neighborsOnly).toBe(true);
    expect(room.game!.maxTable).toBe(Infinity);
    expect(room.game!.allowTransfer).toBe(false);
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

describe('Alle anderen sind weg', () => {
  it('der Letzte landet wieder in der Lobby, andere können beitreten', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    const b = rooms.join(room.code, 'Ben', 1, 's2').session;
    rooms.start(room, session.playerId);
    rooms.leave(room, session.playerId, 's1');
    expect(room.game).toBeNull();
    expect(viewFor(room, b.playerId).phase).toBe('lobby');
    expect(room.hostId).toBe(b.playerId);
    expect(rooms.join(room.code, 'Anna', 0, 's3').room).toBe(room);
  });
});

describe('Bots', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('nur der Gastgeber setzt Bots, höchstens bis der Raum voll ist', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    const b = rooms.join(room.code, 'Ben', 1, 's2').session;
    expect(() => rooms.addBot(room, b.playerId)).toThrow('Nur der Gastgeber');
    rooms.addBot(room, session.playerId);
    rooms.addBot(room, session.playerId);
    expect(room.players.map((p) => p.name)).toEqual(['Anna', 'Ben', '🤖 Iwan', '🤖 Olga']);
    expect(() => rooms.addBot(room, session.playerId)).toThrow('voll');
    // Bot wieder rauswerfen geht wie bei Menschen
    rooms.kickFromLobby(room, session.playerId, room.players[3].id);
    expect(room.players).toHaveLength(3);
  });

  it('allein mit Bots spielen: Bots gelten als verbunden und ziehen von selbst', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    const bot = rooms.addBot(room, session.playerId);
    rooms.start(room, session.playerId);
    room.holdUntil = 0;
    expect(room.players).toHaveLength(2); // Bot bleibt beim Start dabei
    expect(rooms.isPaused(room)).toBe(false);
    const view = viewFor(room, session.playerId);
    expect(view.players.find((p) => p.id === bot.id)).toMatchObject({ bot: true, connected: true });
    // Ist der Bot dran, zieht er nach der Denkpause
    const g = room.game!;
    const botWaits = () => g.waitingOn().includes(bot.id);
    let moved = 0;
    for (let i = 0; i < 400 && !g.finished; i++) {
      if (botWaits()) {
        rooms.scheduleBot(room, () => moved++, 10);
        vi.advanceTimersByTime(30_000); // inkl. Warten aufs Nachziehen
      } else {
        g.timeout(); // ich „verpenne“ – schluckt bzw. legt die kleinste Karte
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(g.finished).toBe(true);
  });

  it('ein Mensch bekommt den Platz eines Bots, wenn der Raum voll ist', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1', true);
    rooms.addBot(room, session.playerId);
    rooms.addBot(room, session.playerId);
    rooms.addBot(room, session.playerId);
    expect(rooms.openLobbies()[0]).toMatchObject({ players: 4, bots: 3 });
    rooms.join(room.code, 'Ben', 1, 's2');
    expect(room.players.map((p) => p.name)).toEqual(['Anna', '🤖 Iwan', '🤖 Olga', 'Ben']);
  });

  it('geht der letzte Mensch, verschwinden auch die Bots', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    rooms.addBot(room, session.playerId);
    rooms.start(room, session.playerId);
    rooms.leave(room, session.playerId, 's1');
    expect(room.players).toEqual([]);
    expect(room.game).toBeNull();
    expect(rooms.cleanup(30 * 60 * 1000)).toEqual([]);
    expect(rooms.get(room.code)).toBeUndefined();
  });
});

describe('Warten, bis die Karten verteilt sind', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('nach dem Start und nach dem Nachziehen zieht niemand, Zugzeit beginnt danach', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    rooms.join(room.code, 'Ben', 1, 's2');
    rooms.start(room, session.playerId);
    const deal = rooms.holdMs(room);
    expect(deal).toBeGreaterThan(3000); // Mischen + 12 Karten austeilen
    expect(viewFor(room, session.playerId).holdMs).toBe(deal);
    rooms.armTimer(room, () => {});
    expect(viewFor(room, session.playerId).timer!.remainingMs).toBe(deal + TURN_MS);
    vi.advanceTimersByTime(deal);
    expect(rooms.holdMs(room)).toBe(0);

    // Runde zu Ende (Verteidiger schluckt, Angreifer fertig) → nachgezogen → wieder warten
    const g = room.game!;
    g.attack(g.attacker.id, g.attacker.hand[0]);
    g.take(g.defender.id);
    g.pass(g.attacker.id);
    rooms.recordResult(room);
    expect(rooms.holdMs(room)).toBeGreaterThan(1000);
  });

  it('ein Bot wartet auch, bis ausgeteilt ist', () => {
    const rooms = new RoomManager();
    const { room, session } = rooms.create('Anna', 0, 's1');
    const bot = rooms.addBot(room, session.playerId);
    rooms.start(room, session.playerId);
    const g = room.game!;
    g.attackerIdx = g.players.findIndex((p) => p.id === bot.id);
    g.defenderIdx = 1 - g.attackerIdx;
    let moved = false;
    rooms.scheduleBot(room, () => (moved = true), 10);
    vi.advanceTimersByTime(rooms.holdMs(room) - 1);
    expect(moved).toBe(false);
    vi.advanceTimersByTime(20);
    expect(moved).toBe(true);
    expect(g.table).toHaveLength(1);
  });
});
