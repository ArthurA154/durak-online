import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, Result, ServerToClientEvents, Session } from '@durak/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';
const SESSION_KEY = 'durak.session';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
  autoConnect: true,
});

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // z. B. privater Modus – dann eben ohne Wiederverbinden
  }
}

/** Wandelt einen ack-Callback in ein Promise um und wirft bei Fehlern. */
export function call<T>(send: (ack: (r: Result<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    send((r) => (r.ok ? resolve(r as T) : reject(new Error(r.error))));
  });
}
