/**
 * Persistent runtime settings.
 *
 * Precedence (lowest → highest):
 *   built-in defaults  <  .env file  <  container env (Coolify)  <  dashboard overrides (DATA_DIR/settings.json)
 *
 * Dashboard overrides live inside the persistent data volume (/app/data by default)
 * so they survive container redeploys.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export type SettingType = 'string' | 'number' | 'boolean' | 'select' | 'secret';
/** When a change takes effect: immediately, after a browser restart, or after a server restart. */
export type ApplyMode = 'live' | 'browser' | 'restart';

export interface SettingDef {
  key: string;
  label: string;
  group: 'server' | 'security' | 'browser' | 'performance' | 'logging';
  type: SettingType;
  default: string;
  description: string;
  apply: ApplyMode;
  options?: string[];
  min?: number;
  max?: number;
  readOnly?: boolean;
}

export const SETTINGS_SCHEMA: SettingDef[] = [
  // ── Server ────────────────────────────────────────────────
  { key: 'WEBBRIDGE_MODE', label: 'Server mode', group: 'server', type: 'select', options: ['http', 'stdio'], default: 'http', apply: 'restart', readOnly: true, description: 'Transport mode. The dashboard is only available in http mode.' },
  { key: 'WEBBRIDGE_PORT', label: 'HTTP port', group: 'server', type: 'number', default: '3456', min: 1, max: 65535, apply: 'restart', description: 'Port the HTTP/MCP server listens on. Must match the port configured in Coolify.' },
  { key: 'WEBBRIDGE_HOST', label: 'Bind host', group: 'server', type: 'string', default: '0.0.0.0', apply: 'restart', description: 'Network interface to bind. Use 0.0.0.0 inside Docker.' },
  { key: 'WEBBRIDGE_DATA_DIR', label: 'Data directory', group: 'server', type: 'string', default: '/app/data', apply: 'restart', readOnly: true, description: 'Persistent storage root (settings, logs, sessions, browser profile). Mount a Coolify persistent volume here.' },

  // ── Security ──────────────────────────────────────────────
  { key: 'WEBBRIDGE_AUTH_TOKEN', label: 'API auth token', group: 'security', type: 'secret', default: '', apply: 'live', description: 'Bearer token required by REST & MCP clients. Leave empty to disable auth (insecure).' },
  { key: 'WEBBRIDGE_DASHBOARD_PASSWORD', label: 'Dashboard password', group: 'security', type: 'secret', default: '', apply: 'live', description: 'Separate password for this dashboard. Falls back to the API auth token when empty.' },
  { key: 'WEBBRIDGE_RATE_LIMIT_MAX', label: 'Rate limit (req/min/IP)', group: 'security', type: 'number', default: '60', min: 1, max: 100000, apply: 'restart', description: 'Maximum API requests per minute per client IP. Dashboard traffic is exempt.' },

  // ── Browser ───────────────────────────────────────────────
  { key: 'WEBBRIDGE_HEADLESS', label: 'Headless mode', group: 'browser', type: 'select', options: ['new', 'true', 'false'], default: 'new', apply: 'browser', description: '"new" = modern Chrome headless (recommended), "true" = legacy headless, "false" = headed (needs a display).' },
  { key: 'WEBBRIDGE_STEALTH_LEVEL', label: 'Stealth level', group: 'browser', type: 'select', options: ['basic', 'standard', 'stealth'], default: 'stealth', apply: 'browser', description: 'Anti-detection patch level applied to new pages.' },
  { key: 'WEBBRIDGE_PROXY_URL', label: 'Proxy URL', group: 'browser', type: 'secret', default: '', apply: 'browser', description: 'Optional upstream proxy, e.g. socks5://user:pass@host:1080 or http://host:8080.' },
  { key: 'CHROME_PATH', label: 'Chrome executable', group: 'browser', type: 'string', default: '', apply: 'browser', description: 'Custom Chromium/Chrome binary. Empty = bundled Playwright Chromium.' },
  { key: 'WEBBRIDGE_TAB_IDLE_TIMEOUT_MS', label: 'Tab idle timeout (ms)', group: 'browser', type: 'number', default: '0', min: 0, max: 86400000, apply: 'browser', description: 'Discard background tabs idle longer than this to free memory. 0 = disabled. 600000 = 10 min.' },

  // ── Performance ───────────────────────────────────────────
  { key: 'WEBBRIDGE_MAX_CONCURRENCY', label: 'Max concurrency', group: 'performance', type: 'number', default: '5', min: 1, max: 100, apply: 'live', description: 'Maximum concurrent browser contexts.' },
  { key: 'WEBBRIDGE_TYPING_DELAY_MS', label: 'Typing delay (ms)', group: 'performance', type: 'number', default: '50', min: 0, max: 2000, apply: 'live', description: 'Delay between simulated keystrokes. Higher = more human-like, slower.' },

  // ── Logging ───────────────────────────────────────────────
  { key: 'WEBBRIDGE_LOG_LEVEL', label: 'Log level', group: 'logging', type: 'select', options: ['debug', 'info', 'warn', 'error'], default: 'info', apply: 'live', description: 'Minimum severity written to log files. "debug" also records every HTTP request.' },
  { key: 'WEBBRIDGE_LOG_TOOL_CALLS', label: 'Log tool calls', group: 'logging', type: 'boolean', default: 'true', apply: 'live', description: 'Record every MCP/REST tool invocation with duration and outcome.' },
  { key: 'WEBBRIDGE_LOG_RETENTION_DAYS', label: 'Log retention (days)', group: 'logging', type: 'number', default: '7', min: 1, max: 365, apply: 'live', description: 'Log files older than this are deleted automatically.' },
  { key: 'WEBBRIDGE_LOG_MAX_SIZE_MB', label: 'Max log storage (MB)', group: 'logging', type: 'number', default: '50', min: 1, max: 10240, apply: 'live', description: 'Total disk budget for log files. Oldest files are pruned first.' },
];

