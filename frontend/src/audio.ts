// Musik und Soundeffekte, komplett im Browser erzeugt (Web Audio) – keine Dateien, keine Lizenzen.
// Musik: ruhiger Lo-Fi-Groove – weicher Beat, darüber E-Piano-Jazzakkorde.
// Browser erlauben Ton erst nach einer Nutzeraktion → unlockAudio() beim ersten Klick aufrufen.

export interface AudioPrefs {
  /** 0 = aus, 1 = voll */
  music: number;
  sfx: number;
}

const PREFS_KEY = 'durak.audio';
const MUSIC_VOLUME = 0.3;
const DEFAULTS: AudioPrefs = { music: 0.7, sfx: 0.8 };

/** Früher gab es nur An/Aus (true/false) – das in Lautstärken umrechnen */
const level = (v: unknown, fallback: number) =>
  typeof v === 'number' ? Math.min(1, Math.max(0, v)) : v === false ? 0 : fallback;

function loadPrefs(): AudioPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return { music: level(raw.music, DEFAULTS.music), sfx: level(raw.sfx, DEFAULTS.sfx) };
  } catch {
    return { ...DEFAULTS };
  }
}

let prefs = loadPrefs();
const listeners = new Set<() => void>();

export const getPrefs = () => prefs;

export function subscribePrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setPrefs(change: Partial<AudioPrefs>): void {
  prefs = { ...prefs, ...change };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ohne Speicher eben nur für diese Sitzung
  }
  applyPrefs();
  listeners.forEach((fn) => fn());
}

// ---------- Grundaufbau ----------

let ctx: AudioContext | null = null;
let musicBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;

export function unlockAudio(): void {
  if (!ctx) {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);

    // Musik: gedämpft (Lo-Fi) + etwas Raum
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4200;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.33;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    musicBus.connect(tone);
    tone.connect(comp);
    tone.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(comp);

    sfxBus = ctx.createGain();
    sfxBus.connect(comp);

    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  applyPrefs();
}

function applyPrefs(): void {
  if (!ctx) return;
  // Ohr hört logarithmisch – Quadrat fühlt sich am Regler gleichmäßiger an
  musicBus.gain.setTargetAtTime(MUSIC_VOLUME * prefs.music ** 2, ctx.currentTime, 0.15);
  sfxBus.gain.setTargetAtTime(prefs.sfx ** 2, ctx.currentTime, 0.05);
  if (prefs.music > 0) startMusic();
  else stopMusic();
}

const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// ---------- Klangbausteine ----------

/** E-Piano (FM-Synthese): Sinus, dessen Obertöne beim Anschlag hell sind und dann weich werden. */
function epiano(dest: AudioNode, freq: number, t: number, dur: number, vol: number): void {
  const c = ctx!;
  const carrier = c.createOscillator();
  carrier.frequency.value = freq;
  const mod = c.createOscillator();
  mod.frequency.value = freq;
  const modGain = c.createGain();
  modGain.gain.setValueAtTime(freq * 1.4, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + 0.9);
  mod.connect(modGain).connect(carrier.frequency);

  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.5);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  carrier.connect(amp).connect(dest);
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}

function sine(dest: AudioNode, freq: number, t: number, dur: number, vol: number, toFreq?: number): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(freq, t);
  if (toFreq) osc.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(dest);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function burst(
  dest: AudioNode,
  t: number,
  dur: number,
  vol: number,
  type: BiquadFilterType,
  from: number,
  to = from,
): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(amp).connect(dest);
  src.start(t, Math.random() * 0.8, dur + 0.05);
}

/** Weiche Bassdrum */
function kick(t: number, vol: number): void {
  sine(musicBus, 110, t, 0.28, vol, 42);
}

/** Gedämpfte Snare / Rimshot */
function snare(t: number, vol: number): void {
  burst(musicBus, t, 0.12, vol, 'bandpass', 2200, 1200);
  sine(musicBus, 190, t, 0.07, vol * 0.5, 140);
}

// ---------- Musik ----------

