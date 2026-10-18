import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GameOutcome } from './rooms.js';

/** Zahlen eines Tages (Schweizer Zeit). */
export interface DayStats {
  date: string;
  visitors: number;
  connections: number;
  roomsCreated: number;
  gamesStarted: number;
  gamesFinished: number;
  draws: number;
  aborted: number;
  /** Summe der Spieldauer fertiger Partien (für den Durchschnitt) */
  playMs: number;
  /** Summe der Spieler gestarteter Partien (für den Durchschnitt) */
  players: number;
  peakOnline: number;
  peakGames: number;
  limited: number;
  /** Nur Anzahl – Inhalte werden nie gespeichert */
  chats: number;
  throws: number;
}

export interface GameRecord {
  at: number;
  durationMs: number;
  players: string[];
  durak: string | null;
  outcome: GameOutcome;
}

export interface ErrorRecord {
  at: number;
  message: string;
}

interface Saved {
  days: DayStats[];
  games: GameRecord[];
  errors: ErrorRecord[];
  /** Besucher von heute: nur Hashes (IP + Tages-Salz), am nächsten Tag weg */
  visitorDate: string;
  visitorSalt: string;
  visitorHashes: string[];
}

const KEEP_DAYS = 400;
const KEEP_GAMES = 100;
const KEEP_ERRORS = 50;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dayOf = (t: number): string => dayFormat.format(t);

const emptyDay = (date: string): DayStats => ({
  date,
  visitors: 0,
  connections: 0,
  roomsCreated: 0,
  gamesStarted: 0,
  gamesFinished: 0,
  draws: 0,
  aborted: 0,
  playMs: 0,
  players: 0,
  peakOnline: 0,
  peakGames: 0,
  limited: 0,
  chats: 0,
  throws: 0,
});

/**
 * Statistik für die Admin-Seite. Liegt im Speicher und wird regelmäßig als JSON-Datei gesichert
 * (ohne `file` nur im Speicher, z. B. in Tests). IP-Adressen werden nie gespeichert.
 */
export class Stats {
  private days = new Map<string, DayStats>();
  private games: GameRecord[] = [];
  private errors: ErrorRecord[] = [];
  private visitorDate = '';
  private visitorSalt = '';
  private visitors = new Set<string>();
  private dirty = false;

  constructor(
    private file?: string,
    private now: () => number = Date.now,
  ) {
    if (file) this.load(file);
  }

  // ---------- Ereignisse ----------

  connection(ip: string): void {
    const day = this.today();
    day.connections++;
    this.rollVisitors(day.date);
    const hash = createHash('sha256')
      .update(this.visitorSalt + ip)
      .digest('base64url')
      .slice(0, 16);
    if (!this.visitors.has(hash)) {
      this.visitors.add(hash);
      day.visitors = this.visitors.size;
    }
    this.dirty = true;
  }

  roomCreated(): void {
    this.today().roomsCreated++;
    this.dirty = true;
  }

  gameStarted(players: number): void {
    const day = this.today();
    day.gamesStarted++;
    day.players += players;
    this.dirty = true;
  }

  gameEnded(rec: GameRecord): void {
    const day = this.today();
    if (rec.outcome === 'aborted') day.aborted++;
    else {
      day.gamesFinished++;
      day.playMs += rec.durationMs;
      if (rec.outcome === 'draw') day.draws++;
    }
    this.games.unshift(rec);
    this.games.length = Math.min(this.games.length, KEEP_GAMES);
    this.dirty = true;
  }

  chat(): void {
    this.today().chats++;
    this.dirty = true;
  }

  thrown(): void {
    this.today().throws++;
    this.dirty = true;
  }

  limited(): void {
    this.today().limited++;
    this.dirty = true;
  }

  error(message: string): void {
    this.errors.unshift({ at: this.now(), message: message.slice(0, 500) });
    this.errors.length = Math.min(this.errors.length, KEEP_ERRORS);
    this.dirty = true;
  }

