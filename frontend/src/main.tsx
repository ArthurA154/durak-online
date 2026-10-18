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
