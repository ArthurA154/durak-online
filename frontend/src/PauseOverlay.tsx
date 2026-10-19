import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AWAY_KICK_MS, type GameView } from '@durak/shared';
import { Avatar } from './Avatar';
import { call, socket } from './socket';
import { t } from './i18n';

/** Pause, solange jemand getrennt ist; nach AWAY_KICK_MS kann man ohne ihn weiterspielen. */
export function PauseOverlay({ view }: { view: GameView }) {
  const away = view.players.filter((p) => p.awayMs !== null);
  const receivedAt = useMemo(() => Date.now(), [view]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const kick = (playerId: string) => {
    setError('');
    call((ack) => socket.emit('game:kick', { playerId }, ack)).catch((e: Error) => setError(e.message));
  };

  return (
    <motion.div className="pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status">
      <p className="pause-title">{t('pause')}</p>
      {away.map((p) => {
        const left = Math.max(0, Math.ceil((AWAY_KICK_MS - (p.awayMs! + now - receivedAt)) / 1000));
        return (
          <div key={p.id} className="pause-row">
            <span className="avatar small">
              <Avatar color={p.color} look={p.look} expression="neutral" seed={p.id} />
            </span>
            <span className="pause-who">{t('nameSmokeBreak', { name: p.name })}</span>
            {left > 0 ? (
              <span className="pause-wait">{t('waitSeconds', { n: left })}</span>
            ) : (
              <button type="button" className="btn small" onClick={() => kick(p.id)}>
                {t('playWithout', { name: p.name })}
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="form-error">{error}</p>}
    </motion.div>
  );
}
