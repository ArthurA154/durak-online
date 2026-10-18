import type { GameView } from '@durak/shared';
import { t } from './i18n';

const nameOf = (view: GameView, id: string | null) => view.players.find((p) => p.id === id)?.name ?? '?';

/** Wer ist gerade dran und was ist zu tun? `mine` = ich muss etwas machen. */
export function turnInfo(view: GameView): { text: string; mine: boolean } {
  const me = view.you;
  const name = (id: string | null) => nameOf(view, id);
  const isDefender = view.defenderId === me;
  if (view.phase !== 'playing') return { text: '', mine: false };
  if (view.players.find((p) => p.id === me)?.out) {
    return { text: t('turnOut'), mine: false };
  }

  if (view.table.length === 0) {
    return view.attackerId === me
      ? { text: t('turnYouAttack'), mine: true }
      : {
          text: t(isDefender ? 'turnNameAttacksYouNext' : 'turnNameAttacks', { name: name(view.attackerId) }),
          mine: false,
        };
  }
  // „Nur Nachbarn“: wer gegenüber sitzt, schaut bei dieser Runde nur zu
  const sidelined = !isDefender && !view.throwers.includes(me);
  // Keine Karten mehr (Stapel noch nicht leer): nichts nachzulegen, nur warten
  const waiting = view.passed.includes(me) || view.hand.length === 0;
  if (view.taking) {
    if (isDefender) return { text: t('turnYouTake'), mine: false };
    if (sidelined) return { text: t('turnTakesNeighbors', { name: name(view.defenderId) }), mine: false };
    return waiting
      ? { text: t('turnTakesWait', { name: name(view.defenderId) }), mine: false }
      : { text: t('turnTakesThrowIn', { name: name(view.defenderId) }), mine: true };
  }
  if (view.table.some((t) => !t.defense)) {
    return isDefender
      ? { text: t('turnYouDefend'), mine: true }
      : { text: t('turnNameDefends', { name: name(view.defenderId) }), mine: false };
  }
  if (isDefender) return { text: t('turnAllBeatenWait'), mine: false };
  if (sidelined) return { text: t('turnAllBeatenNeighbors'), mine: false };
  return waiting ? { text: t('turnWaitOthers'), mine: false } : { text: t('turnAllBeatenThrowIn'), mine: true };
}
