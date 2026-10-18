import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import {
  AWAY_KICK_MS,
  beats,
  HAND_SIZE,
  MAX_TABLE,
  sameCard,
  SUITS,
  type Card,
  type GameView,
  type Result,
  type TablePair,
} from '@durak/shared';
import { CardBack, CardFace, cardKey, isRed, suitSymbol } from './CardView';
import { Seat, opponentPositions } from './Seat';
import { Avatar, type Expression } from './Avatar';
import { Confetti } from './Confetti';
import { centerOf, pointOf, seatPoint, useFlyIn, type Point, type RectRegistry } from './fly';
import { call, socket } from './socket';
import { turnInfo } from './turn';
import { useCountdown } from './useCountdown';
import { sfx } from './audio';

/** Leichte, pro Karte feste Schräglage – wie hingeworfen. */
const tilt = (c: Card) => ((c.rank * 7 + SUITS.indexOf(c.suit) * 13) % 11) - 5;

const spring = { type: 'spring', stiffness: 380, damping: 32 } as const;

/** So lange dauert das Mischen, bevor ausgeteilt wird */
const SHUFFLE_MS = 1500;

/**
 * Karten, die gerade vom Tisch verschwunden sind, fliegen als unabhängige Kopie weg
 * (zur Ablage oder zum Spieler, der schluckt). Die echten Tischkarten werden so nie verschoben.
 */
interface Ghost {
  id: number;
  pair: TablePair;
  rect: DOMRect;
  cw: number;
  target: Point | null;
  mode: 'done' | 'took';
}

/** Welche Ablage liegt unter dem Zeiger? (data-drop="table" oder "attack-<i>") */
function dropAt(point: { x: number; y: number }): string | null {
  for (const el of document.elementsFromPoint(point.x - window.scrollX, point.y - window.scrollY)) {
    const zone = (el as HTMLElement).closest?.('[data-drop]') as HTMLElement | null;
    if (zone) return zone.dataset.drop ?? null;
  }
  return null;
}

/** Gesichtsausdruck einer Figur je nach Spielsituation */
function expressionFor(view: GameView, id: string): Expression {
  const p = view.players.find((x) => x.id === id);
  if (view.phase === 'finished') return id === view.durakId ? 'sad' : 'happy';
  if (p?.out) return 'happy';
  if (view.defenderId === id && view.taking) return 'shocked';
  if (view.defenderId === id && view.table.some((t) => !t.defense)) return 'focus';
  return 'neutral';
}

/** Frisch ausgeteilt? (beim ersten Anzeigen des Tisches – nicht nach einem Neuladen mitten im Spiel) */
const isFreshDeal = (v: GameView) =>
  v.phase === 'playing' &&
  v.table.length === 0 &&
  v.discardCount === 0 &&
  v.players.every((p) => p.cardCount === HAND_SIZE);

