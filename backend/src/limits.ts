/** Einfache Begrenzung pro Schlüssel (z. B. IP): höchstens `max` Ereignisse in `windowMs`. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** true = erlaubt (und gezählt), false = zu viele */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Alte Einträge vergessen (regelmäßig aufrufen) */
  prune(now = Date.now()): void {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= this.windowMs)) this.hits.delete(key);
    }
  }
}

/** Zählt gleichzeitige Verbindungen pro Schlüssel. */
export class ConnectionCounter {
  private counts = new Map<string, number>();

  constructor(private max: number) {}

  /** true = Verbindung erlaubt (und gezählt) */
  open(key: string): boolean {
    const n = this.counts.get(key) ?? 0;
    if (n >= this.max) return false;
    this.counts.set(key, n + 1);
    return true;
  }

  close(key: string): void {
    const n = (this.counts.get(key) ?? 1) - 1;
    if (n <= 0) this.counts.delete(key);
    else this.counts.set(key, n);
  }
}
