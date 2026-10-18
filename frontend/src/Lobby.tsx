import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type GameView } from '@durak/shared';
import { call, socket } from './socket';
import { Seat, type SeatPos } from './Seat';
import { Segmented } from './Segmented';
import { t } from './i18n';

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
      setError(t('copyFailed'));
    }
  };

  return (
    <main className="lobby">
      <div className="lobby-head">
        <p className="lobby-label">{t('roomCode')}</p>
        <p className="room-code">{view.roomCode}</p>
        <button type="button" className="btn ghost small" onClick={copy}>
          {copied ? t('linkCopied') : t('copyInvite')}
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
              note={[p.id === view.you && t('you'), p.id === view.hostId && t('host')].filter(Boolean).join(', ') || undefined}
              action={
                isHost && p.id !== view.you ? (
                  <button type="button" className="kick-btn" onClick={() => kick(p.id)} aria-label={t('kickName', { name: p.name })}>
                    {t('kick')}
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
            label={t('room')}
            value={view.settings.public}
            options={[
              { value: false, label: t('private') },
              { value: true, label: t('public') },
            ]}
            onChange={(v) => change({ public: v })}
          />
          <Segmented
            label={t('throwIn')}
            value={view.settings.neighborsOnly}
            options={[
              { value: false, label: t('all') },
              { value: true, label: t('neighborsOnly') },
            ]}
            onChange={(v) => change({ neighborsOnly: v })}
          />
          <Segmented
            label={t('attackLimit')}
            value={view.settings.unlimited}
            options={[
              { value: false, label: t('max6') },
              { value: true, label: t('unlimited') },
            ]}
            onChange={(v) => change({ unlimited: v })}
          />
        </div>
      ) : (
        <p className="lobby-note">
          {view.settings.public ? t('publicRoom') : t('privateRoom')} · {t('throwIn')}:{' '}
          {view.settings.neighborsOnly ? t('throwInNeighbors') : t('throwInAll')} ·{' '}
          {view.settings.unlimited ? t('attackUnlimited') : t('attackMax6')}
        </p>
      )}

      {isHost ? (
        <button type="button" className="btn" onClick={start} disabled={!enough}>
          {enough ? t('startGame') : t('waitingForPlayers')}
        </button>
      ) : (
        <p className="lobby-note">{t('hostStarts')}</p>
      )}
      {error && <p className="form-error">{error}</p>}
    </main>
  );
}
