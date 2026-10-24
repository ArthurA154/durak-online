// Admin-Übersicht: holt alle paar Sekunden den Stand und zeichnet die Seite neu.
// Alle Texte von Spielern (Namen) nur über textContent einsetzen – nie als HTML.

const REFRESH_MS = 3000;
const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';

let lastOk = 0;
let timer = null;

// ---------- Helfer ----------

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') {
      // über style.setProperty statt Attribut – das erlaubt die Content-Security-Policy
      for (const decl of v.split(';')) {
        const i = decl.indexOf(':');
        if (i > 0) e.style.setProperty(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
      }
    } else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

const nf = new Intl.NumberFormat('de-CH');
const num = (n) => nf.format(Math.round(n));
const time = (t) => new Date(t).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
const dayMonth = (t) => new Date(t).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
const isToday = (t) => new Date(t).toDateString() === new Date().toDateString();

function bytes(b) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  return `${Math.round(b / 1e6)} MB`;
}

function duration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} Tage`;
}

async function api(path, body) {
  const res = await fetch(`/admin/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

// ---------- Anmelden ----------

function showLogin() {
  clearTimeout(timer);
  $('app').hidden = true;
  $('login').hidden = false;
  $('password').focus();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('login-error').textContent = '';
  try {
    await api('login', { password: $('password').value });
    $('password').value = '';
    $('login').hidden = true;
    refresh();
  } catch (err) {
    $('login-error').textContent = err.message;
  }
});

$('logout').addEventListener('click', async () => {
  await api('logout', {}).catch(() => {});
  showLogin();
});

// ---------- Nachricht an alle ----------

$('notice-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('notice-text').value.trim();
  if (!text) return;
  await api('notice', { text });
  $('notice-text').value = '';
  refresh();
});

// ---------- Laden ----------

async function refresh() {
  clearTimeout(timer);
  try {
    const s = await api('state');
    lastOk = Date.now();
    $('app').hidden = false;
    render(s);
  } catch (err) {
    if (err.status === 401) return showLogin();
  }
  updateLive();
  timer = setTimeout(refresh, document.hidden ? REFRESH_MS * 5 : REFRESH_MS);
}

function updateLive() {
  const ago = Math.round((Date.now() - lastOk) / 1000);
  const stale = !lastOk || ago > 10;
  $('live').classList.toggle('stale', stale);
  $('live').lastChild.textContent = stale ? 'keine Verbindung' : ago < 2 ? 'live' : `vor ${ago} s`;
}

setInterval(updateLive, 1000);
document.addEventListener('visibilitychange', () => !document.hidden && refresh());
refresh();

// ---------- Zeichnen ----------

function render(s) {
  const today = s.days[s.days.length - 1];
  $('n-online').textContent = num(s.live.online);
  $('n-games').textContent = num(s.live.games);
  $('n-lobbies').textContent = num(s.live.lobbies);
  $('n-today').textContent = num(today.gamesStarted);

  renderTables(s);
  renderDays(s.days);
  renderTotals(s.totals);
  renderSystem(s);
  renderGames(s.games);
  renderNotice(s.notice);
  renderErrors(s.errors);
}

const PHASE_ORDER = { playing: 0, lobby: 1, finished: 2 };

