/**
 * Dashboard: static SPA + JSON API under /dashboard.
 * All /dashboard/api/* routes (except session/login) require dashboard auth.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readFileSync, existsSync, createReadStream, statSync, promises as fsp } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, ToolContext } from '../types/index.js';
import { getConfig } from '../config.js';
import {
  SETTINGS_SCHEMA, describeSetting, updateEnv, listCustomEnv, exportSettings, importSettings,
  getSettingsMeta, isProtectedEnv, SCHEMA_KEYS,
} from '../settings.js';
import { logger, type LogEntry, type LogLevel } from '../logger.js';
import { metrics } from '../metrics.js';
import { createToolRegistry } from '../mcp/registry.js';
import { sseClientInfo } from '../api/routes/index.js';
import { systemInfo, storageInfo, invalidateStorageCache } from './system.js';
import {
  isAuthenticated, authRequired, checkPassword, issueSession, clearSession,
  loginBlocked, recordFailure, clearFailures,
} from './auth.js';

const VERSION = '1.0.0';

// ── Static assets ─────────────────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = [
  join(here, '..', '..', 'public', 'dashboard'),
  join(process.cwd(), 'public', 'dashboard'),
].find(p => existsSync(p)) || join(process.cwd(), 'public', 'dashboard');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function sendStatic(reply: FastifyReply, file: string) {
  const safe = file.replace(/\\/g, '/').split('/').filter(s => s && s !== '..').join('/');
  const p = join(PUBLIC_DIR, safe);
  if (!p.startsWith(PUBLIC_DIR) || !existsSync(p) || !statSync(p).isFile()) {
    return reply.status(404).send({ error: 'Not found' });
  }
  reply
    .header('Content-Type', MIME[extname(p)] || 'application/octet-stream')
    .header('Cache-Control', 'no-cache')
    .header('X-Content-Type-Options', 'nosniff');
  return reply.send(readFileSync(p));
}

// ── Setting → AppConfig field mapping (for live apply) ────
const FIELD_MAP: Record<string, keyof AppConfig> = {
  WEBBRIDGE_AUTH_TOKEN: 'authToken',
  WEBBRIDGE_DASHBOARD_PASSWORD: 'dashboardPassword',
  WEBBRIDGE_HEADLESS: 'headless',
  WEBBRIDGE_STEALTH_LEVEL: 'stealthLevel',
  WEBBRIDGE_PROXY_URL: 'proxyUrl',
  CHROME_PATH: 'chromePath',
  WEBBRIDGE_TAB_IDLE_TIMEOUT_MS: 'tabIdleTimeoutMs',
  WEBBRIDGE_MAX_CONCURRENCY: 'maxConcurrency',
  WEBBRIDGE_TYPING_DELAY_MS: 'typingDelayMs',
  WEBBRIDGE_LOG_LEVEL: 'logLevel',
  WEBBRIDGE_LOG_TOOL_CALLS: 'logToolCalls',
  WEBBRIDGE_LOG_RETENTION_DAYS: 'logRetentionDays',
  WEBBRIDGE_LOG_MAX_SIZE_MB: 'logMaxSizeMb',
};

const SENSITIVE_RE = /pass|secret|token|key|auth|cookie|credential|private|proxy/i;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function err(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ ok: false, error: message });
}

export async function registerDashboard(app: FastifyInstance, ctx: ToolContext): Promise<void> {
  const config = ctx.config;
  const registry = createToolRegistry(ctx);
  const pendingBrowser = new Set<string>();
  const pendingRestart = new Set<string>();

  function applyChanged(changed: string[]) {
    const fresh = getConfig();
    let logChanged = false;
    for (const key of changed) {
      const def = SETTINGS_SCHEMA.find(s => s.key === key);
      if (!def) { pendingRestart.add(key); continue; } // custom env var
      if (def.apply === 'restart') { pendingRestart.add(key); continue; }
      const field = FIELD_MAP[key];
      if (field) (config as unknown as Record<string, unknown>)[field] = fresh[field];
      if (def.apply === 'browser') pendingBrowser.add(key);
      if (def.group === 'logging') logChanged = true;
    }
    if (logChanged) {
      logger.configure({ level: config.logLevel, retentionDays: config.logRetentionDays, maxSizeMb: config.logMaxSizeMb });
    }
  }

  app.get('/', async (_req, reply) => sendStatic(reply, 'index.html'));
  app.get('/favicon.ico', async (_req, reply) => sendStatic(reply, 'favicon.svg'));
  app.get('/assets/*', async (req, reply) => sendStatic(reply, 'assets/' + (req.params as { '*': string })['*']));

  await app.register(async (dash) => {
    // ── Static SPA ──
    dash.get('/', async (_req, reply) => sendStatic(reply, 'index.html'));
    dash.get('/assets/*', async (req, reply) => sendStatic(reply, 'assets/' + (req.params as { '*': string })['*']));

    // ── Auth gate for API ──
    dash.addHook('onRequest', async (req, reply) => {
      const url = req.url.split('?')[0];
      if (!url.startsWith('/dashboard/api/')) return;
      if (url === '/dashboard/api/session' || url === '/dashboard/api/login') return;
      if (!isAuthenticated(req, config)) {
        return reply.status(401).send({ ok: false, error: 'Unauthorized' });
      }
    });

    // Security headers for everything served under /dashboard
    dash.addHook('onSend', async (_req, reply, payload) => {
      reply.header('X-Frame-Options', 'DENY');
      reply.header('Referrer-Policy', 'same-origin');
      return payload;
    });

    // ── Session ──
    dash.get('/api/session', async (req) => ({
      ok: true,
      authenticated: isAuthenticated(req, config),
      authRequired: authRequired(config),
      version: VERSION,
    }));

    dash.post('/api/login', async (req, reply) => {
      const ip = req.ip;
      const wait = loginBlocked(ip);
      if (wait) return err(reply, 429, `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} min.`);
      const { password } = (req.body as { password?: string }) || {};
      if (!checkPassword(config, String(password || ''))) {
        recordFailure(ip);
        logger.warn('dashboard', 'Failed dashboard login', { ip });
        return err(reply, 401, 'Invalid password');
      }
      clearFailures(ip);
      issueSession(req, reply, config);
      logger.info('dashboard', 'Dashboard login', { ip });
      return { ok: true };
    });

    dash.post('/api/logout', async (_req, reply) => {
      clearSession(reply);
      return { ok: true };
    });

    // ── Overview ──
    dash.get('/api/overview', async () => {
      const sys = systemInfo();
      const status = ctx.browser.getStatus();
      const snap = metrics.snapshot();
      const storage = await storageInfo(config.dataDir);
      const warnings: Array<{ level: 'warn' | 'error' | 'info'; message: string }> = [];
      if (!config.authToken) warnings.push({ level: 'error', message: 'API authentication is disabled. Set an API auth token in Settings → Security.' });
      if (sys.containerized && storage.persistentMount === false) {
        warnings.push({ level: 'warn', message: `${config.dataDir} is not a mounted volume — settings, logs and sessions will be lost on redeploy. Add a persistent storage mount in Coolify.` });
      }
      if (config.logLevel === 'debug') warnings.push({ level: 'info', message: 'Debug logging is enabled — this increases disk IO.' });
      if (status.tabCount > 15) warnings.push({ level: 'warn', message: `${status.tabCount} tabs are open. Close unused tabs or enable the idle timeout to save memory.` });
      const memUse = sys.memory.containerUsage, memLim = sys.memory.containerLimit;
      if (memUse && memLim && memUse / memLim > 0.85) warnings.push({ level: 'warn', message: `Container memory at ${Math.round(memUse / memLim * 100)}% of its limit.` });
      if (storage.volume && storage.volume.free / storage.volume.total < 0.1) warnings.push({ level: 'warn', message: 'Less than 10% free space on the data volume.' });

      return {
        ok: true,
        version: VERSION,
        mode: config.mode,
        listen: `${config.host}:${config.port}`,
        system: sys,
        browser: { ...status, activeIndex: ctx.browser.getActiveIndex() },
        metrics: { session: snap.session, lifetime: snap.lifetime, timeline: snap.timeline, recent: snap.recent.slice(0, 8), topTools: snap.tools.slice(0, 6) },
        connections: sseClientInfo.size,
        logs: { ...logger.stats(), diskBytes: logger.totalSize(), level: config.logLevel },
        storage: { totalBytes: storage.totalBytes, volume: storage.volume, persistentMount: storage.persistentMount, dataDir: storage.dataDir },
        security: { apiAuth: !!config.authToken, dashboardAuth: authRequired(config), separateDashboardPassword: !!config.dashboardPassword },
        pending: { browser: [...pendingBrowser], restart: [...pendingRestart] },
        warnings,
      };
    });

    dash.get('/api/metrics', async () => ({ ok: true, ...metrics.snapshot() }));
    dash.post('/api/metrics/reset', async () => { metrics.reset(); logger.info('dashboard', 'Usage statistics reset'); return { ok: true }; });

    // ── Tabs ──
    dash.get('/api/tabs', async () => {
      const status = ctx.browser.getStatus();
      let tabs: Awaited<ReturnType<typeof ctx.browser.getTabStats>> = [];
      try { tabs = await withTimeout(ctx.browser.getTabStats(), 5000, 'Listing tabs'); } catch (e) { logger.warn('dashboard', String(e)); }
      const active = ctx.browser.getActiveIndex();
      return {
        ok: true,
        browser: status,
        tabs: tabs.map(t => {
          let host = '';
          try { host = new URL(t.url).hostname; } catch { /* about:blank etc */ }
          return { ...t, host, active: t.index === active };
        }),
      };
    });

    dash.get('/api/tabs/:index/screenshot', async (req, reply) => {
      const index = Number((req.params as { index: string }).index);
      const pages = await ctx.browser.pages();
      const page = pages[index];
      if (!page) return err(reply, 404, 'Tab not found');
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 55, timeout: 8000, animations: 'disabled' });
        reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'no-store');
        return reply.send(buf);
      } catch (e) {
        return err(reply, 500, e instanceof Error ? e.message : String(e));
      }
    });

    dash.post('/api/browser/launch', async () => {
      await ctx.browser.runLocked(() => ctx.browser.acquireContext());
      logger.info('dashboard', 'Browser launched from dashboard');
      return { ok: true };
    });

    dash.post('/api/browser/restart', async () => {
      await ctx.browser.runLocked(() => ctx.browser.restart());
      pendingBrowser.clear();
      return { ok: true };
    });

    dash.post('/api/tabs', async (req, reply) => {
      const { url, name } = (req.body as { url?: string; name?: string }) || {};
      if (url && !/^(https?:|about:|data:)/i.test(url)) return err(reply, 400, 'URL must start with http(s)://');
      const args: Record<string, unknown> = {};
      if (url) args.url = url;
      if (name) args.name = name;
      const result = await registry.callTool('browser_new_tab', args, 'dashboard');
      if (result.isError) return err(reply, 400, result.content[0]?.text || 'Failed to open tab');
      return { ok: true, message: result.content[0]?.text };
    });

    const tabAction = (fn: (index: number, body: Record<string, unknown>) => Promise<unknown>) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        const index = Number((req.params as { index: string }).index);
        if (!Number.isInteger(index) || index < 0) return err(reply, 400, 'Invalid tab index');
        try {
          await ctx.browser.runLocked(() => fn(index, (req.body as Record<string, unknown>) || {}) as Promise<void>);
          return { ok: true };
        } catch (e) {
          return err(reply, 400, e instanceof Error ? e.message : String(e));
        }
      };

    dash.post('/api/tabs/:index/activate', tabAction(i => ctx.browser.activateTab(i)));
    dash.delete('/api/tabs/:index', tabAction(async i => { await ctx.browser.closeTab(i); logger.info('dashboard', `Closed tab ${i}`); }));
    dash.post('/api/tabs/:index/rename', tabAction(async (i, b) => ctx.browser.renameTab(i, b.name ? String(b.name).trim() : null)));
    dash.post('/api/tabs/:index/navigate', tabAction(async (i, b) => {
      const url = String(b.url || '');
      if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http(s)://');
      const p = (await ctx.browser.pages())[i];
      if (!p) throw new Error('Tab not found');
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }));
    dash.post('/api/tabs/:index/reload', tabAction(async i => {
      const p = (await ctx.browser.pages())[i];
      if (!p) throw new Error('Tab not found');
      await p.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    }));
    dash.post('/api/tabs/:index/back', tabAction(async i => {
      const p = (await ctx.browser.pages())[i];
      if (!p) throw new Error('Tab not found');
      await p.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    }));

    dash.post('/api/tabs/close-others', async () => {
      let closed = 0;
      await ctx.browser.runLocked(async () => {
        const active = ctx.browser.getActiveIndex();
        const pages = await ctx.browser.pages();
        for (let i = pages.length - 1; i >= 0; i--) {
          if (i === active) continue;
          try { await ctx.browser.closeTab(i); closed++; } catch { /* ignore */ }
        }
      });
      logger.info('dashboard', `Closed ${closed} background tabs`);
      return { ok: true, closed };
    });

    // ── Settings ──
    dash.get('/api/settings', async () => {
      const settings = SETTINGS_SCHEMA.map(def => {
        const d = describeSetting(def);
        if (def.key === 'WEBBRIDGE_DATA_DIR') return { ...d, value: config.dataDir };
        if (def.key === 'WEBBRIDGE_MODE') return { ...d, value: config.mode };
        return d;
      });
      return { ok: true, settings, meta: getSettingsMeta(), pending: { browser: [...pendingBrowser], restart: [...pendingRestart] } };
    });

    dash.put('/api/settings', async (req, reply) => {
      const changes = ((req.body as { changes?: Record<string, string | null> }) || {}).changes;
      if (!changes || typeof changes !== 'object') return err(reply, 400, 'Body must be { changes: { KEY: value | null } }');
      for (const k of Object.keys(changes)) if (!SCHEMA_KEYS.has(k)) return err(reply, 400, `Unknown setting ${k}. Use the Environment page for custom variables.`);
      try {
        const changed = updateEnv(changes);
        applyChanged(changed);
        if (changed.length) logger.info('dashboard', `Settings updated: ${changed.join(', ')}`);
        return { ok: true, changed, pending: { browser: [...pendingBrowser], restart: [...pendingRestart] } };
      } catch (e) {
        return err(reply, 400, e instanceof Error ? e.message : String(e));
      }
    });

    dash.get('/api/settings/export', async (_req, reply) => {
      reply.header('Content-Disposition', `attachment; filename="webbridge-settings-${new Date().toISOString().slice(0, 10)}.json"`);
      return exportSettings();
    });

    dash.post('/api/settings/import', async (req, reply) => {
      try {
        const changed = importSettings(req.body);
        applyChanged(changed);
        logger.info('dashboard', `Settings imported (${changed.length} changed)`);
        return { ok: true, changed };
      } catch (e) {
        return err(reply, 400, e instanceof Error ? e.message : String(e));
      }
    });

    // ── Environment variables ──
    dash.get('/api/env', async () => {
      const runtime = Object.keys(process.env).sort().map(key => {
        const value = process.env[key] || '';
        const sensitive = SENSITIVE_RE.test(key);
        return { key, value: sensitive ? (value ? '••••••••' : '') : value, sensitive, managed: SCHEMA_KEYS.has(key), protected: isProtectedEnv(key) };
      });
      return { ok: true, custom: listCustomEnv(), runtime };
    });

    dash.put('/api/env', async (req, reply) => {
      const changes = ((req.body as { changes?: Record<string, string | null> }) || {}).changes;
      if (!changes || typeof changes !== 'object') return err(reply, 400, 'Body must be { changes: { KEY: value | null } }');
      for (const k of Object.keys(changes)) if (SCHEMA_KEYS.has(k)) return err(reply, 400, `${k} is a managed setting — edit it on the Settings page.`);
      try {
        const changed = updateEnv(changes);
        applyChanged(changed);
        if (changed.length) logger.info('dashboard', `Environment variables updated: ${changed.join(', ')}`);
        return { ok: true, changed };
      } catch (e) {
        return err(reply, 400, e instanceof Error ? e.message : String(e));
      }
    });

    // ── Logs ──
    const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    dash.get('/api/logs', async (req) => {
      const q = req.query as Record<string, string>;
      const level = LEVELS.includes(q.level as LogLevel) ? (q.level as LogLevel) : undefined;
      return {
        ok: true,
        entries: logger.recent({ level, cat: q.cat || undefined, q: q.q || undefined, limit: Math.min(2000, Number(q.limit) || 500) }),
        categories: logger.categories(),
        stats: logger.stats(),
      };
    });

    dash.get('/api/logs/stream', async (req, reply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(': connected\n\n');
      const unsubscribe = logger.subscribe((e: LogEntry) => {
        reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
      });
      const hb = setInterval(() => reply.raw.write(': ping\n\n'), 25000);
      req.raw.on('close', () => { clearInterval(hb); unsubscribe(); });
    });

    dash.get('/api/logs/files', async () => {
      logger.flush();
      return { ok: true, files: logger.listFiles(), totalBytes: logger.totalSize(), dir: logger.logDir };
    });

    dash.get('/api/logs/files/:name', async (req, reply) => {
      const { name } = req.params as { name: string };
      const q = req.query as Record<string, string>;
      if (!logger.isValidFileName(name)) return err(reply, 400, 'Invalid file name');
      logger.flush();
      const p = join(logger.logDir, name);
      if (!existsSync(p)) return err(reply, 404, 'File not found');

      if (q.download) {
        reply.header('Content-Type', 'application/x-ndjson').header('Content-Disposition', `attachment; filename="${name}"`);
        return reply.send(createReadStream(p));
      }

      const MAX_READ = 5 * 1024 * 1024;
      const size = statSync(p).size;
      const fh = await fsp.open(p, 'r');
      const start = Math.max(0, size - MAX_READ);
      const buf = Buffer.alloc(size - start);
      await fh.read(buf, 0, buf.length, start);
      await fh.close();
      let lines = buf.toString('utf-8').split('\n');
      if (start > 0) lines.shift(); // drop partial first line
      const level = LEVELS.includes(q.level as LogLevel) ? LEVELS.indexOf(q.level as LogLevel) : 0;
      const search = (q.q || '').toLowerCase();
      const entries: LogEntry[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as LogEntry;
          if (LEVELS.indexOf(e.level) < level) continue;
          if (q.cat && e.cat !== q.cat) continue;
          if (search && !line.toLowerCase().includes(search)) continue;
          entries.push(e);
        } catch { /* skip malformed */ }
      }
      const limit = Math.min(5000, Number(q.limit) || 1000);
      return { ok: true, entries: entries.slice(-limit), truncated: start > 0 || entries.length > limit, size };
    });

    dash.delete('/api/logs/files/:name', async (req, reply) => {
      const { name } = req.params as { name: string };
      try { logger.deleteFile(name); } catch (e) { return err(reply, 400, e instanceof Error ? e.message : String(e)); }
      invalidateStorageCache();
      logger.info('dashboard', `Deleted log file ${name}`);
      return { ok: true };
    });

    dash.delete('/api/logs', async () => {
      const n = logger.deleteAll();
      invalidateStorageCache();
      logger.info('dashboard', `All logs cleared (${n} files deleted)`);
      return { ok: true, deleted: n };
    });

    dash.post('/api/logs/clear-memory', async () => { logger.clearMemory(); return { ok: true }; });

    dash.post('/api/logs/prune', async () => {
      const r = logger.maintenance();
      invalidateStorageCache();
      return { ok: true, ...r };
    });

    // ── Storage ──
    dash.get('/api/storage', async (req) => {
      if ((req.query as Record<string, string>).refresh) invalidateStorageCache();
      return { ok: true, ...(await storageInfo(config.dataDir)) };
    });

    dash.post('/api/storage/clear', async (req, reply) => {
      const { target } = (req.body as { target?: string }) || {};
      switch (target) {
        case 'logs':
          logger.deleteAll();
          break;
        case 'chrome-profile': {
          const p = join(config.dataDir, 'chrome-profile');
          await fsp.rm(p, { recursive: true, force: true });
          await fsp.mkdir(p, { recursive: true });
          break;
        }
        case 'session':
          for (const k of Object.keys(ctx.session.export())) ctx.session.delete(k);
          break;
        case 'cookies':
          ctx.browser.clearStoredCookies();
          break;
        case 'stats':
          metrics.reset();
          break;
        default:
          return err(reply, 400, 'Unknown storage target');
      }
      invalidateStorageCache();
      logger.info('dashboard', `Storage cleared: ${target}`);
      return { ok: true };
    });

    // ── Session store ──
    dash.get('/api/session-store', async () => {
      const data = ctx.session.export();
      return { ok: true, entries: Object.entries(data).map(([key, value]) => ({ key, value: value.length > 500 ? value.slice(0, 500) + '…' : value, size: value.length })) };
    });
    dash.delete('/api/session-store/:key', async (req) => {
      ctx.session.delete(decodeURIComponent((req.params as { key: string }).key));
      return { ok: true };
    });

    // ── Connections ──
    dash.get('/api/connections', async () => ({ ok: true, clients: [...sseClientInfo.values()] }));

    // ── Tools / playground ──
    dash.get('/api/tools', async () => {
      const snap = metrics.snapshot();
      const byName = new Map(snap.tools.map(t => [t.name, t]));
      return { ok: true, tools: registry.listTools().map(t => ({ ...t, stats: byName.get(t.name) || null })) };
    });

    dash.post('/api/tools/:name/run', async (req) => {
      const { name } = req.params as { name: string };
      const args = (req.body as Record<string, unknown>) || {};
      const started = Date.now();
      const result = await registry.callTool(name, args, 'dashboard');
      const errText = result.isError ? result.content.find(c => c.type === 'text')?.text || 'Tool execution failed' : undefined;
      return {
        ok: true,
        success: !result.isError,
        error: errText,
        ms: Date.now() - started,
        result,
      };
    });

    // ── Server control ──
    dash.post('/api/server/restart', async () => {
      logger.warn('dashboard', 'Server restart requested from dashboard');
      logger.flush();
      metrics.save();
      setTimeout(async () => {
        try { await ctx.browser.close(); } catch { /* ignore */ }
        process.exit(0); // Docker/Coolify restart policy brings the container back up
      }, 400);
      return { ok: true, supervised: systemInfo().containerized };
    });
  }, { prefix: '/dashboard' });
}