const BEAT = 0.75; // 80 BPM, 4/4
// Am9 – Dm9 – G13 – Cmaj9 – Fmaj7 – Dm9 – E7(b9) – Am9 (ohne Grundton gesetzt, Bass spielt ihn)
const CHORDS: { bass: number; notes: number[] }[] = [
  { bass: 45, notes: [60, 64, 67, 71] },
  { bass: 38, notes: [53, 57, 60, 64] },
  { bass: 43, notes: [53, 59, 64, 69] },
  { bass: 36, notes: [52, 55, 59, 62] },
  { bass: 41, notes: [52, 57, 60, 64] },
  { bass: 38, notes: [53, 57, 60, 64] },
  { bass: 40, notes: [50, 56, 59, 65] },
  { bass: 45, notes: [55, 60, 64, 71] },
];
const MELODY = [69, 72, 74, 76, 79, 81, 84]; // a-Moll pentatonisch

let timer: number | null = null;
let nextTime = 0;
let step = 0; // Achtel
let melodyIdx = 3;

function startMusic(): void {
  if (timer !== null || !ctx) return;
  nextTime = ctx.currentTime + 0.2;
  timer = window.setInterval(scheduleMusic, 60);
}

function stopMusic(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

function scheduleMusic(): void {
  if (!ctx) return;
  if (nextTime < ctx.currentTime - 0.5) nextTime = ctx.currentTime + 0.05; // Tab war im Hintergrund
  while (nextTime < ctx.currentTime + 0.4) {
    playEighth(step, nextTime);
    // leichter Swing auf den Off-Beats
    nextTime += (step % 2 === 0 ? 0.56 : 0.44) * BEAT;
    step++;
  }
}

function playEighth(s: number, t: number): void {
  const bar = Math.floor(s / 8);
  const pos = s % 8; // Achtel im Takt
  const chord = CHORDS[bar % CHORDS.length];
  const intro = bar < 1; // erst nur Beat, dann Musik

  // Beat: Bassdrum auf 1 und „3 und“, Snare auf 2 und 4
  if (pos === 0 || pos === 5) kick(t, 0.3);
  if (pos === 2 || pos === 6) snare(t, 0.06);
  // leises Rauschen wie ein Hi-Hat auf den Off-Beats
  if (pos % 2 === 1) burst(musicBus, t, 0.04, 0.03, 'highpass', 7000);

  if (intro) return;

  // Akkord auf der Eins, leiser Nachschlag auf „3 und“
  if (pos === 0) chord.notes.forEach((n, i) => epiano(musicBus, mtof(n), t + i * 0.012, 2.6, 0.07));
  if (pos === 5) chord.notes.forEach((n) => epiano(musicBus, mtof(n), t, 0.9, 0.035));

  // Bass
  if (pos === 0) sine(musicBus, mtof(chord.bass), t, 1.4, 0.22);
  if (pos === 5) sine(musicBus, mtof(chord.bass + 7), t, 0.6, 0.12);

  // sparsame Melodie, jede 4. Runde Pause
  const resting = Math.floor(bar / CHORDS.length) % 4 === 0;
  if (!resting && pos % 2 === 0 && Math.random() < 0.28) {
    melodyIdx = Math.max(0, Math.min(MELODY.length - 1, melodyIdx + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    epiano(musicBus, mtof(MELODY[melodyIdx]), t, 1.2, 0.05);
  }
}

// ---------- Soundeffekte ----------

function play(fn: (t: number) => void): void {
  if (!ctx || prefs.sfx === 0 || ctx.state !== 'running') return;
  fn(ctx.currentTime + 0.01);
}

/** Karte klatscht auf den Tisch. */
function snap(t: number, vol = 0.5): void {
  burst(sfxBus, t, 0.06, vol, 'highpass', 1500, 900);
  sine(sfxBus, 150, t, 0.07, vol * 0.6, 80);
}

export const sfx = {
  tick: () => play((t) => burst(sfxBus, t, 0.03, 0.25, 'bandpass', 3200)),
  /** Letzte Sekunde beim Nachlegen: lauteres, längeres „Klack“ */
  tickLast: () =>
    play((t) => {
      burst(sfxBus, t, 0.06, 0.45, 'bandpass', 2200);
      sine(sfxBus, 880, t, 0.25, 0.12, 440);
    }),
  card: () => play((t) => snap(t)),
  /** Riffeln beim Mischen */
  shuffle: () =>
    play((t) => {
      for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 14; i++) snap(t + r * 0.6 + i * 0.025, 0.12 + Math.random() * 0.08);
      }
    }),
  /** Jemand ist raus */
  out: () =>
    play((t) => [72, 76, 79, 84].forEach((m, i) => epiano(sfxBus, mtof(m), t + i * 0.07, 1.2, 0.11))),
  deal: () =>
    play((t) => {
      for (let i = 0; i < 6; i++) snap(t + i * 0.09, 0.3);
    }),
  turn: () =>
    play((t) => {
      epiano(sfxBus, mtof(76), t, 0.8, 0.12);
      epiano(sfxBus, mtof(81), t + 0.11, 1, 0.12);
    }),
  take: () =>
    play((t) => {
      burst(sfxBus, t, 0.35, 0.3, 'bandpass', 2500, 300);
      sine(sfxBus, 120, t + 0.25, 0.25, 0.35, 60);
    }),
  bito: () => play((t) => burst(sfxBus, t, 0.4, 0.35, 'bandpass', 600, 5000)),
  win: () =>
    play((t) => [57, 64, 67, 71, 76].forEach((m, i) => epiano(sfxBus, mtof(m), t + i * 0.09, 1.6, 0.12))),
  /** Karte vom Stapel ziehen: kurzes Wischen */
  draw: () =>
    play((t) => {
      burst(sfxBus, t, 0.11, 0.16, 'bandpass', 1800, 4200);
      burst(sfxBus, t + 0.09, 0.04, 0.12, 'highpass', 2500);
    }),
  /** Chat-Nachricht: kurzes „Plopp“ */
  chat: () => play((t) => sine(sfxBus, 660, t, 0.09, 0.12, 990)),
  /** Etwas fliegt los */
  whoosh: () => play((t) => burst(sfxBus, t, 0.35, 0.12, 'bandpass', 500, 2400)),
  /** Treffer – je nach Gegenstand */
  hit: (item: string) =>
    play((t) => {
      switch (item) {
        case 'tomato': // Matsch
          burst(sfxBus, t, 0.25, 0.45, 'lowpass', 1800, 250);
          sine(sfxBus, 160, t, 0.12, 0.3, 70);
          break;
        case 'egg': // Knacks, dann Glibber
          burst(sfxBus, t, 0.03, 0.35, 'highpass', 4000);
          burst(sfxBus, t + 0.03, 0.03, 0.25, 'highpass', 3000);
          burst(sfxBus, t + 0.07, 0.3, 0.25, 'lowpass', 1200, 300);
          break;
        case 'slipper': // Bonk
          sine(sfxBus, 420, t, 0.22, 0.4, 90);
          burst(sfxBus, t, 0.04, 0.3, 'bandpass', 1500);
          break;
        case 'flowers': // Ding-ding
          [84, 88, 91].forEach((m, i) => epiano(sfxBus, mtof(m), t + i * 0.08, 0.9, 0.09));
          break;
        case 'fish': // Patsch, mit Wackeln
          burst(sfxBus, t, 0.12, 0.5, 'bandpass', 1300, 700);
          sine(sfxBus, 260, t + 0.05, 0.3, 0.15, 180);
          break;
      }
    }),
  /** Für den Durak: absteigendes „wah-wah-wah-waaah“. */
  lose: () =>
    play((t) => {
      [0, 1, 2, 3].forEach((i) => {
        const c = ctx!;
        const start = t + i * 0.32;
        const len = i === 3 ? 0.9 : 0.28;
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime([311, 294, 277, 262][i], start);
        if (i === 3) osc.frequency.linearRampToValueAtTime(247, start + len);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(500, start);
        lp.frequency.linearRampToValueAtTime(1400, start + 0.1);
        lp.frequency.linearRampToValueAtTime(600, start + len);
        const amp = c.createGain();
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(0.1, start + 0.03);
        amp.gain.exponentialRampToValueAtTime(0.0001, start + len);
        osc.connect(lp).connect(amp).connect(sfxBus);
        osc.start(start);
        osc.stop(start + len + 0.05);
      });
    }),
};
