import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { CHAT_MAX, QUICK_PHRASES } from '@durak/shared';
import { colorOf } from './Avatar';
import { call, socket } from './socket';
import { getChat, setChatOpen, subscribeChat } from './social';
import { unlockAudio } from './audio';

/** 💬-Knopf in der Kopfleiste und das Chatfenster darunter. */
export function Chat({ me, quickOnly }: { me: string; quickOnly: boolean }) {
  const chat = useSyncExternalStore(subscribeChat, getChat);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const logRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Immer zur neuesten Nachricht scrollen
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [chat.messages.length, chat.open]);

  // Schließen mit Escape oder Klick daneben
  useEffect(() => {
    if (!chat.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setChatOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setChatOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [chat.open]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 2500);
    return () => clearTimeout(t);
  }, [error]);

  const send = (msg: string) => {
    const clean = msg.trim();
    if (!clean) return;
    unlockAudio();
    call((ack) => socket.emit('chat:send', { text: clean }, ack))
      .then(() => setText(''))
      .catch((e: Error) => setError(e.message));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <div className="chat">
      <button
        ref={buttonRef}
        type="button"
        className={`icon-btn chat-toggle${chat.open ? ' active' : ''}`}
        aria-label={chat.unread ? `Chat – ${chat.unread} neu` : 'Chat'}
        aria-expanded={chat.open}
        onClick={() => setChatOpen(!chat.open)}
      >
        <ChatIcon />
        {chat.unread > 0 && <span className="chat-badge">{chat.unread > 9 ? '9+' : chat.unread}</span>}
      </button>

      {chat.open && (
        <div ref={panelRef} className="chat-panel" role="dialog" aria-label="Chat">
          <ol ref={logRef} className="chat-log" aria-live="polite">
            {chat.messages.length === 0 && <li className="chat-empty">Noch nichts geschrieben. Tipp auf eine Figur, um etwas zu werfen 🍅</li>}
            {chat.messages.map((m) => (
              <li key={m.id} className={m.from === me ? 'mine' : undefined}>
                <b style={{ color: colorOf(m.color) }}>{m.from === me ? 'Du' : m.name}</b> {m.text}
              </li>
            ))}
          </ol>
          <div className="chat-quick">
            {QUICK_PHRASES.map((q) => (
              <button key={q} type="button" onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
          {quickOnly ? (
            <p className="chat-note">Öffentlicher Raum: nur Schnellsprüche.</p>
          ) : (
          <form className="chat-form" onSubmit={submit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={CHAT_MAX}
              placeholder="Nachricht …"
              aria-label="Nachricht"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="Senden">
              <SendIcon />
            </button>
          </form>
          )}
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" />
    </svg>
  );
}
