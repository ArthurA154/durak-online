import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ThrowEvent, ThrowItem } from '@durak/shared';
import { call, socket } from './socket';
import { onMessage, onThrow } from './social';
import { sfx, unlockAudio } from './audio';

// Alles, was über dem Tisch „schwebt“: Sprechblasen, das Wurf-Menü, fliegende Sachen und Treffer.
// Liegt als eigene Ebene über allem und sucht die Figuren über [data-seat="<id>"] .avatar –
// so müssen Lobby und Tisch nichts davon wissen.

export const ITEMS: { item: ThrowItem; emoji: string; label: string }[] = [
  { item: 'tomato', emoji: '🍅', label: 'Tomate' },
  { item: 'egg', emoji: '🥚', label: 'Ei' },
  { item: 'slipper', emoji: '🥿', label: 'Hausschuh' },
  { item: 'fish', emoji: '🐟', label: 'Fisch' },
  { item: 'flowers', emoji: '💐', label: 'Blumen' },
];

const emojiOf = (item: ThrowItem) => ITEMS.find((i) => i.item === item)?.emoji ?? '🍅';

const BUBBLE_MS = 4000;
const HIT_MS = 2600;
const FLY_MS = 650;

function avatarOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-seat="${CSS.escape(id)}"] .avatar`);
}

function avatarRect(id: string): DOMRect | null {
  const r = avatarOf(id)?.getBoundingClientRect();
  return r && r.width ? r : null;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Bubble {
  key: number;
  from: string;
  text: string;
}

interface Hit {
  key: number;
  to: string;
  item: ThrowItem;
}

interface Menu {
  to: string;
  name: string;
  rect: DOMRect;
}

export function FxLayer({ me }: { me: string }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [toast, setToast] = useState<{ text: string; x: number; y: number } | null>(null);
  const [, redraw] = useState(0);
  const layerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sprechblasen
  useEffect(
    () =>
      onMessage((m) => {
        if (m.from !== me) sfx.chat();
        // pro Spieler nur eine Blase – die neue ersetzt die alte
        setBubbles((b) => [...b.filter((x) => x.from !== m.from), { key: m.id, from: m.from, text: m.text }]);
        setTimeout(() => setBubbles((b) => b.filter((x) => x.key !== m.id)), BUBBLE_MS);
      }),
    [me],
  );

  // Würfe: fliegen im Bogen vom Werfer zum Ziel, dann Treffer-Effekt
  useEffect(
    () =>
      onThrow((t: ThrowEvent) => {
        const land = () => {
          sfx.hit(t.item);
          setHits((h) => [...h, { key: t.id, to: t.to, item: t.item }]);
          setTimeout(() => setHits((h) => h.filter((x) => x.key !== t.id)), HIT_MS);
        };
        const target = avatarRect(t.to);
        const layer = layerRef.current;
        if (!target || !layer || reducedMotion()) return land();
        const fromRect = avatarRect(t.from);
        const sx = fromRect ? fromRect.left + fromRect.width / 2 : window.innerWidth / 2;
        const sy = fromRect ? fromRect.top + fromRect.height / 2 : window.innerHeight + 30;
        const tx = target.left + target.width / 2;
        const ty = target.top + target.height / 2;
        const lift = 80 + Math.hypot(tx - sx, ty - sy) * 0.25;
        const spin = (tx > sx ? 1 : -1) * 540;

        const el = document.createElement('span');
        el.className = 'fx-projectile';
        el.textContent = emojiOf(t.item);
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
        layer.append(el);
        const frames = Array.from({ length: 13 }, (_, i) => {
          const p = i / 12;
          const x = (tx - sx) * p;
          const y = (ty - sy) * p - lift * 4 * p * (1 - p);
          return { transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${spin * p}deg) scale(${1 + 0.4 * Math.sin(Math.PI * p)})` };
        });
        sfx.whoosh();
        const anim = el.animate(frames, { duration: FLY_MS, easing: 'linear' });
        anim.onfinish = () => {
          el.remove();
          land();
        };
      }),
    [],
  );

  // Positionen nachführen, solange etwas angezeigt wird (Fenstergröße, Layout)
  const active = bubbles.length + hits.length > 0 || !!menu;
  useEffect(() => {
    if (!active) return;
    const tick = () => redraw((n) => n + 1);
    const id = setInterval(tick, 250);
    window.addEventListener('resize', tick);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', tick);
    };
  }, [active]);

  // Tipp auf eine fremde Figur → Wurf-Menü
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const avatar = target.closest?.('.avatar');
      const seat = avatar?.closest<HTMLElement>('[data-seat]');
      const id = seat?.dataset.seat;
      if (!avatar || !seat || !id || id === me) return;
      const name = seat.querySelector('.seat-name')?.textContent ?? '';
      unlockAudio();
      setMenu((m) => (m?.to === id ? null : { to: id, name, rect: avatar.getBoundingClientRect() }));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [me]);

  // Menü schließen: Escape oder Klick daneben
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (menuRef.current?.contains(t) || t.closest?.('[data-seat] .avatar')) return;
      setMenu(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menu]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  const throwAt = (to: string, item: ThrowItem, at: { x: number; y: number }) => {
    setMenu(null);
    call((ack) => socket.emit('throw', { to, item }, ack)).catch((e: Error) => setToast({ text: e.message, ...at }));
  };

  const vw = window.innerWidth;

  return (
    <div ref={layerRef} className="fx-layer" aria-hidden={!menu}>
      {bubbles.map((b) => {
        const r = avatarRect(b.from);
        if (!r) return null;
        const cx = r.left + r.width / 2;
        // Blase im Bild halten (Breite grob aus der Textlänge), Spitze zeigt trotzdem auf die Figur
        const half = Math.min(200, 26 + b.text.length * 8.5) / 2;
        const x = Math.min(Math.max(cx, 12 + half), vw - 12 - half);
        const tail = Math.min(Math.max(cx - x, -(half - 14)), half - 14);
        const below = r.top < 130;
        const style = {
          left: x,
          top: below ? r.bottom + 10 : r.top - 10,
          '--tail': `${tail}px`,
        } as CSSProperties;
        return (
          <div key={b.key} className={`fx-bubble${below ? ' below' : ''}`} style={style}>
            {b.text}
          </div>
        );
      })}

      {hits.map((h) => {
        const r = avatarRect(h.to);
        if (!r) return null;
        return (
          <div
            key={h.key}
            className={`fx-hit hit-${h.item}`}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
          >
            <HitEffect item={h.item} />
          </div>
        );
      })}

      {menu && (
        <div
          ref={menuRef}
          className={`throw-menu${menu.rect.top < 170 ? ' below' : ''}`}
          role="menu"
          aria-label={`Etwas auf ${menu.name || 'den Spieler'} werfen`}
          style={{
            left: Math.min(Math.max(menu.rect.left + menu.rect.width / 2, 140), vw - 140),
            top: menu.rect.top < 170 ? menu.rect.bottom + 10 : menu.rect.top - 10,
          }}
        >
          {menu.name && <p className="throw-title">Auf {menu.name} werfen</p>}
          <div className="throw-items">
            {ITEMS.map((i) => (
              <button
                key={i.item}
                type="button"
                role="menuitem"
                title={i.label}
                aria-label={i.label}
                onClick={(e) => throwAt(menu.to, i.item, { x: e.clientX, y: e.clientY })}
              >
                {i.emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <p className="fx-toast" role="alert" style={{ left: Math.min(Math.max(toast.x, 90), vw - 90), top: toast.y }}>
          {toast.text}
        </p>
      )}
    </div>
  );
}

/** Unregelmäßiger Klecks (immer gleich, damit er nicht bei jedem Neuzeichnen springt) */
const SPLAT = (() => {
  const pts = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const r = i % 2 ? 30 + ((i * 7) % 5) * 2 : 44 + ((i * 3) % 4) * 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join('L')}Z`;
})();

function HitEffect({ item }: { item: ThrowItem }) {
  switch (item) {
    case 'tomato':
      return (
        <>
          <svg viewBox="0 0 100 100" className="splat">
            <path d={SPLAT} fill="#e8322b" />
            <circle cx="40" cy="44" r="3" fill="#ffd8a8" />
            <circle cx="58" cy="54" r="3" fill="#ffd8a8" />
            <circle cx="50" cy="38" r="2.5" fill="#ffd8a8" />
          </svg>
          <span className="drip" style={{ left: '38%' }} />
          <span className="drip" style={{ left: '60%', animationDelay: '0.3s' }} />
        </>
      );
    case 'egg':
      return (
        <svg viewBox="0 0 100 100" className="splat slide">
          <path d={SPLAT} fill="#fffdf4" />
          <circle cx="52" cy="50" r="17" fill="#ffc21a" />
          <ellipse cx="46" cy="45" rx="5" ry="3" fill="#fff" opacity="0.6" />
        </svg>
      );
    case 'slipper':
      return (
        <>
          <span className="bounce-off">🥿</span>
          <span className="stars">
            <i>⭐</i>
            <i>✨</i>
            <i>⭐</i>
          </span>
        </>
      );
    case 'flowers':
      return (
        <>
          <span className="flowers">💐</span>
          <span className="hearts">
            <i>❤️</i>
            <i>💕</i>
            <i>❤️</i>
          </span>
        </>
      );
    case 'fish':
      return (
        <>
          <span className="fish">🐟</span>
          <span className="drops">
            <i>💦</i>
            <i>💦</i>
          </span>
        </>
      );
  }
}
