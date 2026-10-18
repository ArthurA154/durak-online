import { useState } from 'react';
import type { GameView } from '@durak/shared';
import { Avatar } from './Avatar';
import { t } from './i18n';

const OPEN_KEY = 'durak.leaderboard';

function initialOpen(): boolean {
  try {
    const saved = localStorage.getItem(OPEN_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // ohne Speicher: Standard je nach Bildschirm
  }
  return !window.matchMedia('(max-width: 700px)').matches;
}

/** Durak-Zähler oben links: wer wie oft Durak war, meiste zuerst. */
export function Leaderboard({ view }: { view: GameView }) {
  const [open, setOpen] = useState(initialOpen);
  if (!view.players.some((p) => p.durakCount > 0)) return null;

  const ranking = [...view.players].sort((a, b) => b.durakCount - a.durakCount);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, open ? '0' : '1');
    } catch {
      // egal
    }
  };

  return (
    <div className="leaderboard">
      <button
        type="button"
        className="leaderboard-toggle"
        aria-expanded={open}
        onClick={toggle}
        title={t('durakCounter')}
      >
        <span className="leaderboard-icon">🏆</span>
        <span className="leaderboard-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ol className="leaderboard-list" aria-label={t('durakCounter')}>
          {ranking.map((p) => (
            <li key={p.id} className={p.id === view.you ? 'is-me' : undefined}>
              <span className="avatar tiny">
                <Avatar color={p.color} hat={p.id === view.lastDurakId} seed={p.id} />
              </span>
              <span className="leaderboard-name">{p.name}</span>
              <span className="leaderboard-count">{p.durakCount}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
