import { motion } from 'framer-motion';
import type { GameView } from '@durak/shared';
import { Avatar } from './Avatar';
import { call, socket } from './socket';
import { t } from './i18n';

/** Ergebnis einer Partie: wer ist der Durak, Rangliste, „Noch ein Spiel!“ */
export function Finished({ view }: { view: GameView }) {
  const isHost = view.hostId === view.you;
  const restart = () => call((ack) => socket.emit('game:start', ack)).catch(() => undefined);
  const durak = view.players.find((p) => p.id === view.durakId);
  const ranking = [...view.players].sort((a, b) => b.durakCount - a.durakCount);
  return (
    <motion.div className="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {durak && (
        <motion.div
          className="result-figure"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}
        >
          <Avatar color={durak.color} expression="sad" hat seed={durak.id} />
        </motion.div>
      )}
      <motion.div
        className="result-inner"
        initial={{ scale: 2.2, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: -3 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.35 }}
      >
        <p className="result-who">
          {!durak ? t('draw') : durak.id === view.you ? t('youAreThe') : t('nameIsThe', { name: durak.name })}
        </p>
        <h2 className="result-word">{durak ? 'Дурак' : 'Ничья'}</h2>
      </motion.div>

      <ul className="scoreboard" aria-label={t('durakCounter')}>
        {ranking.map((p) => (
          <li key={p.id}>
            <span className="avatar small">
              <Avatar color={p.color} expression={p.id === view.durakId ? 'sad' : 'happy'} seed={p.id} />
            </span>
            <span className="score-name">{p.name}</span>
            <span className="score-count">🃏 {p.durakCount}</span>
          </li>
        ))}
      </ul>

      {isHost ? (
        <button type="button" className="btn" onClick={restart}>
          {t('oneMoreGame')}
        </button>
      ) : (
        <p className="result-wait">{t('hostCanRestart')}</p>
      )}
    </motion.div>
  );
}
