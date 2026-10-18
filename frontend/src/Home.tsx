import { useState, type CSSProperties, type FormEvent } from 'react';
import { AVATAR_COLORS, type Card, type Result, type Session } from '@durak/shared';
import { call, saveSession, socket } from './socket';
import { CardFace } from './CardView';
import { Avatar } from './Avatar';

const NAME_KEY = 'durak.name';
const COLOR_KEY = 'durak.color';
const HERO_CARDS: Card[] = [
  { rank: 11, suit: 'S' },
  { rank: 12, suit: 'H' },
  { rank: 13, suit: 'C' },
  { rank: 14, suit: 'D' },
];

function initialColor(): number {
  try {
    const c = Number(localStorage.getItem(COLOR_KEY));
    if (localStorage.getItem(COLOR_KEY) !== null && c >= 0 && c < AVATAR_COLORS.length) return c;
  } catch {
    /* egal */
  }
  return Math.floor(Math.random() * AVATAR_COLORS.length);
}

function initialName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Home() {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get('raum') ?? '').toUpperCase());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const invited = code.length === 5;

  const run = async (send: (ack: (r: Result<Session>) => void) => void) => {
    setError('');
    setBusy(true);
    try {
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(COLOR_KEY, String(color));
    } catch {
      /* egal */
    }
    try {
      saveSession(await call<Session>(send));
      history.replaceState(null, '', location.pathname);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    run((ack) => socket.emit('room:create', { name, color }, ack));
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    run((ack) => socket.emit('room:join', { roomCode: code.trim().toUpperCase(), name, color }, ack));
  };

  return (
    <main className="home">
      <div className="hero">
        <div className="hero-fan" aria-hidden="true">
          {HERO_CARDS.map((c, i) => (
            <div key={i} className="hero-card" style={{ '--i': i - 1.5 } as CSSProperties}>
              <CardFace card={c} />
            </div>
          ))}
        </div>
        <h1 className="hero-word">Дурак</h1>
      </div>

      <div className="panel">
        <div className="me-editor">
          <div className="me-preview">
            <Avatar color={color} expression={name.trim() ? 'happy' : 'neutral'} seed="preview" />
          </div>
          <label className="field">
            <span>Dein Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoFocus />
          </label>
        </div>
        <div className="swatches" role="radiogroup" aria-label="Farbe deiner Figur">
          {AVATAR_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={i === color}
              aria-label={`Farbe ${i + 1}`}
              className={`swatch${i === color ? ' active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(i)}
            />
          ))}
        </div>

        <div className="panel-actions">
          <form onSubmit={create}>
            <button type="submit" className={`btn wide${invited ? ' ghost' : ''}`} disabled={busy || !name.trim()}>
              Raum erstellen
            </button>
          </form>
          <span className="or">oder</span>
          <form onSubmit={join} className="join-form">
            <input
              aria-label="Raum-Code"
              placeholder="CODE"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={5}
              className="code-input"
            />
            <button type="submit" className={`btn${invited ? '' : ' ghost'}`} disabled={busy || !name.trim() || code.trim().length < 5}>
              Beitreten
            </button>
          </form>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </main>
  );
}