export const SCHEMA_KEYS = new Set(SETTINGS_SCHEMA.map(s => s.key));

/** Env keys that must never be overridden from the dashboard (would break the container). */
const PROTECTED_ENV = new Set(['PATH', 'HOME', 'NODE_ENV', 'HOSTNAME', 'PWD', 'NODE_VERSION', 'YARN_VERSION', 'WEBBRIDGE_DATA_DIR', 'WEBBRIDGE_MODE']);

export function isProtectedEnv(key: string): boolean {
  return PROTECTED_ENV.has(key);
}

interface SettingsFile {
  version: 1;
  updatedAt: string | null;
  env: Record<string, string>;
}

/** Snapshot of the environment *before* dashboard overrides are applied. */
const originalEnv: Record<string, string | undefined> = {};
let _file: SettingsFile = { version: 1, updatedAt: null, env: {} };
let _dataDir = '';

export function resolveDataDir(): string {
  if (process.env.WEBBRIDGE_DATA_DIR) return process.env.WEBBRIDGE_DATA_DIR;
  if (existsSync('/app/data') || existsSync('/.dockerenv')) return '/app/data';
  return join(process.cwd(), 'data');
}

function settingsPath(): string {
  return join(_dataDir, 'settings.json');
}

/** Load DATA_DIR/settings.json and apply its env overrides onto process.env. Called once at boot. */
export function initSettings(): void {
  _dataDir = resolveDataDir();
  try { mkdirSync(_dataDir, { recursive: true }); } catch { /* ignore */ }

  for (const def of SETTINGS_SCHEMA) originalEnv[def.key] = process.env[def.key];

  const p = settingsPath();
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, 'utf-8')) as Partial<SettingsFile>;
      _file = { version: 1, updatedAt: parsed.updatedAt ?? null, env: { ...(parsed.env || {}) } };
    } catch (err) {
      console.error(`[settings] Could not parse ${p}: ${err instanceof Error ? err.message : err}`);
    }
  }

  for (const [k, v] of Object.entries(_file.env)) {
    if (isProtectedEnv(k)) continue;
    if (!(k in originalEnv)) originalEnv[k] = process.env[k];
    process.env[k] = v;
  }
}

