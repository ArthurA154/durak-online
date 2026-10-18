import { useSyncExternalStore } from 'react';
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
    <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function AudioToggles() {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs);
  const toggle = (key: 'music' | 'sfx') => {
    unlockAudio();
    setPrefs({ [key]: !prefs[key] });
  };
  return (
    <div className="audio-toggles">
      <button
        type="button"
        className={`icon-btn${prefs.music ? '' : ' off'}`}
        onClick={() => toggle('music')}
        aria-label={prefs.music ? 'Musik ausschalten' : 'Musik einschalten'}
        aria-pressed={prefs.music}
      >
        <NoteIcon />
      </button>
      <button
        type="button"
        className={`icon-btn${prefs.sfx ? '' : ' off'}`}
        onClick={() => toggle('sfx')}
        aria-label={prefs.sfx ? 'Geräusche ausschalten' : 'Geräusche einschalten'}
        aria-pressed={prefs.sfx}
      >
        <SpeakerIcon />
      </button>
    </div>
  );
}
