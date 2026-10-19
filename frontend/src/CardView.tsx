import type { CSSProperties } from 'react';
import type { Card, Suit } from '@durak/shared';
import { SuitIcon } from './SuitIcon';

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

/** Farbe als Schriftzeichen – nur noch für Texte (z. B. aria-label), auf Karten gezeichnet */
export const suitSymbol = (s: Suit) => SUIT_SYMBOL[s];
export const isRed = (s: Suit) => s === 'H' || s === 'D';
const rankLabel = (c: Card) => RANK_LABEL[c.rank] ?? String(c.rank);
export const cardKey = (c: Card) => `${c.rank}${c.suit}`;

/** Reine Kartenansicht (ohne Interaktion). Große Ecke, in der Mitte ein Symbol. `mini` = nur Wert + Symbol. */
export function CardFace({ card, mini, style }: { card: Card; mini?: boolean; style?: CSSProperties }) {
  const label = rankLabel(card);
  const color = isRed(card.suit) ? 'red' : 'black';
  const corner = (pos: 'tl' | 'br') => (
    <span className={`corner ${pos}`}>
      <b className={label === '10' ? 'ten' : undefined}>{label}</b>
      <SuitIcon suit={card.suit} />
    </span>
  );
  return (
    <div
      className={`card face ${color}${mini ? ' mini' : ''}`}
      style={style}
      aria-label={`${label} ${SUIT_SYMBOL[card.suit]}`}
    >
      {corner('tl')}
      {!mini && corner('br')}
      {mini ? (
        <SuitIcon suit={card.suit} className="suit pip-big" />
      ) : card.rank > 10 && card.rank < 14 ? (
        <span className="court">
          <SuitIcon suit={card.suit} />
        </span>
      ) : (
        <SuitIcon suit={card.suit} className="suit pip-center" />
      )}
    </div>
  );
}

export function CardBack({ mini, style }: { mini?: boolean; style?: CSSProperties }) {
  return <div className={`card back${mini ? ' mini' : ''}`} style={style} />;
}
