import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type GameView } from '@durak/shared';
import { call, socket } from './socket';
import { Seat, type SeatPos } from './Seat';
import { Segmented } from './Segmented';

const CHAIRS: SeatPos[] = ['bottom', 'left', 'top', 'right'];

export function Lobby({ view }: { view: GameView }) {
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const isHost = view.hostId === view.you;
  const link = `${location.origin}${location.pathname}?raum=${view.roomCode}`;
  const enough = view.players.length >= MIN_PLAYERS;

  const start = () => {
    setError('');
    call((ack) => socket.emit('game:start', ack)).catch((e: Error) => setError(e.message));
  };

  const change = (settings: Partial<GameView['settings']>) => {
    setError('');
    call((ack) => socket.emit('room:settings', settings, ack)).catch((e: Error) => setError(e.message));
  };

  const kick = (playerId: string) => {
    setError('');
    call((ack) => socket.emit('room:kick', { playerId }, ack)).catch((e: Error) => setError(e.message));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('Kopieren ging nicht – schick einfach den Code.');
    }
  };

  return (
    <main className="lobby">
      <div className="lobby-head">
        <p className="lobby-label">Raum-Code</p>
        <p className="room-code">{view.roomCode}</p>
        <button type="button" className="btn ghost small" onClick={copy}>
          {copied ? 'Link kopiert' : 'Einladungslink kopieren'}
        </button>
      </div>

      <div className="mini-arena">
        <div className="felt mini-felt">
          <span className="mini-felt-text">
            {view.players.length} / {MAX_PLAYERS}
          </span>
        </div>
        {CHAIRS.map((pos, i) => {
          const p = view.players[i];
          return p ? (
            <Seat
              key={pos}
              pos={pos}
              id={p.id}
              name={p.name}
              color={p.color}
              expression="happy"
              hat={p.id === view.lastDurakId}
              offline={!p.connected}
              note={[p.id === view.you && 'du', p.id === view.hostId && 'Gastgeber'].filter(Boolean).join(', ') || undefined}
              action={
                isHost && p.id !== view.you ? (
                  <button type="button" className="kick-btn" onClick={() => kick(p.id)} aria-label={`${p.name} rauswerfen`}>
                    rauswerfen
                  </button>
                ) : undefined
              }
            />
          ) : (
            <Seat key={pos} pos={pos} empty />
          );
        })}
      </div>

      {isHost ? (
        <div className="room-settings">
          <Segmented
            label="Raum"
            value={view.settings.public}
            options={[
              { value: false, label: 'Privat' },
              { value: true, label: 'Öffentlich' },
            ]}
            onChange={(v) => change({ public: v })}
          />
          <Segmented
            label="Nachlegen"
            value={view.settings.neighborsOnly}
            options={[
              { value: false, label: 'Alle' },
              { value: true, label: 'Nur Nachbarn' },
            ]}
            onChange={(v) => change({ neighborsOnly: v })}
          />
        </div>
      ) : (
        <p className="lobby-note">
          {view.settings.public ? 'Öffentlicher Raum' : 'Privater Raum'} · Nachlegen:{' '}
          {view.settings.neighborsOnly ? 'nur Nachbarn' : 'alle'}
        </p>
      )}

      {isHost ? (
        <button type="button" className="btn" onClick={start} disabled={!enough}>
          {enough ? 'Spiel starten' : 'Warte auf Mitspieler …'}
        </button>
      ) : (
        <p className="lobby-note">Der Gastgeber startet das Spiel.</p>
      )}
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}
