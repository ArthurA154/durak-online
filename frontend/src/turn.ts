import type { GameView } from '@durak/shared';

export const nameOf = (view: GameView, id: string | null) =>
  view.players.find((p) => p.id === id)?.name ?? '?';

/** Wer ist gerade dran und was ist zu tun? `mine` = ich muss etwas machen. */
export function turnInfo(view: GameView): { text: string; mine: boolean } {
  const me = view.you;
  const name = (id: string | null) => nameOf(view, id);
  const isDefender = view.defenderId === me;
  if (view.phase !== 'playing') return { text: '', mine: false };
  if (view.players.find((p) => p.id === me)?.out) {
    return { text: 'Du bist kein Durak! Schau zu, wer es wird.', mine: false };
  }

  if (view.table.length === 0) {
    return view.attackerId === me
      ? { text: 'Du greifst an: Zieh eine Karte auf den Tisch.', mine: true }
      : { text: `${name(view.attackerId)} greift an${isDefender ? ' – du verteidigst gleich' : ''} …`, mine: false };
  }
  if (view.taking) {
    if (isDefender) return { text: 'Du schluckst. Die anderen dürfen noch passende Karten nachlegen …', mine: false };
    return view.passed.includes(me)
      ? { text: `${name(view.defenderId)} schluckt – warte auf die anderen …`, mine: false }
      : { text: `${name(view.defenderId)} schluckt. Leg passende Karten nach oder drück „Fertig“.`, mine: true };
  }
  if (view.table.some((t) => !t.defense)) {
    return isDefender
      ? { text: 'Du verteidigst: Zieh eine Karte auf die Karte, die du schlagen willst.', mine: true }
      : { text: `${name(view.defenderId)} verteidigt …`, mine: false };
  }
  if (isDefender) return { text: 'Alles geschlagen – warte, ob nachgelegt wird …', mine: false };
  return view.passed.includes(me)
    ? { text: 'Warte auf die anderen …', mine: false }
    : { text: 'Alles geschlagen. Leg passende Karten nach oder drück „Fertig“.', mine: true };
}
