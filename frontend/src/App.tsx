import { useEffect, useState } from 'react';
import type { GameView, Session } from '@durak/shared';
import { call, connectErrorText, loadSession, saveSession, socket } from './socket';
import { Home } from './Home';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { AudioToggles } from './AudioToggles';
import { Leaderboard } from './Leaderboard';
import { Chat } from './Chat';
import { FxLayer } from './FxLayer';
import { setMe } from './social';
import { useGameSounds } from './useGameSounds';

/** Pro Verbindung nur einmal wiederverbinden (sonst kam es doppelt beim Server an) */
let rejoinedSocket: string | undefined;

export function App() {
  const [view, setView] = useState<GameView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [connectError, setConnectError] = useState('');
  // „Verbinde …“ erst zeigen, wenn es länger dauert (sonst flackert es bei jedem Laden)
  const [slow, setSlow] = useState(false);
  // Nachricht vom Betreiber (z. B. „Server startet gleich neu“)
  const [notice, setNotice] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setConnectError('');
      // Nach Neuladen oder Verbindungsabbruch automatisch zurück in den Raum
      const s = loadSession();
      if (s && rejoinedSocket !== socket.id) {
        rejoinedSocket = socket.id;
        call<Session>((ack) => socket.emit('room:rejoin', { roomCode: s.roomCode, token: s.token }, ack)).catch(() => {
          saveSession(null);
          setView(null);
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error) => setConnectError(connectErrorText(err));
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    const onState = (v: GameView) => {
      setView(v);
      setKicked(false);
    };
    socket.on('state', onState);
    const onNotice = (n: { text: string } | null) => setNotice(n?.text ?? null);
    socket.on('notice', onNotice);
    const onKicked = () => {
      saveSession(null);
      setView(null);
      setKicked(true);
    };
    socket.on('kicked', onKicked);
    if (socket.connected) onConnect();
    const slowTimer = window.setTimeout(() => setSlow(true), 2500);
    return () => {
      window.clearTimeout(slowTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('state', onState);
      socket.off('notice', onNotice);
      socket.off('kicked', onKicked);
    };
  }, []);

  useGameSounds(view);
  useEffect(() => setMe(view?.you ?? null), [view?.you]);

  const leave = () => {
    if (view?.phase === 'playing' && !window.confirm('Wirklich gehen? Du wirst aus dem laufenden Spiel entfernt.'))
      return;
    socket.emit('room:leave');
    saveSession(null);
    setView(null);
  };

  const inGame = !!view && view.phase !== 'lobby';

  return (
    <div className={`app${inGame ? ' in-game' : ''}`}>
      <header className="topbar">
        {view ? (
          <div className="topbar-left">
            <span className="wordmark">Дурак</span>
            <Leaderboard view={view} />
          </div>
        ) : (
          <span />
        )}
        <div className="topbar-right">
          {view && <Chat me={view.you} quickOnly={view.settings.public} />}
          <AudioToggles />
          {view && (
            <button type="button" className="btn ghost small" onClick={leave}>
              Raum verlassen
            </button>
          )}
        </div>
      </header>
      {!connected && (connectError || slow) && (
        <div className="conn-banner" role="alert">
          {connectError || 'Verbinde mit dem Server …'}
        </div>
      )}
      {notice && (
        <div className="notice-banner" role="status">
          <span>📢 {notice}</span>
          <button type="button" aria-label="Schliessen" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      {!view && <Home message={kicked ? 'Der Gastgeber hat dich aus dem Raum entfernt.' : ''} />}
      {view?.phase === 'lobby' && <Lobby view={view} />}
      {inGame && <Table view={view} />}
      {view && <FxLayer me={view.you} />}
    </div>
  );
}
