import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { AppConfig } from './types/index.js';

function env(key: string, fallback?: string): string {
  return process.env[key] ?? fallback ?? '';
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function loadEnvFile(): void {
  const paths = [
    resolve('.env'),
    resolve(import.meta.dirname || '.', '..', '.env'),
    join(env('WEBBRIDGE_DATA_DIR', './data'), '.env'),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const content = readFileSync(p, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
    break;
  }
}

loadEnvFile();

function parseHeadless(val: string): boolean | 'new' {
  if (val === 'new') return 'new';
  return val !== 'false';
}

export function getConfig(): AppConfig {
  const rawMode = env('WEBBRIDGE_MODE', 'http');
  return {
    mode: rawMode === 'stdio' ? 'stdio' : 'http',
    port: parseInt(env('WEBBRIDGE_PORT', '3456'), 10),
    host: env('WEBBRIDGE_HOST', '0.0.0.0'),
    authToken: env('WEBBRIDGE_AUTH_TOKEN', ''),
    stealthLevel: (env('WEBBRIDGE_STEALTH_LEVEL', 'stealth') as AppConfig['stealthLevel']),
    headless: parseHeadless(env('WEBBRIDGE_HEADLESS', 'new')),
    chromePath: env('CHROME_PATH', ''),
    dataDir: env('WEBBRIDGE_DATA_DIR', join(process.cwd(), 'data')),
    maxConcurrency: parseInt(env('WEBBRIDGE_MAX_CONCURRENCY', '5'), 10),
    typingDelayMs: parseInt(env('WEBBRIDGE_TYPING_DELAY_MS', '50'), 10),
    proxyUrl: env('WEBBRIDGE_PROXY_URL', undefined),
    rateLimitMax: parseInt(env('WEBBRIDGE_RATE_LIMIT_MAX', '60'), 10),
  };
}
