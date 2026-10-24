import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type GameView } from '@durak/shared';
import { call, socket } from './socket';
import { Seat, type SeatPos } from './Seat';
import { RuleControls, RuleSummary } from './Rules';
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

  const addBot = () => {
    setError('');
    call((ack) => socket.emit('room:addBot', ack)).catch((e: Error) => setError(e.message));
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
              look={p.look}
              expression="happy"
              hat={p.id === view.lastDurakId}
              offline={!p.connected}
              note={
                [p.id === view.you && t('you'), p.id === view.hostId && t('host')].filter(Boolean).join(', ') ||
                undefined
              }
              action={
                isHost && p.id !== view.you ? (
                  <button
                    type="button"
                    className="kick-btn"
                    onClick={() => kick(p.id)}
                    aria-label={t('kickName', { name: p.name })}
                  >
                    {t('kick')}
                  </button>
                ) : undefined
              }
            />
          ) : (
            <Seat
              key={pos}
              pos={pos}
              empty
              action={
                isHost ? (
                  <button type="button" className="bot-btn" onClick={addBot}>
                    {t('addBot')}
                  </button>
                ) : undefined
              }
            />
          );
        })}
      </div>

      {/* Der Gastgeber stellt die Regeln ein, alle anderen sehen nur die Zusammenfassung */}
      <div className="lobby-rules">
        {isHost ? (
          <RuleControls settings={view.settings} onChange={change} showRoom />
        ) : (
          <>
            <p className="room-settings-title">{t('rulesByHost')}</p>
            <RuleSummary settings={view.settings} showRoom />
          </>
        )}
      </div>

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
