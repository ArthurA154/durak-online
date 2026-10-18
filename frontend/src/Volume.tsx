import { useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { t } from './i18n';
import { getPrefs, setPrefs, subscribePrefs, unlockAudio } from './audio';

const NoteIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="6" cy="18" r="3" fill="currentColor" />
    <circle cx="17" cy="16" r="3" fill="currentColor" />
  </svg>
);

const SpeakerIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    <path
      d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MutedIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    <path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Lautstärke für Musik und Effekte – jedes Gerät merkt sich seine Einstellung. */
export function VolumeSliders() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs);
  return (
    <div className="volume-sliders">
      <Slider icon={<NoteIcon />} label={t('music')} value={prefs.music} onChange={(music) => setPrefs({ music })} />
      <Slider
        icon={prefs.sfx === 0 ? <MutedIcon /> : <SpeakerIcon />}
        label={t('effects')}
        value={prefs.sfx}
        onChange={(sfx) => setPrefs({ sfx })}
      />
    </div>
  );
}

function Slider(props: { icon: ReactNode; label: string; value: number; onChange: (v: number) => void }) {
  const pct = Math.round(props.value * 100);
  return (
    <label className="volume-row">
      <span className={`volume-icon${props.value === 0 ? ' off' : ''}`}>{props.icon}</span>
      <span className="volume-label">{props.label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        style={{ '--p': `${pct}%` } as CSSProperties}
        onPointerDown={unlockAudio}
        onChange={(e) => {
          unlockAudio();
          props.onChange(Number(e.target.value) / 100);
        }}
        aria-valuetext={pct === 0 ? t('off') : t('percent', { n: pct })}
      />
      <span className="volume-value">{pct === 0 ? t('off') : pct}</span>
    </label>
  );
}
