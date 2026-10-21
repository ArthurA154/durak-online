import type { ReactNode } from 'react';
import { LANGS } from '@durak/shared';
import { Popover } from './Popover';
import { VolumeSliders } from './Volume';
import { THEME_IDS, ThemePreview, setTheme, useTheme } from './Theme';
import { LANG_NAMES, getLang, setLang, t, type Key } from './i18n';
import { FooterLinks } from './Privacy';
import { setHandSort, useHandSort, type HandSort } from './handSort';
import { CARD_BACKS, backVars, setCardBack, useCardBack } from './cardBack';

const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
    <path
      d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.4-2.5a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const Chevron = ({ left }: { left?: boolean }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path
      d={left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SORTS: { value: HandSort; label: Key }[] = [
  { value: 'rank', label: 'sortRank' },
  { value: 'suit', label: 'sortSuit' },
  { value: 'custom', label: 'sortCustom' },
];

/**
 * ⚙️ in der Kopfleiste – alles nur für dieses Gerät. Lautstärke als Regler, der Rest zum Durchtippen:
 * jede Zeile zeigt den aktuellen Wert, ‹ › (oder Tipp auf den Wert) wechselt sofort.
 */
export function Settings() {
  const { mode } = useHandSort();
  const back = useCardBack();
  const theme = useTheme();
  return (
    <Popover icon={<GearIcon />} label={t('settings')} className="settings-panel">
      <section className="settings-section">
        <h3>{t('volume')}</h3>
        <VolumeSliders />
      </section>
      <div className="settings-list">
        <CycleRow
          label={t('language')}
          value={getLang()}
          options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
          onChange={setLang}
        />
        <CycleRow
          label={t('handSort')}
          value={mode}
          options={SORTS.map((s) => ({ value: s.value, label: t(s.label) }))}
          onChange={setHandSort}
        />
        <CycleRow
          label={t('cardBack')}
          value={back}
          options={CARD_BACKS.map((b, i) => ({
            value: b.id,
            label: <span className="card back" style={backVars(b)} aria-label={t('cardBackN', { n: i + 1 })} />,
          }))}
          onChange={setCardBack}
        />
        <CycleRow
          label={t('background')}
          value={theme}
          options={THEME_IDS.map((id) => ({
            value: id,
            label: (
              <>
                <ThemePreview id={id} />
                {t(`theme.${id}` as Key)}
              </>
            ),
          }))}
          onChange={setTheme}
        />
      </div>
      {mode === 'custom' && <p className="settings-hint">{t('sortCustomHint')}</p>}
      <FooterLinks />
    </Popover>
  );
}

/** Eine Einstellung zum Durchtippen: Beschriftung links, ‹ Wert › rechts (läuft im Kreis) */
function CycleRow<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const { options } = props;
  const i = Math.max(
    0,
    options.findIndex((o) => o.value === props.value),
  );
  const step = (d: number) => props.onChange(options[(i + d + options.length) % options.length].value);
  return (
    <div className="cycle-row" role="group" aria-label={props.label}>
      <span className="cycle-label">{props.label}</span>
      <div className="cycle">
        <button type="button" className="cycle-arrow" onClick={() => step(-1)} aria-label={t('previous')}>
          <Chevron left />
        </button>
        <button type="button" className="cycle-value" onClick={() => step(1)} aria-live="polite">
          {options[i].label}
        </button>
        <button type="button" className="cycle-arrow" onClick={() => step(1)} aria-label={t('next')}>
          <Chevron />
        </button>
      </div>
    </div>
  );
}
