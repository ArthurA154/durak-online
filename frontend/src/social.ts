import type { ChatMessage, ThrowEvent } from '@durak/shared';
import { socket } from './socket';

// Chat-Verlauf und Würfe. Hört immer mit (auch bevor der Raum angezeigt wird),
// damit der Verlauf beim Betreten nicht verloren geht.

interface ChatState {
  messages: ChatMessage[];
  unread: number;
  open: boolean;
}

let state: ChatState = { messages: [], unread: 0, open: false };
let me: string | null = null;
const listeners = new Set<() => void>();
const messageListeners = new Set<(m: ChatMessage) => void>();
const throwListeners = new Set<(t: ThrowEvent) => void>();

function set(change: Partial<ChatState>): void {
  state = { ...state, ...change };
  for (const fn of listeners) fn();
}

export const getChat = () => state;

export function subscribeChat(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Neue Nachricht (nicht beim Laden des Verlaufs) – für Sprechblasen */
export function onMessage(fn: (m: ChatMessage) => void): () => void {
  messageListeners.add(fn);
  return () => messageListeners.delete(fn);
}

export function onThrow(fn: (t: ThrowEvent) => void): () => void {
  throwListeners.add(fn);
  return () => throwListeners.delete(fn);
}

/** Eigene Spieler-ID – eigene Nachrichten zählen nicht als ungelesen */
export function setMe(id: string | null): void {
  if (id !== me && id === null) set({ messages: [], unread: 0, open: false });
  me = id;
}

export function setChatOpen(open: boolean): void {
  set(open ? { open, unread: 0 } : { open });
}

socket.on('chat:history', (messages) => set({ messages, unread: 0 }));

socket.on('chat', (msg) => {
  const unread = state.open || msg.from === me ? state.unread : state.unread + 1;
  set({ messages: [...state.messages, msg].slice(-50), unread });
  for (const fn of messageListeners) fn(msg);
});

socket.on('throw', (t) => {
  for (const fn of throwListeners) fn(t);
});
