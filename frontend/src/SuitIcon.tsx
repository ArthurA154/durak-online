import type { Suit } from '@durak/shared';

/* Kartenfarben als eigene Zeichnung statt Schriftzeichen – bleibt in jeder Größe scharf.
   Kreuz = drei runde Blätter, Pik = spitze Form; so sind die beiden auch klein gut zu unterscheiden. */

const SPADE =
  'M50 3C61 21 97 39 97 62C97 76 86 85 74 85C65 85 58 80 54 73C55 83 59 90 67 97H33C41 90 45 83 46 73C42 80 35 85 26 85C14 85 3 76 3 62C3 39 39 21 50 3Z';
const HEART =
  'M50 92C24 70 3 52 3 31C3 15 15 4 29 4C39 4 46 10 50 18C54 10 61 4 71 4C85 4 97 15 97 31C97 52 76 70 50 92Z';
const DIAMOND = 'M50 2Q69 30 90 50Q69 70 50 98Q31 70 10 50Q31 30 50 2Z';
const CLUB_STEM = 'M46 58C45 76 41 88 31 97H69C59 88 55 76 54 58Z';

export function SuitIcon({ suit, className = 'suit' }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {suit === 'C' ? (
        <>
          <circle cx="50" cy="27" r="22" />
          <circle cx="25" cy="58" r="22" />
          <circle cx="75" cy="58" r="22" />
          <circle cx="50" cy="50" r="12" />
          <path d={CLUB_STEM} />
        </>
      ) : (
        <path d={suit === 'S' ? SPADE : suit === 'H' ? HEART : DIAMOND} />
      )}
    </svg>
  );
}
