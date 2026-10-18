import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, Result, ServerToClientEvents, Session } from '@durak/shared';
import { serverText, t } from './i18n';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
const SESSION_KEY = 'durak.session';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
  autoConnect: true,
});

/** So lange gilt eine gemerkte Sitzung nach dem Schließen des Browsers */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// Die Sitzung liegt im Tab (sessionStorage) UND auf dem Gerät (localStorage):
// sessionStorage ist nach dem Schließen von Tab/Browser weg – dann hilft localStorage weiter.
export function loadSession(): Session | null {
  try {
    const tab = sessionStorage.getItem(SESSION_KEY);
    if (tab) return JSON.parse(tab) as Session;
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as (Session & { at: number }) | null;
    if (saved && Date.now() - saved.at < SESSION_MAX_AGE_MS) {
      const { at: _at, ...session } = saved;
      return session;
    }
  } catch {
    // kaputt oder kein Speicher → neu anfangen
  }
  return null;
}

export function saveSession(s: Session | null): void {
  try {
    if (s) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, at: Date.now() }));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // z. B. privater Modus – dann eben ohne Wiederverbinden
  }
}

const CALL_TIMEOUT_MS = 8000;

/** Wandelt einen ack-Callback in ein Promise um und wirft bei Fehlern – oder wenn keine Antwort kommt. */
export function call<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(socket.connected ? t('noAnswer') : t('noConnection')));
    }, CALL_TIMEOUT_MS);
    send((r) => {
      window.clearTimeout(timer);
      if (r.ok) resolve(r as T);
      else reject(new Error(serverText(r.error)));
    });
  });
}

/** Technische Verbindungsfehler („xhr poll error“ …) verständlich machen. */
export function connectErrorText(err: Error): string {
  const technical = /xhr|poll|websocket|timeout|transport/i.test(err.message);
  // Eigene Meldungen vom Server (z. B. „Zu viele Verbindungen …“) unverändert anzeigen
  return technical || !err.message ? t('serverUnreachable') : serverText(err.message);
}