function renderTables(s) {
  const rooms = [...s.live.rooms].sort(
    (a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.createdAt - b.createdAt,
  );
  $('tables-note').textContent = rooms.length
    ? `${s.live.players} Spieler in ${rooms.length} ${rooms.length === 1 ? 'Raum' : 'Räumen'}`
    : '';
  const box = $('tables');
  if (!rooms.length) {
    box.replaceChildren(el('p', { class: 'empty-state', text: 'Gerade sitzt niemand am Tisch.' }));
    return;
  }
  box.replaceChildren(...rooms.map((r) => table(r, s.now)));
}

function table(r, now) {
  const seats = r.phase === 'lobby' ? 4 : r.players.length;
  const felt = el('div', { class: 'felt' });
  for (let i = 0; i < seats; i++) {
    // Plätze gleichmäßig ums Oval, Platz 0 unten
    const a = Math.PI / 2 + (i * 2 * Math.PI) / seats;
    const pos = `left:${50 + 50 * Math.cos(a)}%;top:${50 + 50 * Math.sin(a)}%`;
    const p = r.players[i];
    if (!p) {
      felt.append(el('span', { class: 'chair empty', style: pos }));
      continue;
    }
    const chair = el('span', {
      class: `chair${p.connected ? '' : ' away'}`,
      style: `${pos};--c:${p.color}`,
      title: p.name,
      text: (p.name.trim()[0] || '?').toUpperCase(),
    });
    felt.append(chair);
  }

  let main;
  let sub;
  if (r.phase === 'playing') {
    main = r.paused ? 'Pause' : `Runde ${r.round}`;
    sub = `seit ${duration(now - r.gameStartedAt)} · ${r.deckCount} im Stapel`;
  } else if (r.phase === 'lobby') {
    main = 'Lobby';
    sub = `wartet seit ${duration(now - r.createdAt)}`;
  } else {
    main = 'Fertig';
    sub = `${r.round} ${r.round === 1 ? 'Runde' : 'Runden'} gespielt`;
  }
  felt.append(el('div', { class: 'felt-text' }, el('b', { text: main }), sub));

  const players = el(
    'ul',
    { class: 'table-players' },
    ...r.players.map((p) =>
      el('li', {
        class: p.connected ? '' : 'away',
        style: `--c:${p.color}`,
        text: `${p.bot ? '🤖 ' : ''}${p.name}${p.host ? ' ★' : ''}${p.cards != null ? ` · ${p.cards}` : ''}${p.durakCount ? ` · 🃏${p.durakCount}` : ''}`,
      }),
    ),
  );

  return el(
    'article',
    { class: `table ${r.phase}${r.paused ? ' paused' : ''}` },
    felt,
    el(
      'div',
      { class: 'table-meta' },
      el('span', { class: 'code', text: r.code }),
      el('span', {
        class: 'dim',
        text: `${r.public ? 'öffentlich' : 'privat'}${r.neighborsOnly ? ' · Nachbarn' : ''} · ${r.players.length}/4`,
      }),
    ),
    players,
  );
}

function renderDays(days) {
  const box = $('days-chart');
  const W = box.clientWidth || 600;
  const H = box.clientHeight || 200;
  const pad = { l: 28, r: 30, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxGames = Math.max(4, ...days.map((d) => d.gamesStarted));
  const maxVis = Math.max(4, ...days.map((d) => d.visitors));
  const step = iw / days.length;
  const bw = Math.max(3, step * 0.62);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });
  for (const f of [0, 0.5, 1]) {
    const y = pad.t + ih * (1 - f);
    root.append(svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
    root.append(svg('text', { class: 'axis', x: pad.l - 6, y: y + 3, 'text-anchor': 'end' }, num(maxGames * f)));
    root.append(svg('text', { class: 'axis', x: W - pad.r + 6, y: y + 3, fill: '#51cf66' }, num(maxVis * f)));
  }

  days.forEach((d, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    const hs = (d.gamesStarted / maxGames) * ih;
    const hf = (d.gamesFinished / maxGames) * ih;
    const title = `${d.date}: ${d.gamesStarted} gestartet, ${d.gamesFinished} fertig, ${d.visitors} Besucher, max. ${d.peakOnline} online`;
    const g = svg('g');
    g.append(svg('title', {}, title));
    g.append(svg('rect', { x, y: pad.t + ih - hs, width: bw, height: hs, rx: 2, fill: '#3f6fb0' }));
    g.append(svg('rect', { x: x + bw * 0.2, y: pad.t + ih - hf, width: bw * 0.6, height: hf, rx: 2, fill: '#ffd23f' }));
    // unsichtbare Fläche, damit der Tooltip über der ganzen Spalte kommt
    g.append(svg('rect', { x: pad.l + i * step, y: pad.t, width: step, height: ih, fill: 'transparent' }));
    root.append(g);
    if (i % 5 === (days.length - 1) % 5) {
      const [, m, dd] = d.date.split('-');
      root.append(svg('text', { class: 'axis', x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }, `${dd}.${m}.`));
    }
  });

  const pts = days.map((d, i) => `${pad.l + i * step + step / 2},${pad.t + ih - (d.visitors / maxVis) * ih}`);
  root.append(
    svg('polyline', {
      points: pts.join(' '),
      fill: 'none',
      stroke: '#51cf66',
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    }),
  );

  box.replaceChildren(root);
}

function renderTotals(t) {
  const finished = t.gamesFinished;
  facts($('totals'), [
    ['Spiele insgesamt', num(t.gamesStarted)],
    ['fertig gespielt', num(finished)],
    ['unentschieden', num(t.draws)],
    ['abgebrochen', num(t.aborted)],
    ['ø Dauer', finished ? duration(t.playMs / finished) : '–'],
    ['ø Spieler', t.gamesStarted ? (t.players / t.gamesStarted).toFixed(1) : '–'],
    ['Räume erstellt', num(t.roomsCreated)],
    ['Rekord online', num(t.peakOnline)],
    ['Besuche (Summe)', num(t.visitors)],
    ['Chat-Nachrichten', num(t.chats)],
    ['Würfe 🍅', num(t.throws)],
    ['gebremst (Spam)', num(t.limited)],
  ]);
}

function facts(dl, rows) {
  dl.replaceChildren(...rows.map(([k, v]) => el('div', {}, el('dt', { text: k }), el('dd', { text: v }))));
}

function meter(label, value, fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  const level = f > 0.85 ? 'bad' : f > 0.65 ? 'warn' : '';
  return el(
    'div',
    {},
    el('div', { class: 'meter-head' }, el('span', { text: label }), el('span', { text: value })),
    el('div', { class: 'meter-bar' }, el('i', { class: level, style: `width:${(f * 100).toFixed(1)}%` })),
  );
}

function renderSystem(s) {
  const y = s.system;
  const memUsed = y.memTotal - y.memFree;
  const items = [
    meter('Server-Auslastung (CPU)', `Last ${y.load[0]} bei ${y.cores} Kernen`, y.load[0] / y.cores),
    meter('Server-RAM', `${bytes(memUsed)} von ${bytes(y.memTotal)}`, memUsed / y.memTotal),
  ];
  if (y.disk) {
    const used = y.disk.total - y.disk.free;
    items.push(meter('Festplatte', `${bytes(y.disk.free)} frei`, used / y.disk.total));
  }
  items.push(meter('Durak-Backend (CPU)', `${y.cpu.toFixed(1)} %`, y.cpu / 100));
  $('meters').replaceChildren(...items);

  facts($('sysfacts'), [
    ['Backend-RAM', bytes(y.rss)],
    ['Reaktionszeit', `${y.loopDelayMs} ms`],
    ['Backend läuft seit', duration(y.processUptime * 1000)],
    ['Server läuft seit', duration(y.serverUptime * 1000)],
    ['Last 1 / 5 / 15 min', y.load.join(' / ')],
    ['Node', y.node],
  ]);

  renderHour(s.history);
}

function renderHour(samples) {
  const box = $('hour-chart');
  const W = box.clientWidth || 600;
  const H = box.clientHeight || 110;
  const pad = { l: 28, r: 30, t: 6, b: 6 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}` });
  if (samples.length < 3) {
    box.replaceChildren(el('div', { class: 'chart-wait', text: 'sammelt Daten …' }));
    return;
  }
  // Bis eine Stunde voll ist, nutzt der Verlauf trotzdem die ganze Breite
  const tEnd = samples[samples.length - 1].t;
  const span = Math.min(60 * 60 * 1000, Math.max(5 * 60 * 1000, tEnd - samples[0].t));
  const t0 = tEnd - span;
  const maxCpu = Math.max(5, ...samples.map((p) => p.cpu));
  const maxOn = Math.max(3, ...samples.map((p) => p.online));
  const x = (t) => pad.l + ((t - t0) / span) * iw;
  const line = (key, max, color) =>
    svg('polyline', {
      points: samples.map((p) => `${x(p.t)},${pad.t + ih - (p[key] / max) * ih}`).join(' '),
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-linejoin': 'round',
    });
  for (const f of [0, 1]) {
    const yy = pad.t + ih * (1 - f);
    root.append(svg('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: yy, y2: yy }));
  }
  root.append(
    svg(
      'text',
      { class: 'axis', x: pad.l - 6, y: pad.t + 4, 'text-anchor': 'end', fill: '#ff5148' },
      `${Math.round(maxCpu)}%`,
    ),
  );
  root.append(svg('text', { class: 'axis', x: W - pad.r + 6, y: pad.t + 4, fill: '#74c0fc' }, num(maxOn)));
  root.append(line('online', maxOn, '#74c0fc'));
  root.append(line('cpu', maxCpu, '#ff5148'));
  box.replaceChildren(root);
}

const RESULT = { durak: 'Durak', draw: 'Unentschieden', aborted: 'abgebrochen' };

function renderGames(games) {
  if (!games.length) {
    $('games').replaceChildren(el('li', { class: 'empty-state', text: 'Noch keine Spiele.' }));
    return;
  }
  $('games').replaceChildren(
    ...games.map((g) =>
      el(
        'li',
        {},
        el('time', { text: isToday(g.at) ? time(g.at) : dayMonth(g.at) }),
        el('span', { class: 'who', text: g.players.join(', ') }),
        el('span', { class: `result ${g.outcome}`, text: g.outcome === 'durak' ? `🃏 ${g.durak}` : RESULT[g.outcome] }),
        el('span', {
          class: 'sub',
          text: `${duration(g.durationMs)} · ${g.players.length} Spieler${g.bots ? ` · mit ${g.bots} Bot${g.bots > 1 ? 's' : ''}` : ''}`,
        }),
      ),
    ),
  );
}

function renderNotice(n) {
  const box = $('notice-current');
  if (!n) {
    box.replaceChildren(el('span', { class: 'dim', text: 'Keine Nachricht aktiv.' }));
    return;
  }
  const remove = el('button', { type: 'button', text: 'entfernen' });
  remove.addEventListener('click', async () => {
    await api('notice', { text: '' });
    refresh();
  });
  box.replaceChildren(el('span', { class: 'dim', text: `Aktiv bis ${time(n.until)}: ` }), `„${n.text}“`, remove);
}

function renderErrors(errors) {
  if (!errors.length) {
    $('errors').replaceChildren(el('li', { class: 'dim', text: 'Keine Fehler.' }));
    return;
  }
  $('errors').replaceChildren(
    ...errors.map((e) =>
      el(
        'li',
        {},
        el('time', { text: `${isToday(e.at) ? '' : `${dayMonth(e.at)} `}${time(e.at)}` }),
        el('code', { text: e.message }),
      ),
    ),
  );
}
