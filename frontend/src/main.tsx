// Schriften liegen mit im Spiel (keine Anfragen an Google Fonts – Datenschutz)
import '@fontsource/unbounded/700.css';
import '@fontsource/unbounded/800.css';
import '@fontsource/unbounded/900.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockAudio } from './audio';
import './styles.css';

// Browser erlauben Ton erst nach einer Nutzeraktion
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
