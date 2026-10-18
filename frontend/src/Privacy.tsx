import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '@durak/shared';
import { getLang, t } from './i18n';

const REPO = 'https://github.com/ArthurA154/durak-online';
const GITHUB_PRIVACY = 'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement';

/** „Datenschutz · GitHub“ – auf der Startseite und im Einstellungs-Menü */
export function FooterLinks() {
  const [open, setOpen] = useState(false);
  return (
    <p className="footer-links">
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        {t('privacy')}
      </button>
      <span aria-hidden="true">·</span>
      <a href={REPO} target="_blank" rel="noreferrer">
        {t('sourceCode')}
      </a>
      {open && <PrivacyDialog onClose={() => setOpen(false)} />}
    </p>
  );
}

function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Fokus auf den Text (nicht auf „Schließen“ ganz unten) – sonst öffnet er schon heruntergescrollt
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="confirm-backdrop" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className="privacy"
        role="dialog"
        aria-modal="true"
        aria-label={t('privacy')}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {TEXT[getLang()]}
        <button type="button" className="btn" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}

const repoLink = (label: ReactNode) => (
  <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
    {label}
  </a>
);
const githubLink = (label: ReactNode) => (
  <a href={GITHUB_PRIVACY} target="_blank" rel="noreferrer">
    {label}
  </a>
);

// Bewusst knapp: nur das Nötigste.
const TEXT: Record<Lang, ReactNode> = {
  de: (
    <>
      <h2>Datenschutz</h2>
      <p>Privates Hobbyprojekt ohne Werbung, Cookies oder Tracking. Kontakt über {repoLink('GitHub')}.</p>
      <p>
        Name, Spielstand und Chat liegen nur kurz im Arbeitsspeicher des Spielservers. Chat-Nachrichten werden nicht
        gespeichert. Die letzten 100 Spiele werden mit Spielernamen und Ergebnis aufbewahrt.
      </p>
      <p>Dein Browser merkt sich Name und Einstellungen, damit du sie nicht jedes Mal neu eingeben musst.</p>
      <p>Die Seite liegt bei GitHub Pages – siehe {githubLink('Datenschutzerklärung von GitHub')}.</p>
    </>
  ),
  en: (
    <>
      <h2>Privacy</h2>
      <p>Private hobby project without ads, cookies or tracking. Contact via {repoLink('GitHub')}.</p>
      <p>
        Name, game state and chat are only kept briefly in the game server's memory. Chat messages are not stored. The
        last 100 games are kept with player names and result.
      </p>
      <p>Your browser remembers your name and settings so you don't have to enter them every time.</p>
      <p>The site is hosted on GitHub Pages – see {githubLink("GitHub's privacy statement")}.</p>
    </>
  ),
  ru: (
    <>
      <h2>Конфиденциальность</h2>
      <p>Частный проект без рекламы, cookies и отслеживания. Связь через {repoLink('GitHub')}.</p>
      <p>
        Имя, ход игры и чат лишь недолго хранятся в памяти игрового сервера. Сообщения чата не сохраняются. Последние
        100 игр хранятся с именами игроков и результатом.
      </p>
      <p>Браузер запоминает имя и настройки, чтобы их не вводить каждый раз.</p>
      <p>Сайт размещён на GitHub Pages – см. {githubLink('политику конфиденциальности GitHub')}.</p>
    </>
  ),
};
