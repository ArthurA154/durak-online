import { useEffect, useState } from 'react';
import type { GameView, Session } from '@durak/shared';
import { call, loadSession, saveSession, socket } from './socket';
import { Home } from './Home';
import { Lobby } from './Lobby';
import { Table } from './Table';
import { AudioToggles } from './AudioToggles';
import { useGameSounds } from './useGameSounds';

/** Pro Verbindung nur einmal wiederverbinden (sonst kam es doppelt beim Server an) */
let rejoinedSocket: string | undefined;

export function App() {
  const [view, setView] = useState<GameView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [connectError, setConnectError] = useState('');

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
    const onConnectError = (err: Error) => setConnectError(err.message);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('state', setView);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('state', setView);
    };
  }, []);

  useGameSounds(view);

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
        {view ? <span className="wordmark">Дурак</span> : <span />}
        <div className="topbar-right">
          {!connected && <span className="offline-note">{connectError || 'Verbinde mit dem Server …'}</span>}
          <AudioToggles />
          {view && (
            <button type="button" className="btn ghost small" onClick={leave}>
              Raum verlassen
            </button>
          )}
        </div>
      </header>
      {!view && <Home />}
      {view?.phase === 'lobby' && <Lobby view={view} />}
      {inGame && <Table view={view} />}
    </div>
  );
}
