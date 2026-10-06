/**
 * Dashboard authentication.
 *
 * Stateless signed cookie: `<expiresAt>.<hmac(secret, expiresAt)>`.
 * The secret is the dashboard password (or the API token as fallback), so
 * changing the password instantly invalidates every existing session.
 * API clients may also authenticate with `Authorization: Bearer <API token>`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../types/index.js';
import { validateApiKey } from '../auth.js';

export const COOKIE_NAME = 'wb_dash';
const SESSION_TTL_MS = 7 * 24 * 3600_000;

export function dashboardSecret(config: AppConfig): string {
  return config.dashboardPassword || config.authToken || '';
}

export function authRequired(config: AppConfig): boolean {
  return dashboardSecret(config) !== '';
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(`webbridge-dashboard:${payload}`).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(config: AppConfig, password: string): boolean {
  const secret = dashboardSecret(config);
  if (!secret) return true;
  return safeEqual(password, secret);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAuthenticated(request: FastifyRequest, config: AppConfig): boolean {
  const secret = dashboardSecret(config);
  if (!secret) return true;

  // Programmatic access with the API token
  const auth = request.headers.authorization;
  if (auth && config.authToken && validateApiKey(auth, config.authToken)) return true;

  const raw = parseCookies(request.headers.cookie)[COOKIE_NAME];
  if (!raw) return false;
  const [exp, sig] = raw.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(secret, exp));
}

function isHttps(request: FastifyRequest): boolean {
  return request.protocol === 'https' || String(request.headers['x-forwarded-proto'] || '').startsWith('https');
}

export function issueSession(request: FastifyRequest, reply: FastifyReply, config: AppConfig): void {
  const exp = String(Date.now() + SESSION_TTL_MS);
  const value = `${exp}.${sign(dashboardSecret(config), exp)}`;
  const attrs = [`${COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_MS / 1000}`];
  if (isHttps(request)) attrs.push('Secure');
  reply.header('Set-Cookie', attrs.join('; '));
}

export function clearSession(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

// ── Brute-force protection ────────────────────────────────
const failures = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

export function loginBlocked(ip: string): number {
  const f = failures.get(ip);
  if (!f) return 0;
  if (Date.now() - f.first > WINDOW_MS) { failures.delete(ip); return 0; }
  return f.count >= MAX_FAILURES ? Math.ceil((f.first + WINDOW_MS - Date.now()) / 1000) : 0;
}

export function recordFailure(ip: string): void {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(ip, { count: 1, first: Date.now() });
  else f.count++;
}

export function clearFailures(ip: string): void {
  failures.delete(ip);
}
