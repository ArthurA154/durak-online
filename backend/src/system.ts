import { statfsSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem, uptime } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export interface Sample {
  t: number;
  /** CPU des Backends in % eines Kerns */
  cpu: number;
  /** Arbeitsspeicher des Backends in Bytes */
  rss: number;
  online: number;
  games: number;
}

const SAMPLE_MS = 10_000;
const KEEP = (60 * 60 * 1000) / SAMPLE_MS; // 1 Stunde

/** Misst regelmäßig CPU/Speicher des Backends und merkt sich die letzte Stunde. */
export class SystemMonitor {
  readonly samples: Sample[] = [];
  private lastCpu = process.cpuUsage();
  private lastAt = performance.now();
  private loop = monitorEventLoopDelay({ resolution: 20 });
  private loopP99 = 0;

  constructor(private live: () => { online: number; games: number }) {
    this.loop.enable();
    this.sample();
    setInterval(() => this.sample(), SAMPLE_MS).unref();
  }

  private sample(): void {
    const now = performance.now();
    const cpu = process.cpuUsage(this.lastCpu);
    const wallMs = now - this.lastAt || 1;
    this.lastCpu = process.cpuUsage();
    this.lastAt = now;
    this.loopP99 = this.loop.percentile(99) / 1e6;
    this.loop.reset();
    this.samples.push({
      t: Date.now(),
      cpu: Math.round(((cpu.user + cpu.system) / 1000 / wallMs) * 1000) / 10,
      rss: process.memoryUsage.rss(),
      ...this.live(),
    });
    if (this.samples.length > KEEP) this.samples.shift();
  }

  snapshot() {
    const mem = process.memoryUsage();
    let disk: { total: number; free: number } | null = null;
    try {
      const s = statfsSync('/');
      disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
    } catch {
      // nicht überall verfügbar
    }
    return {
      // Backend-Prozess
      cpu: this.samples.at(-1)?.cpu ?? 0,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      loopDelayMs: Math.round(this.loopP99 * 10) / 10,
      processUptime: Math.round(process.uptime()),
      node: process.version,
      // Ganzer Server (im Container sieht man den Host)
      cores: cpus().length,
      load: loadavg().map((l) => Math.round(l * 100) / 100),
      memTotal: totalmem(),
      memFree: freemem(),
      serverUptime: Math.round(uptime()),
      disk,
    };
  }
}