export function Table({ view }: { view: GameView }) {
  const [selected, setSelected] = useState<Card | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [dealing, setDealing] = useState(false);
  const [bursts, setBursts] = useState<{ id: number; at: Point }[]>([]);
  const [banner, setBanner] = useState('');
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [handW, setHandW] = useState(0);

  // Vorheriger Stand – damit Karten wissen, woher sie kommen
  const prevRef = useRef<GameView | null>(null);
  const prev = prevRef.current;
  useEffect(() => {
    prevRef.current = view;
  });

  const registry = useRef<RectRegistry>(new Map()).current;
  const deckRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  /** Positionen der Tischpaare beim letzten Zeichnen + Kartenbreiten */
  const pairRects = useRef(new Map<string, DOMRect>());
  const tableCw = useRef(70);
  const handCw = useRef(70);

  // Neue Partie → erst mischen, dann austeilen
  const newRound = prev ? prev.round !== view.round : isFreshDeal(view);
  const dealUntil = useRef(0);
  if (newRound) dealUntil.current = Date.now() + SHUFFLE_MS;
  useEffect(() => {
    if (!newRound) return;
    setDealing(true);
    const t = setTimeout(() => setDealing(false), SHUFFLE_MS);
    return () => clearTimeout(t);
  }, [view.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const me = view.you;
  const meInfo = view.players.find((p) => p.id === me);
  const isDefender = view.defenderId === me;
  const isAttacker = view.attackerId === me;
  const finished = view.phase === 'finished';
  const trump = view.trumpSuit!;
  const undefended = view.table.filter((t) => !t.defense).length;
  const allDefended = view.table.length > 0 && undefended === 0;
  const tableRanks = new Set(view.table.flatMap((t) => [t.attack.rank, t.defense?.rank]));
  const turn = turnInfo(view);
  const countdown = useCountdown(view);
  const timedFor = (id: string) => (countdown?.waitingOn.includes(id) ? countdown : null);
  const myCountdown = timedFor(me);

  // Runde auf dem Tisch beendet → Kopien wegfliegen lassen; danach Positionen fürs nächste Mal merken
  const discardGrew = !!prev && view.discardCount > prev.discardCount;
  useLayoutEffect(() => {
    const old = pairRects.current;
    if (prev && prev.round === view.round) {
      const gone = prev.table.filter((t) => !view.table.some((v) => sameCard(v.attack, t.attack)));
      const iTook = !discardGrew && prev.defenderId === me; // dann fliegen sie als Handkarten rein
      if (gone.length && !iTook) {
        const target = discardGrew
          ? discardRef.current
            ? centerOf(discardRef.current.getBoundingClientRect())
            : null
          : seatPoint(prev.defenderId);
        const fresh = gone.flatMap((t): Ghost[] => {
          const rect = old.get(cardKey(t.attack));
          if (!rect) return [];
          const mode = discardGrew ? 'done' : 'took';
          return [{ id: Math.random(), pair: t, rect, cw: tableCw.current, target, mode }];
        });
        if (fresh.length) setGhosts((g) => [...g, ...fresh]);
      }
    }
    const next = new Map<string, DOMRect>();
    document.querySelectorAll<HTMLElement>('.play-area [data-pair]').forEach((el) => {
      next.set(el.dataset.pair!, el.getBoundingClientRect());
    });
    pairRects.current = next;
    const tc = document.querySelector<HTMLElement>('.play-area .card');
    if (tc) tableCw.current = tc.offsetWidth;
    const hc = handRef.current?.querySelector<HTMLElement>('.card');
    if (hc) handCw.current = hc.offsetWidth;
  });

  // Breite der Hand beobachten (für das Auffächern)
  useEffect(() => {
    const el = handRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setHandW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ticken in den letzten 5 Sekunden, wenn ich dran bin
  const tickSecond = myCountdown && myCountdown.seconds <= 5 && myCountdown.seconds > 0 ? myCountdown.seconds : null;
  useEffect(() => {
    if (tickSecond) sfx.tick();
  }, [tickSecond]);

  // Feiern: wer raus ist, bekommt Konfetti
  useEffect(() => {
    if (!prev || prev.round !== view.round) return;
    for (const p of view.players) {
      const before = prev.players.find((x) => x.id === p.id);
      if (!p.out || !before || before.out) continue;
      const at = p.id === me ? pointOf('.me-chip .avatar') : seatPoint(p.id);
      if (at) setBursts((b) => [...b, { id: Math.random(), at }]);
      setBanner(p.id === me ? 'Du bist raus! 🎉' : `${p.name} ist raus! 🎉`);
    }
    if (prev.phase === 'playing' && finished && view.durakId !== me) {
      const at = pointOf('.arena');
      if (at) setBursts((b) => [...b, { id: Math.random(), at }]);
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bursts.length) return;
    const t = setTimeout(() => setBursts((b) => b.slice(1)), 1600);
    return () => clearTimeout(t);
  }, [bursts]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(''), 2200);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (selected && !view.hand.some((c) => sameCard(c, selected))) setSelected(null);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(''), 2800);
    return () => clearTimeout(t);
  }, [error]);

  const send = (fn: (ack: (r: Result) => void) => void) => {
    setError('');
    call(fn)
      .then(() => setSelected(null))
      .catch((e: Error) => setError(e.message));
  };
  const attack = (card: Card) => send((ack) => socket.emit('game:attack', { card }, ack));
  const defend = (card: Card, attackIndex: number) =>
    send((ack) => socket.emit('game:defend', { attackIndex, card }, ack));
  const transfer = (card: Card) => send((ack) => socket.emit('game:transfer', { card }, ack));

  // ---------- Was darf eine Karte gerade? ----------

  const canAttackWith = (c: Card) =>
    !finished &&
    !isDefender &&
    view.table.length < MAX_TABLE &&
    (view.table.length === 0 ? isAttacker : view.throwers.includes(me) && tableRanks.has(c.rank));

  const defendTargets = (c: Card) =>
    !isDefender || view.taking
      ? []
      : view.table.flatMap((t, i) => (!t.defense && beats(t.attack, c, trump) ? [i] : []));

  const canTransferWith = (c: Card) =>
    isDefender &&
    !view.taking &&
    view.table.length > 0 &&
    view.table.length < MAX_TABLE &&
    view.table.every((t) => !t.defense && t.attack.rank === c.rank);

  /** Kann diese Karte jetzt etwas Sinnvolles tun? → in der Hand hervorheben */
  const usable = (c: Card) =>
    !finished && !view.paused && (isDefender ? defendTargets(c).length > 0 || canTransferWith(c) : canAttackWith(c));

  // ---------- Klicken und Ziehen ----------

  const onTap = (card: Card) => {
    if (!usable(card)) return;
    if (!isDefender) return attack(card);
    const targets = defendTargets(card);
    // Eindeutig → sofort schlagen; sonst auswählen und Ziel/Knopf wählen lassen
    if (targets.length === 1 && !canTransferWith(card)) return defend(card, targets[0]);
    setSelected(selected && sameCard(selected, card) ? null : card);
  };

  const onDrop = (card: Card, zone: string | null) => {
    if (!zone) return;
    if (!isDefender) return attack(card);
    if (zone.startsWith('attack-')) return defend(card, Number(zone.slice(7)));
    if (canTransferWith(card)) return transfer(card);
    const targets = defendTargets(card);
    if (targets.length === 1) return defend(card, targets[0]);
    if (targets.length > 1) setError('Zieh die Karte direkt auf die Karte, die du schlagen willst');
  };

  const active = dragging ?? selected;
  const activeTargets = active ? defendTargets(active) : [];
  const activeTransfer = !!active && canTransferWith(active);
  const tableGlows = !!dragging && (isDefender ? activeTransfer : canAttackWith(dragging));

  // ---------- Woher kommen neue Karten? ----------

  const handPoint = () => (handRef.current ? centerOf(handRef.current.getBoundingClientRect()) : null);
  const deckPoint = () => (deckRef.current ? centerOf(deckRef.current.getBoundingClientRect()) : pointOf('.play-area'));
  const fromPlayer = (id: string | null) => (id === me ? handPoint() : (seatPoint(id) ?? pointOf('.felt')));
  /** Wo lag diese Karte beim letzten Zeichnen auf dem Tisch? (für Karten, die ich schlucke) */
  const fromTable = (c: Card): Point | null => {
    for (const t of prev?.table ?? []) {
      const r = pairRects.current.get(cardKey(t.attack));
      if (!r) continue;
      const cw = tableCw.current;
      const ch = cw * 1.42;
      if (sameCard(t.attack, c)) return { x: r.left + cw / 2, y: r.top + ch / 2 };
      if (t.defense && sameCard(t.defense, c)) return { x: r.left + cw * 0.76, y: r.top + cw * 0.24 + ch / 2 };
    }
    return null;
  };
  const fromRegistry = (c: Card) => {
    const r = registry.get(cardKey(c));
    registry.delete(cardKey(c));
    return r ? centerOf(r) : null;
  };

  const opponents = rotateFrom(view.players, me).filter((p) => p.id !== me);
  const positions = opponentPositions(opponents.length);
  const n = view.hand.length;
  // Hand auffächern: ganze Breite nutzen; passt es nicht mehr lesbar, zwei Reihen
  const cw = handCw.current;
  const fitStep = (count: number) => (count <= 1 ? cw : (Math.max(handW, cw * 3) - cw - 16) / (count - 1));
  const twoRows = n > 1 && handW > 0 && fitStep(n) < cw * 0.3;
  const half = Math.ceil(n / 2);
  const handRows = twoRows ? [view.hand.slice(0, half), view.hand.slice(half)] : [view.hand];
  const newInHand = view.hand.filter((c) => !prev?.hand.some((h) => sameCard(h, c)));
  const dealer = view.players.find((p) => p.id === view.dealerId);

  return (
    <main className="game">
      <div className={`arena${dealing ? ' dealing' : ''}`}>
        <div className="felt">
          <div
            className="deck"
            ref={deckRef}
            aria-label={`Stapel: ${view.deckCount} Karten, Trumpf ${suitSymbol(trump)}`}
          >
            {view.trumpCard && (
              <div className="deck-trump">
                <CardFace card={view.trumpCard} mini />
              </div>
            )}
            {view.deckCount > 1 && (
              <div className="deck-stack">
                <CardBack mini />
                <span className="deck-count">{view.deckCount}</span>
              </div>
            )}
            <div className={`trump-only ${isRed(trump) ? 'red' : ''}`} title="Trumpf">
              {suitSymbol(trump)}
            </div>
          </div>

          <div
            className={[
              'play-area',
              view.table.length >= 4 && 'two-rows',
              tableGlows && 'glow',
              hover === 'table' && tableGlows && 'hot',
            ]
              .filter(Boolean)
              .join(' ')}
            data-drop="table"
          >
            {view.table.map((pair, i) => {
              const key = cardKey(pair.attack);
              const isTarget = activeTargets.includes(i);
              return (
                <div key={key} className="pair" data-pair={key}>
                  <FlyCard
                    card={pair.attack}
                    from={() => fromRegistry(pair.attack) ?? fromPlayer(pair.by)}
                    className={['table-card', isTarget && 'target', isTarget && hover === `attack-${i}` && 'hot']
                      .filter(Boolean)
                      .join(' ')}
                    rotate={tilt(pair.attack)}
                    drop={pair.defense ? undefined : `attack-${i}`}
                    onClick={() => isTarget && selected && defend(selected, i)}
                  />
                  {pair.defense && (
                    <FlyCard
                      card={pair.defense}
                      from={() => fromRegistry(pair.defense!) ?? fromPlayer(view.defenderId)}
                      className="table-card defense"
                      rotate={tilt(pair.defense) + 14}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="discard" ref={discardRef} aria-label={`Ablage: ${view.discardCount} Karten`}>
            {view.discardCount > 0 &&
              [0, 1, 2]
                .slice(0, Math.min(3, Math.ceil(view.discardCount / 6)))
                .map((i) => <CardBack key={i} mini style={{ transform: `rotate(${-28 + i * 22}deg)` }} />)}
          </div>

          <AnimatePresence>
            {dealing && (
              <motion.div className="shuffle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="shuffle-deck" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <CardBack key={`l${i}`} style={{ '--k': i } as CSSProperties} />
                  ))}
                  {[0, 1, 2, 3].map((i) => (
                    <CardBack key={`r${i}`} style={{ '--k': i } as CSSProperties} />
                  ))}
                </div>
                <p className="shuffle-text">
                  {!dealer
                    ? 'Es wird gemischt …'
                    : dealer.id === me
                      ? 'Du warst der Durak – du mischst!'
                      : `${dealer.name} war der Durak und muss mischen`}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>{view.paused && !finished && <PauseOverlay view={view} />}</AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.p
                className="toast"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                role="alert"
              >
                {error}
              </motion.p>
            )}
            {banner && !error && (
              <motion.p
                key={banner}
                className="toast celebrate"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                role="status"
              >
                {banner}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {opponents.map((p, i) => (
          <Seat
            key={p.id}
            pos={positions[i]}
            id={p.id}
            name={p.name}
            color={p.color}
            expression={expressionFor(view, p.id)}
            hat={p.id === view.lastDurakId}
            role={p.id === view.attackerId ? 'attacker' : p.id === view.defenderId ? 'defender' : null}
            done={view.passed.includes(p.id)}
            offline={!p.connected}
            out={p.out}
            cardCount={p.cardCount}
            countdown={timedFor(p.id)}
            note={
              p.out
                ? 'raus'
                : !p.connected
                  ? 'Raucherpause 🚬'
                  : p.id === view.attackerId
                    ? 'greift an'
                    : p.id === view.defenderId
                      ? view.taking
                        ? 'schluckt'
                        : 'verteidigt'
                      : undefined
            }
          />
        ))}

        {finished && <Finished view={view} />}
      </div>

      <section className={`me${turn.mine ? ' my-turn' : ''}`}>
        <div className="me-bar">
          <div className={`me-chip${isAttacker ? ' is-attacker' : ''}${isDefender ? ' is-defender' : ''}`} data-seat={me}>
            <span className="avatar small">
              <Avatar
                color={meInfo?.color ?? 0}
                expression={expressionFor(view, me)}
                hat={me === view.lastDurakId}
                seed={me}
              />
            </span>
            {meInfo?.name}
          </div>
          {myCountdown ? (
            <p className="turn-text my-timer" role="timer">
              <span className="my-timer-num">{myCountdown.seconds}</span>
              {view.table.length === 0
                ? 'Sekunden – sonst wird deine kleinste Karte gespielt'
                : isDefender
                  ? 'Sekunden – sonst schluckst du'
                  : 'Sekunden – sonst bist du fertig'}
            </p>
          ) : (
            <p className="turn-text" aria-live="polite">
              {dealing ? '' : view.paused ? 'Pause – warte, bis alle wieder da sind' : turn.text}
            </p>
          )}
          {!finished && (
            <div className="actions">
              {isDefender && selected && activeTransfer && (
                <button type="button" className="btn" onClick={() => transfer(selected)}>
                  Weiterschieben
                </button>
              )}
              {isDefender && view.table.length > 0 && !view.taking && !allDefended && (
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => send((ack) => socket.emit('game:take', ack))}
                >
                  Schlucken
                </button>
              )}
              {!isDefender &&
                view.throwers.includes(me) &&
                view.table.length > 0 &&
                (allDefended || view.taking) &&
                !view.passed.includes(me) &&
                n > 0 && (
                  <button type="button" className="btn" onClick={() => send((ack) => socket.emit('game:pass', ack))}>
                    Fertig
                  </button>
                )}
            </div>
          )}
        </div>

        {myCountdown && (
          <div className="hand-timer" aria-hidden="true">
            <i style={{ transform: `scaleX(${myCountdown.fraction})` }} />
          </div>
        )}
        <div className={`hand${twoRows ? ' two-rows' : ''}`} ref={handRef}>
          {handRows.map((row, r) => (
            <div className="hand-row" key={r}>
              {row.map((card, i) => {
                const len = row.length;
                const u = len > 1 ? (i - (len - 1) / 2) / ((len - 1) / 2) : 0; // −1 … 1
                const maxRot = len <= 8 ? Math.min(12, 2.2 * len) : Math.max(3, 12 - (len - 8) * 0.6);
                const step = Math.min(cw * 0.78, Math.max(cw * 0.3, fitStep(len)));
                const isSel = !!selected && sameCard(selected, card);
                const canUse = usable(card);
                const dip = u * u * maxRot * 1.3;
                const lift = isSel ? -34 : canUse ? -14 : 0;
                const wait = Math.max(0, dealUntil.current - Date.now());
                const newIdx = newInHand.findIndex((c) => sameCard(c, card));
                return (
                  <FlySlot
                    key={cardKey(card)}
                    className={`hand-slot${isSel || (dragging && sameCard(dragging, card)) ? ' is-selected' : ''}`}
                    style={{ zIndex: i + 1, marginLeft: i === 0 ? 0 : step - cw }}
                    from={() => fromTable(card) ?? deckPoint()}
                    delay={wait + Math.max(0, newIdx) * 80}
                    fade={wait > 0}
                    registry={registry}
                    registryKey={cardKey(card)}
                  >
                    <motion.div
                      className={`hand-card${canUse ? ' usable' : ''}${isSel ? ' selected' : ''}`}
                      animate={{ y: dip + lift, rotate: u * maxRot }}
                      whileHover={canUse && !isSel ? { y: dip + lift - 12 } : undefined}
                      transition={spring}
                      drag={canUse}
                      dragSnapToOrigin
                      whileDrag={{ scale: 1.1, rotate: 0, zIndex: 100 }}
                      onDragStart={() => {
                        setDragging(card);
                        setSelected(null);
                      }}
                      onDrag={(_, info: PanInfo) => setHover(dropAt(info.point))}
                      onDragEnd={(_, info: PanInfo) => {
                        const zone = dropAt(info.point);
                        setDragging(null);
                        setHover(null);
                        onDrop(card, zone);
                      }}
                      onTap={() => onTap(card)}
                      role="button"
                      tabIndex={canUse ? 0 : -1}
                      aria-disabled={!canUse}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onTap(card);
                        }
                      }}
                    >
                      <CardFace card={card} />
                    </motion.div>
                  </FlySlot>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {ghosts.map((g) => (
        <GhostPair key={g.id} ghost={g} onDone={() => setGhosts((all) => all.filter((x) => x.id !== g.id))} />
      ))}
      {bursts.map((b) => (
        <Confetti key={b.id} at={b.at} />
      ))}
    </main>
  );
}

/** Kopie eines Tischpaars, die zur Ablage oder zum schluckenden Spieler fliegt und dann verschwindet. */
function GhostPair({ ghost, onDone }: { ghost: Ghost; onDone: () => void }) {
  const { pair, rect, cw, mode } = ghost;
  const from = centerOf(rect);
  const to = ghost.target ?? { x: from.x, y: from.y - 140 };
  return (
    <motion.div
      className="pair ghost"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height, ['--cw' as string]: `${cw}px` }}
      initial={{ x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }}
      animate={{
        x: to.x - from.x,
        y: to.y - from.y,
        scale: mode === 'done' ? 0.45 : 0.3,
        rotate: mode === 'done' ? 35 : 0,
        opacity: 0,
      }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.6, 1] }}
      onAnimationComplete={onDone}
      aria-hidden="true"
    >
      <div className="table-card">
        <div className="table-card-tilt" style={{ transform: `rotate(${tilt(pair.attack)}deg)` }}>
          <CardFace card={pair.attack} />
        </div>
      </div>
      {pair.defense && (
        <div className="table-card defense">
          <div className="table-card-tilt" style={{ transform: `rotate(${tilt(pair.defense) + 14}deg)` }}>
            <CardFace card={pair.defense} />
          </div>
        </div>
      )}
    </motion.div>
  );
}

/** Ein Element, das beim Erscheinen von `from` an seinen Platz fliegt. */
function FlySlot(props: {
  from: () => Point | null;
  className: string;
  style?: CSSProperties;
  delay?: number;
  fade?: boolean;
  registry?: RectRegistry;
  registryKey?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFlyIn(ref, props.from, {
    delay: props.delay,
    fade: props.fade,
    registry: props.registry,
    registryKey: props.registryKey,
  });
  return (
    <div ref={ref} className={props.className} style={props.style}>
      {props.children}
    </div>
  );
}

/** Karte auf dem Tisch */
function FlyCard(props: {
  card: Card;
  from: () => Point | null;
  className: string;
  rotate: number;
  drop?: string;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFlyIn(ref, props.from);
  return (
    <div
      ref={ref}
      className={props.className}
      data-drop={props.drop}
      data-table-card={cardKey(props.card)}
      onClick={props.onClick}
    >
      <div className="table-card-tilt" style={{ transform: `rotate(${props.rotate}deg)` }}>
        <CardFace card={props.card} />
      </div>
    </div>
  );
}

function Finished({ view }: { view: GameView }) {
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
          {!durak ? 'Unentschieden' : durak.id === view.you ? 'Du bist der' : `${durak.name} ist der`}
        </p>
        <h2 className="result-word">{durak ? 'Дурак' : 'Ничья'}</h2>
      </motion.div>

      <ul className="scoreboard" aria-label="Durak-Zähler">
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
          Noch ein Spiel!
        </button>
      ) : (
        <p className="result-wait">Der Gastgeber kann eine neue Runde starten.</p>
      )}
    </motion.div>
  );
}

function rotateFrom<T extends { id: string }>(list: T[], id: string): T[] {
  const i = list.findIndex((x) => x.id === id);
  return i < 0 ? list : [...list.slice(i), ...list.slice(0, i)];
}

/** Pause, solange jemand getrennt ist; nach AWAY_KICK_MS kann man ohne ihn weiterspielen. */
function PauseOverlay({ view }: { view: GameView }) {
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
      <p className="pause-title">Pause</p>
      {away.map((p) => {
        const left = Math.max(0, Math.ceil((AWAY_KICK_MS - (p.awayMs! + now - receivedAt)) / 1000));
        return (
          <div key={p.id} className="pause-row">
            <span className="avatar small">
              <Avatar color={p.color} expression="neutral" seed={p.id} />
            </span>
            <span className="pause-who">{p.name} macht Raucherpause 🚬</span>
            {left > 0 ? (
              <span className="pause-wait">Noch {left} s</span>
            ) : (
              <button type="button" className="btn small" onClick={() => kick(p.id)}>
                Ohne {p.name} weiterspielen
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="form-error">{error}</p>}
    </motion.div>
  );
}