  /** Aktueller Stand (regelmäßig aufrufen) – für die Tageshöchstwerte. */
  observe(online: number, games: number): void {
    const day = this.today();
    if (online > day.peakOnline || games > day.peakGames) {
      day.peakOnline = Math.max(day.peakOnline, online);
      day.peakGames = Math.max(day.peakGames, games);
      this.dirty = true;
    }
  }

  // ---------- Abfragen ----------

  /** Die letzten `n` Tage bis heute, fehlende Tage mit Nullen. */
  lastDays(n: number): DayStats[] {
    const out: DayStats[] = [];
    // Vom heutigen Datum aus in UTC zurückzählen – so stört die Zeitumstellung nicht
    const today = Date.parse(`${dayOf(this.now())}T00:00:00Z`);
    for (let i = n - 1; i >= 0; i--) {
      const date = new Date(today - i * 86_400_000).toISOString().slice(0, 10);
      out.push(this.days.get(date) ?? emptyDay(date));
    }
    return out;
  }

  totals(): Omit<DayStats, 'date' | 'peakOnline' | 'peakGames'> & { days: number; peakOnline: number } {
    const t = { ...emptyDay(''), days: this.days.size };
    for (const d of this.days.values()) {
      t.visitors += d.visitors;
      t.connections += d.connections;
      t.roomsCreated += d.roomsCreated;
      t.gamesStarted += d.gamesStarted;
      t.gamesFinished += d.gamesFinished;
      t.draws += d.draws;
      t.aborted += d.aborted;
      t.playMs += d.playMs;
      t.players += d.players;
      t.limited += d.limited;
      t.chats += d.chats;
      t.throws += d.throws;
      t.peakOnline = Math.max(t.peakOnline, d.peakOnline);
    }
    const { date: _d, peakGames: _p, ...rest } = t;
    return rest;
  }

  recentGames(n = 30): GameRecord[] {
    return this.games.slice(0, n);
  }

  recentErrors(n = 20): ErrorRecord[] {
    return this.errors.slice(0, n);
  }

  // ---------- Speichern ----------

  /** Schreibt die Datei, falls sich etwas geändert hat (atomar über eine Zwischendatei). */
  save(): void {
    if (!this.file || !this.dirty) return;
    const data: Saved = {
      days: [...this.days.values()].slice(-KEEP_DAYS),
      games: this.games,
      errors: this.errors,
      visitorDate: this.visitorDate,
      visitorSalt: this.visitorSalt,
      visitorHashes: [...this.visitors],
    };
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(data));
      renameSync(tmp, this.file);
      this.dirty = false;
    } catch (err) {
      console.error('Statistik konnte nicht gespeichert werden:', err);
    }
  }

  private load(file: string): void {
    let data: Partial<Saved>;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return; // noch keine Datei (oder kaputt) → leer anfangen
    }
    for (const d of data.days ?? []) this.days.set(d.date, { ...emptyDay(d.date), ...d });
    this.games = data.games ?? [];
    this.errors = data.errors ?? [];
    if (data.visitorDate === dayOf(this.now()) && data.visitorSalt) {
      this.visitorDate = data.visitorDate;
      this.visitorSalt = data.visitorSalt;
      this.visitors = new Set(data.visitorHashes ?? []);
    }
  }

  private today(): DayStats {
    const date = dayOf(this.now());
    let day = this.days.get(date);
    if (!day) {
      day = emptyDay(date);
      this.days.set(date, day);
      if (this.days.size > KEEP_DAYS) this.days.delete(this.days.keys().next().value!);
    }
    return day;
  }

  /** Neuer Tag → neues Salz, alte Besucher-Hashes vergessen. */
  private rollVisitors(date: string): void {
    if (this.visitorDate === date) return;
    this.visitorDate = date;
    this.visitorSalt = randomBytes(16).toString('hex');
    this.visitors.clear();
  }
}
