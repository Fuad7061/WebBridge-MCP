import { chromium, type BrowserContext, type Page, type Browser } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';
import type { AppConfig } from '../types/index.js';
import { applyStealthPatches } from './stealth.js';

export function createBrowserManager(config: AppConfig) {
  let _browser: Browser | null = null;
  let _context: BrowserContext | null = null;
  let _page: Page | null = null;
  let closing = false;
  const isMac = platform() === 'darwin';

  const userDataDir = join(config.dataDir, 'chrome-profile');
  if (!existsSync(userDataDir)) {
    mkdirSync(userDataDir, { recursive: true });
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

      _browser.on('disconnected', () => {
        _context = null;
        _page = null;
        _browser = null;
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
    }
    return _context;
  }

  async function acquireContext(): Promise<{ context: BrowserContext; page: Page }> {
    if (closing) throw new Error('Browser is shutting down');

    // Attempt up to 2 times (in case browser crashed and needs restart)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const context = await getContext();
        if (!_page || _page.isClosed()) {
          _page = await context.newPage();
          await applyStealthPatches(_page, config);
        }
        return { context, page: _page };
      } catch (err) {
        // If browser/context is dead, reset everything and retry
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

  async function releaseContext(): Promise<void> {
    // With persistent context, we don't close between calls
  }

  async function getPage(): Promise<Page> {
    const { page } = await acquireContext();
    return page;
  }

  async function close(): Promise<void> {
    closing = true;
    try { await _page?.close(); } catch { /* ignore */ }
    try { await _context?.close(); } catch { /* ignore */ }
    try { await _browser?.close(); } catch { /* ignore */ }
    _page = null;
    _context = null;
    _browser = null;
  }

  return { acquireContext, releaseContext, getPage, close };
}

export type BrowserManager = ReturnType<typeof createBrowserManager>;
