import { chromium, type BrowserContext, type Page, type Browser } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import type { AppConfig } from '../types/index.js';
import { applyStealthPatches } from './stealth.js';
import { logger } from '../logger.js';

export function createBrowserManager(config: AppConfig) {
  let _browser: Browser | null = null;
  let _context: BrowserContext | null = null;
  let _page: Page | null = null;
  let _contextWasFresh = false;
  let closing = false;
  const isMac = platform() === 'darwin';
  let _launchedAt: number | null = null;
  let _restarts = 0;

  // ── Request serialization (prevents racing on shared _page) ─────
  let _requestQueue: Promise<void> = Promise.resolve();

  async function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      _requestQueue = _requestQueue.then(async () => {
        try { resolve(await fn()); } catch (e) { reject(e); }
      });
    });
  }

  // ── Tab name registry (name → Page mapping) ────────────────────
  let _tabNames = new Map<string, Page>();

  function setTabName(name: string, page?: Page): void {
    const target = page || _page;
    if (!target) throw new Error('No page available to name');
    _tabNames.set(name, target);
    target.on('close', () => {
      for (const [n, p] of _tabNames) {
        if (p === target) { _tabNames.delete(n); break; }
      }
    });
  }

  // ── Last resolved tab info (for output enrichment) ──────────────
  let _lastTabName: string | null = null;
  let _lastTabIndex = 0;

  function getLastTabInfo(): { name: string | null; index: number } {
    return { name: _lastTabName, index: _lastTabIndex };
  }

  // ── Tab activity tracking + idle cleanup ────────────────────────
  let _tabActivity = new Map<Page, number>();
  let _idleTimer: ReturnType<typeof setInterval> | null = null;

  function updateActivity(page: Page): void {
    _tabActivity.set(page, Date.now());
  }

  async function discardPage(page: Page): Promise<void> {
    // Try CDP-based tab discard first (preserves URL, frees memory)
    try {
      const cdpSession = await _context!.newCDPSession(page);
      const { targetInfo } = await cdpSession.send('Target.getTargetInfo');
      if (targetInfo?.targetId) {
        await (cdpSession.send as any)('Target.discardTarget', { targetId: targetInfo.targetId });
        return;
      }
    } catch {
      // CDP discard failed — fall through
    }
    // Fallback: navigate to about:blank (keeps tab entry, frees DOM memory)
    try { await page.goto('about:blank'); } catch {}
  }

  function startIdleCleanup(): void {
    if (_idleTimer || !config.tabIdleTimeoutMs) return;
    _idleTimer = setInterval(async () => {
      const now = Date.now();
      const threshold = config.tabIdleTimeoutMs!;
      if (!_context) return;
      for (const page of _context.pages()) {
        if (page === _page) continue; // never discard active tab
        const lastUsed = _tabActivity.get(page);
        if (lastUsed && (now - lastUsed) > threshold) {
          for (const [n, p] of _tabNames) {
            if (p === page) _tabNames.delete(n);
          }
          _tabActivity.delete(page);
          await discardPage(page);
        }
      }
    }, 60000);
  }

  function stopIdleCleanup(): void {
    if (_idleTimer) {
      clearInterval(_idleTimer);
      _idleTimer = null;
    }
  }

  // ── Persistent cookie store (survives browser restarts) ──────────
  let _storedCookies: any[] = [];

  const userDataDir = join(config.dataDir, 'chrome-profile');
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true });
  }

  async function replayStoredCookies(ctx: BrowserContext): Promise<void> {
    if (_storedCookies.length > 0) {
      try {
        await ctx.addCookies(_storedCookies);
      } catch { /* ignore — cookies may be stale */ }
    }
  }

  async function getBrowser(): Promise<Browser> {
    if (!_browser || !_browser.isConnected()) {
      if (_browser) {
        try { await _browser.close(); } catch { /* ignore */ }
        _browser = null;
        _context = null;
        _page = null;
      }
      const launchArgs = [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-save-password-bubble',
        '--disable-popup-blocking',
        '--disable-notifications',
        '--disable-translate',
        '--disable-infobars',
        '--disable-search-engine-choice-screen',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disk-cache-size=1',
        '--disable-logging',
      ];
      if (!isMac) launchArgs.push('--no-sandbox');
      if (config.proxyUrl) launchArgs.push(`--proxy-server=${config.proxyUrl}`);

      const headlessMode = config.headless;
      if (headlessMode === 'new') {
        launchArgs.push('--headless=new');
      }

      _browser = await chromium.launch({
        headless: headlessMode === 'new' ? false : (headlessMode as boolean | undefined),
        channel: undefined,
        executablePath: config.chromePath || undefined,
        args: launchArgs,
      });

      _launchedAt = Date.now();
      logger.info('browser', `Chromium ${_browser.version()} launched`, { headless: String(headlessMode), stealth: config.stealthLevel, proxy: !!config.proxyUrl });

      _browser.on('disconnected', () => {
        if (!closing) logger.warn('browser', 'Chromium disconnected');
        _context = null;
        _page = null;
        _browser = null;
        _launchedAt = null;
        _tabNames.clear();
      });
    }
    return _browser;
  }

  async function getContext(): Promise<BrowserContext> {
    if (!_context) {
      const browser = await getBrowser();
      _context = await browser.newContext({
        viewport: { width: 1920 + Math.floor(Math.random() * 100 - 50), height: 1080 + Math.floor(Math.random() * 60 - 30) },
        deviceScaleFactor: 1,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { latitude: 40.7128, longitude: -74.006 },
        permissions: [],
        ignoreHTTPSErrors: true,
        proxy: config.proxyUrl ? { server: config.proxyUrl } : undefined,
      });
      _contextWasFresh = true;
    } else {
      _contextWasFresh = false;
    }
    return _context;
  }

  async function acquireContext(tabIndex?: number, tabName?: string): Promise<{ context: BrowserContext; page: Page }> {
    if (closing) throw new Error('Browser is shutting down');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const context = await getContext();
        startIdleCleanup(); // ensure idle timer is running
        if (!_page || _page.isClosed()) {
          _page = await context.newPage();
          await applyStealthPatches(_page, config);
        }
        // Replay persisted cookies on fresh contexts (browser restart recovery)
        if (_contextWasFresh && _storedCookies.length > 0) {
          await replayStoredCookies(context);
        }

        // Resolve by name first (most specific), then by index, else active tab
        if (tabName !== undefined) {
          const named = _tabNames.get(tabName);
          if (!named || named.isClosed()) {
            throw new Error(`No open tab found with name "${tabName}"`);
          }
          _page = named;
          await _page.bringToFront();
        } else if (tabIndex !== undefined) {
          const pages = context.pages();
          if (tabIndex < 0 || tabIndex >= pages.length) {
            throw new Error(`Tab index ${tabIndex} out of range (0-${pages.length - 1})`);
          }
          _page = pages[tabIndex];
          await _page.bringToFront();
        }

        // Track which tab was resolved (for output enrichment)
        _lastTabName = tabName !== undefined ? tabName : null;
        _lastTabIndex = context.pages().indexOf(_page);
        updateActivity(_page);

        return { context, page: _page };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('closed') || msg.includes('Connection') || msg.includes('Target')) {
          try { await _page?.close().catch(() => {}); } catch { /* ignore */ }
          try { await _context?.close().catch(() => {}); } catch { /* ignore */ }
          try { await _browser?.close().catch(() => {}); } catch { /* ignore */ }
          _page = null;
          _context = null;
          _browser = null;
          if (attempt === 1) throw err;
          continue;
        }
        throw err;
      }
    }
    throw new Error('Failed to acquire browser context after retry');
  }

  async function pages(): Promise<Page[]> {
    if (!_context) return [];
    return _context.pages();
  }

  async function releaseContext(): Promise<void> {
    // With persistent context, we don't close between calls
  }

  async function getPage(): Promise<Page> {
    const { page } = await acquireContext();
    return page;
  }

  async function close(): Promise<void> {
    closing = true;
    stopIdleCleanup();
    try { await _page?.close(); } catch { /* ignore */ }
    try { await _context?.close(); } catch { /* ignore */ }
    try { await _browser?.close(); } catch { /* ignore */ }
    _page = null;
    _context = null;
    _browser = null;
  }

  function storeCookies(cookies: any[]): void {
    _storedCookies = cookies;
  }

  function getStoredCookies(): any[] {
    return _storedCookies;
  }

  function clearStoredCookies(): void {
    _storedCookies = [];
  }

  async function getTabStats(): Promise<Array<{ index: number; name: string | null; url: string; title: string; idleSeconds: number }>> {
    if (!_context) return [];
    const pages = _context.pages();
    const now = Date.now();
    const stats = [];
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const lastUsed = _tabActivity.get(p);
      const idleSeconds = lastUsed ? Math.floor((now - lastUsed) / 1000) : -1;
      let name: string | null = null;
      for (const [n, np] of _tabNames) {
        if (np === p) { name = n; break; }
      }
      stats.push({
        index: i,
        name,
        url: p.url(),
        title: await p.title().catch(() => ''),
        idleSeconds,
      });
    }
    return stats;
  }

  async function runLocked<T>(fn: () => Promise<T>): Promise<T> {
    return enqueue(fn);
  }

  // ── Dashboard management helpers ───────────────────────────────

  function getStatus() {
    return {
      connected: !!_browser && _browser.isConnected(),
      version: _browser?.isConnected() ? _browser.version() : null,
      launchedAt: _launchedAt,
      restarts: _restarts,
      tabCount: _context ? _context.pages().length : 0,
      storedCookies: _storedCookies.length,
      idleCleanup: !!_idleTimer,
    };
  }

  function getActiveIndex(): number {
    if (!_context || !_page || _page.isClosed()) return -1;
    return _context.pages().indexOf(_page);
  }

  function pageAt(index: number): Page {
    const list = _context ? _context.pages() : [];
    if (index < 0 || index >= list.length) throw new Error(`Tab index ${index} out of range`);
    return list[index];
  }

  async function activateTab(index: number): Promise<void> {
    const p = pageAt(index);
    _page = p;
    await p.bringToFront();
    updateActivity(p);
  }

  async function closeTab(index: number): Promise<void> {
    const p = pageAt(index);
    for (const [n, np] of _tabNames) if (np === p) _tabNames.delete(n);
    _tabActivity.delete(p);
    await p.close();
    if (_page === p) {
      const remaining = _context ? _context.pages() : [];
      _page = remaining.length ? remaining[remaining.length - 1] : null;
    }
  }

  function renameTab(index: number, name: string | null): void {
    const p = pageAt(index);
    for (const [n, np] of _tabNames) if (np === p) _tabNames.delete(n);
    if (name) {
      const existing = _tabNames.get(name);
      if (existing && existing !== p && !existing.isClosed()) throw new Error(`Name "${name}" is already used by another tab`);
      setTabName(name, p);
    }
  }

  /** Close Chromium; it relaunches lazily on the next tool call with the current config. */
  async function restart(): Promise<void> {
    stopIdleCleanup();
    closing = true;
    try { await _context?.close(); } catch { /* ignore */ }
    try { await _browser?.close(); } catch { /* ignore */ }
    _page = null;
    _context = null;
    _browser = null;
    _launchedAt = null;
    _tabNames.clear();
    _tabActivity.clear();
    closing = false;
    _restarts++;
    logger.info('browser', 'Browser restarted from dashboard — will relaunch on next request');
  }

  return { acquireContext, releaseContext, getPage, close, storeCookies, getStoredCookies, clearStoredCookies, runLocked, pages, setTabName, getLastTabInfo, getTabStats, getStatus, getActiveIndex, activateTab, closeTab, renameTab, restart };
}

export type BrowserManager = ReturnType<typeof createBrowserManager>;
