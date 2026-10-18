import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RateLimiter } from './limits.js';

const COOKIE = 'durak_admin';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD = 12;

/** Dateien der Admin-Seite (liegen neben server.ts bzw. dist/server.js) */
const ASSETS: Record<string, { file: string; type: string }> = {
  '/admin': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/admin/admin.css': { file: 'admin.css', type: 'text/css; charset=utf-8' },
  '/admin/admin.js': { file: 'admin.js', type: 'text/javascript; charset=utf-8' },
};

const SECURITY_HEADERS = {
  'content-security-policy':
    "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
    "img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

export interface AdminApi {
  state(): unknown;
  notice(text: string | null): void;
}

/**
 * Admin-Seite unter /admin. Ohne ADMIN_PASSWORD (mind. 12 Zeichen) ist sie aus und liefert 404.
 * Anmeldung per Passwort → signiertes Cookie (HttpOnly, 7 Tage). Ändert man das Passwort,
 * sind alle Anmeldungen ungültig.
 */
export function createAdmin(opts: { password?: string; secureCookie: boolean; api: AdminApi; ipOf: (req: IncomingMessage) => string }) {
  const password = opts.password ?? '';
  const enabled = password.length >= MIN_PASSWORD;
  if (password && !enabled) console.warn(`ADMIN_PASSWORD zu kurz (mind. ${MIN_PASSWORD} Zeichen) – Admin-Seite ist aus`);

  const loginLimit = new RateLimiter(5, 60_000);
  setInterval(() => loginLimit.prune(), 60_000).unref();

  const dir = new URL('./admin-ui/', import.meta.url);
  const files = new Map<string, Buffer>();
  // In Produktion einmal lesen, beim Entwickeln immer frisch
  const cache = process.env.NODE_ENV === 'production';
  const asset = (name: string) => {
    if (!cache) return readFileSync(new URL(name, dir));
    if (!files.has(name)) files.set(name, readFileSync(new URL(name, dir)));
    return files.get(name)!;
  };

  const sign = (expires: number) => createHmac('sha256', `durak-admin:${password}`).update(String(expires)).digest('base64url');

  const isLoggedIn = (req: IncomingMessage): boolean => {
    const raw = req.headers.cookie?.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
    const [exp, sig] = (raw?.slice(COOKIE.length + 1) ?? '').split('.');
    const expires = Number(exp);
    if (!expires || expires < Date.now() || !sig) return false;
    return safeEqual(sig, sign(expires));
  };

  const cookie = (value: string, maxAgeS: number) =>
    `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${opts.secureCookie ? '; Secure' : ''}`;

  /** true = Anfrage wurde hier beantwortet */
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = (req.url ?? '').split('?')[0].replace(/\/+$/, '') || '/';
    if (url !== '/admin' && !url.startsWith('/admin/')) return false;
    if (!enabled) {
      res.writeHead(404).end();
      return true;
    }

    const a = ASSETS[url];
    if (a && req.method === 'GET') {
      res.writeHead(200, { 'content-type': a.type, ...SECURITY_HEADERS });
      res.end(asset(a.file));
      return true;
    }

    const json = (status: number, body: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...SECURITY_HEADERS, ...extra });
      res.end(JSON.stringify(body));
      return true;
    };

    // Schreibende Anfragen nur als JSON (schützt zusätzlich zu SameSite gegen fremde Formulare)
    if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) {
      return json(415, { error: 'JSON erwartet' });
    }

    if (url === '/admin/api/login' && req.method === 'POST') {
      if (!loginLimit.take(opts.ipOf(req))) return json(429, { error: 'Zu viele Versuche – warte eine Minute' });
      const body = await readJson(req);
      if (typeof body?.password !== 'string' || !safeEqual(body.password, password)) {
        return json(401, { error: 'Falsches Passwort' });
      }
      const expires = Date.now() + SESSION_MS;
      return json(200, { ok: true }, { 'set-cookie': cookie(`${expires}.${sign(expires)}`, SESSION_MS / 1000) });
    }

    if (url === '/admin/api/logout' && req.method === 'POST') {
      return json(200, { ok: true }, { 'set-cookie': cookie('', 0) });
    }

    if (!isLoggedIn(req)) return json(401, { error: 'Nicht angemeldet' });

    if (url === '/admin/api/state' && req.method === 'GET') return json(200, opts.api.state());

    if (url === '/admin/api/notice' && req.method === 'POST') {
      const body = await readJson(req);
      const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 200) : '';
      opts.api.notice(text || null);
      return json(200, { ok: true });
    }

    return json(404, { error: 'Gibt es nicht' });
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2000) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}