function persist(): void {
  _file.updatedAt = new Date().toISOString();
  const p = settingsPath();
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(_file, null, 2), { mode: 0o600 });
  renameSync(tmp, p); // atomic replace — no half-written settings on crash
}

export function getOverrides(): Record<string, string> {
  return { ..._file.env };
}

export function getSettingsMeta() {
  return { path: settingsPath(), updatedAt: _file.updatedAt };
}

export type ValueSource = 'dashboard' | 'environment' | 'default';

export function describeSetting(def: SettingDef) {
  const override = _file.env[def.key];
  const envVal = originalEnv[def.key];
  let source: ValueSource = 'default';
  let value = def.default;
  if (override !== undefined) { source = 'dashboard'; value = override; }
  else if (envVal !== undefined && envVal !== '') { source = 'environment'; value = envVal; }
  return { ...def, value, source, envValue: envVal ?? null };
}

export function validateSetting(def: SettingDef, raw: string): string {
  const v = String(raw).trim();
  switch (def.type) {
    case 'number': {
      if (v === '' ) throw new Error(`${def.label}: value required`);
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${def.label}: must be an integer`);
      if (def.min !== undefined && n < def.min) throw new Error(`${def.label}: minimum is ${def.min}`);
      if (def.max !== undefined && n > def.max) throw new Error(`${def.label}: maximum is ${def.max}`);
      return String(n);
    }
    case 'boolean':
      if (!['true', 'false'].includes(v)) throw new Error(`${def.label}: must be true or false`);
      return v;
    case 'select':
      if (def.options && !def.options.includes(v)) throw new Error(`${def.label}: must be one of ${def.options.join(', ')}`);
      return v;
    default:
      return v;
  }
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Apply a batch of changes. `null` removes an override (reverting to env/default).
 * Returns the list of keys actually changed.
 */
export function updateEnv(changes: Record<string, string | null>): string[] {
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(changes)) {
    if (!ENV_KEY_RE.test(key)) throw new Error(`Invalid variable name: ${key}`);
    if (isProtectedEnv(key)) throw new Error(`${key} is protected and cannot be changed from the dashboard`);
    const def = SETTINGS_SCHEMA.find(s => s.key === key);
    if (def?.readOnly) throw new Error(`${def.label} is read-only`);

    if (raw === null) {
      if (key in _file.env) {
        delete _file.env[key];
        const orig = originalEnv[key];
        if (orig === undefined) delete process.env[key]; else process.env[key] = orig;
        changed.push(key);
      }
      continue;
    }
    const value = def ? validateSetting(def, raw) : String(raw);
    if (_file.env[key] !== value) {
      if (!(key in originalEnv)) originalEnv[key] = process.env[key];
      _file.env[key] = value;
      process.env[key] = value;
      changed.push(key);
    }
  }
  if (changed.length) persist();
  return changed;
}

/** Custom (non-schema) variables managed through the dashboard. */
export function listCustomEnv() {
  return Object.entries(_file.env)
    .filter(([k]) => !SCHEMA_KEYS.has(k))
    .map(([key, value]) => ({ key, value, envValue: originalEnv[key] ?? null }));
}

export function exportSettings(): SettingsFile {
  return JSON.parse(JSON.stringify(_file));
}

export function importSettings(data: unknown): string[] {
  const env = (data as Partial<SettingsFile>)?.env;
  if (!env || typeof env !== 'object') throw new Error('Invalid backup file: missing "env" object');
  const changes: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(env)) {
    if (isProtectedEnv(k) || SETTINGS_SCHEMA.find(s => s.key === k)?.readOnly) continue;
    changes[k] = String(v);
  }
  return updateEnv(changes);
}
