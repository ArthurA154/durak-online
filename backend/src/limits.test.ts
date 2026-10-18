import { describe, expect, it } from 'vitest';
import { ConnectionCounter, RateLimiter } from './limits.js';

describe('RateLimiter', () => {
  it('erlaubt max Ereignisse pro Zeitfenster, danach wieder', () => {
    const l = new RateLimiter(3, 1000);
    expect([l.take('ip', 0), l.take('ip', 10), l.take('ip', 20), l.take('ip', 30)]).toEqual([true, true, true, false]);
    expect(l.take('anders', 30)).toBe(true);
    expect(l.take('ip', 1001)).toBe(true);
  });
});

describe('ConnectionCounter', () => {
  it('begrenzt gleichzeitige Verbindungen', () => {
    const c = new ConnectionCounter(2);
    expect([c.open('ip'), c.open('ip'), c.open('ip')]).toEqual([true, true, false]);
    c.close('ip');
    expect(c.open('ip')).toBe(true);
  });
});
