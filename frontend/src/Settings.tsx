import { LANGS } from '@durak/shared';
import { Popover } from './Popover';
import { VolumeSliders } from './Volume';
import { ThemeGrid } from './Theme';
import { LANG_NAMES, getLang, setLang, t } from './i18n';
import { Segmented } from './Segmented';
import { FooterLinks } from './Privacy';

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

/** ⚙️ in der Kopfleiste: Sprache, Lautstärke, Hintergrund – alles nur für dieses Gerät. */
export function Settings() {
  return (
    <Popover icon={<GearIcon />} label={t('settings')} className="settings-panel">
      <section className="settings-section">
        <Segmented
          label={t('language')}
          value={getLang()}
          options={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
          onChange={setLang}
        />
      </section>
      <section className="settings-section">
        <h3>{t('volume')}</h3>
        <VolumeSliders />
      </section>
      <section className="settings-section">
        <h3>{t('background')}</h3>
        <ThemeGrid />
      </section>
      <FooterLinks />
    </Popover>
  );
}
