import type { CSSProperties } from 'react';
import type { Card, Suit } from '@durak/shared';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export const suitSymbol = (s: Suit) => SUIT_SYMBOL[s];
export const isRed = (s: Suit) => s === 'H' || s === 'D';
const rankLabel = (c: Card) => RANK_LABEL[c.rank] ?? String(c.rank);
export const cardKey = (c: Card) => `${c.rank}${c.suit}`;

// Klassische Anordnung der Symbole: [x %, y %]
const L = 27;
const R = 73;
// prettier-ignore
const PIPS: Record<number, [number, number][]> = {
  6: [[L, 20], [L, 50], [L, 80], [R, 20], [R, 50], [R, 80]],
  7: [[L, 20], [L, 50], [L, 80], [R, 20], [R, 50], [R, 80], [50, 35]],
  8: [[L, 20], [L, 50], [L, 80], [R, 20], [R, 50], [R, 80], [50, 35], [50, 65]],
  9: [[L, 19], [L, 40], [L, 60], [L, 81], [R, 19], [R, 40], [R, 60], [R, 81], [50, 50]],
  10: [[L, 19], [L, 40], [L, 60], [L, 81], [R, 19], [R, 40], [R, 60], [R, 81], [50, 30], [50, 70]],
};

/** Reine Kartenansicht (ohne Interaktion). `mini` = nur Ecke + ein Symbol. */
export function CardFace({ card, mini, style }: { card: Card; mini?: boolean; style?: CSSProperties }) {
  const label = rankLabel(card);
  const sym = SUIT_SYMBOL[card.suit];
  const color = isRed(card.suit) ? 'red' : 'black';
  return (
    <div className={`card face ${color}${mini ? ' mini' : ''}`} style={style} aria-label={`${label} ${sym}`}>
      <span className="corner tl">
        <b>{label}</b>
        <i>{sym}</i>
      </span>
      {!mini && (
        <span className="corner br">
          <b>{label}</b>
          <i>{sym}</i>
        </span>
      )}
      {mini ? (
        <span className="pip-big">{sym}</span>
      ) : card.rank <= 10 ? (
        <span className="pips">
          {PIPS[card.rank].map(([x, y], i) => (
            <i key={i} style={{ left: `${x}%`, top: `${y}%` }} className={y > 50 ? 'flip' : ''}>
              {sym}
            </i>
          ))}
        </span>
      ) : card.rank === 14 ? (
        <span className="pip-ace">{sym}</span>
      ) : (
        <span className="court">
          <b>{label}</b>
          <i>{sym}</i>
        </span>
      )}
    </div>
  );
}

export function CardBack({ mini, style }: { mini?: boolean; style?: CSSProperties }) {
  return <div className={`card back${mini ? ' mini' : ''}`} style={style} />;
}
