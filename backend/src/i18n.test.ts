import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SERVER_ERRORS, translateServer } from '@durak/shared';

// Jede feste Meldung, die der Server verschicken kann, muss übersetzt sein.
const SOURCES = ['game/durak.ts', 'rooms.ts', 'server.ts'].map((f) =>
  readFileSync(new URL(f, import.meta.url), 'utf8'),
);

function fixedMessages(): string[] {
  const found = new Set<string>();
  for (const src of SOURCES) {
    for (const m of src.matchAll(/GameError\('([^']+)'\)/g)) found.add(m[1]);
    for (const m of src.matchAll(/error: '([^']+)'/g)) found.add(m[1]);
    for (const m of src.matchAll(/new Error\('([^']+)'\)/g)) found.add(m[1]);
  }
  return [...found];
}

describe('Übersetzung der Server-Meldungen', () => {
  it('jede feste Meldung steht in der Tabelle', () => {
    const missing = fixedMessages().filter((m) => !SERVER_ERRORS[m]);
    expect(missing).toEqual([]);
    expect(fixedMessages().length).toBeGreaterThan(40);
  });

  it('Meldungen mit Zahlen und Namen', () => {
    expect(translateServer('Mindestens 2 Spieler nötig', 'en')).toBe('At least 2 players needed');
    expect(translateServer('Noch 12 Sekunden warten', 'ru')).toBe('Подожди ещё 12 сек.');
    expect(translateServer('Anna ist wieder da', 'en')).toBe('Anna is back');
    expect(translateServer('2–4 Spieler nötig', 'en')).toBe('2–4 players needed');
  });

  it('Deutsch bleibt, Unbekanntes bleibt', () => {
    expect(translateServer('Der Raum ist voll', 'de')).toBe('Der Raum ist voll');
    expect(translateServer('Der Raum ist voll', 'ru')).toBe('Комната заполнена');
    expect(translateServer('irgendwas', 'en')).toBe('irgendwas');
  });
});
