import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { AVATAR_COLORS, MAX_PLAYERS, type Card, type OpenLobby, type Result, type Session } from '@durak/shared';
import { call, saveSession, socket } from './socket';
import { CardFace } from './CardView';
import { Avatar } from './Avatar';
import { Segmented } from './Segmented';

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

/** Liste offener Spiele – live vom Server, solange die Startseite offen ist */
function useOpenLobbies(): OpenLobby[] {
  const [list, setList] = useState<OpenLobby[]>([]);
  useEffect(() => {
    const watch = () => socket.emit('lobbies:watch');
    socket.on('lobbies', setList);
    socket.on('connect', watch);
    if (socket.connected) watch();
    return () => {
      socket.emit('lobbies:unwatch');
      socket.off('lobbies', setList);
      socket.off('connect', watch);
    };
  }, []);
  return list;
}

export function Home({ message = '' }: { message?: string }) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get('raum') ?? '').toUpperCase());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const lobbies = useOpenLobbies();
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
    run((ack) => socket.emit('room:create', { name, color, public: isPublic }, ack));
  };

  const joinOpen = (roomCode: string) =>
    run((ack) => socket.emit('room:join', { roomCode, name, color }, ack));

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

      <div className="home-main">
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
          <Segmented
            label="Neuer Raum"
            value={isPublic}
            options={[
              { value: false, label: 'Privat' },
              { value: true, label: 'Öffentlich' },
            ]}
            onChange={setIsPublic}
          />
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
        {(error || message) && <p className="form-error">{error || message}</p>}
      </div>

      <section className="panel open-games" aria-labelledby="open-games-title">
        <h2 id="open-games-title">Offene Spiele</h2>
        {lobbies.length === 0 ? (
          <p className="open-empty">Gerade wartet niemand. Erstell einen öffentlichen Raum – dann taucht er hier auf.</p>
        ) : (
          <ul className="open-list">
            {lobbies.map((l) => (
              <li key={l.code}>
                <span className="avatar small">
                  <Avatar color={l.color} expression="happy" seed={l.code} />
                </span>
                <span className="open-info">
                  <b>{l.host}</b>
                  <span>
                    {l.players}/{MAX_PLAYERS} Spieler{l.neighborsOnly ? ' · nur Nachbarn legen nach' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={busy || !name.trim()}
                  title={name.trim() ? undefined : 'Erst oben deinen Namen eingeben'}
                  onClick={() => joinOpen(l.code)}
                >
                  Mitspielen
                </button>
              </li>
            ))}
          </ul>
        )}
        {lobbies.length > 0 && !name.trim() && <p className="open-hint">Gib zuerst deinen Namen ein.</p>}
      </section>
      </div>
    </main>
  );
}
