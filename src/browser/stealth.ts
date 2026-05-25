import type { Page } from 'playwright';
import type { AppConfig } from '../types/index.js';

export async function applyStealthPatches(page: Page, config: AppConfig): Promise<void> {
  if (config.stealthLevel === 'basic') {
    await patchBasic(page);
  } else if (config.stealthLevel === 'standard') {
    await patchBasic(page);
    await patchStandard(page);
  } else {
    await patchBasic(page);
    await patchStandard(page);
    await patchFull(page);
  }
}

async function patchBasic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Override webdriver getter on the prototype so it's invisible to property checks
    const navProto = Navigator.prototype as unknown as Record<string, PropertyDescriptor | undefined>;
    const desc = Object.getOwnPropertyDescriptor(navProto, 'webdriver');
    if (desc) {
      Object.defineProperty(navProto, 'webdriver', {
        get: () => undefined,
        set: () => {},
        configurable: true,
        enumerable: true,
      });
    } else {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    }
  });
}

async function patchStandard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // ── Plugins ──────────────────────────────────────────────────────
    class PluginReplica {
      name: string;
      filename: string;
      length = 0;
      constructor(name: string, filename: string) { this.name = name; this.filename = filename; }
      item() { return null; }
      namedItem() { return null; }
      refresh() {}
    }
    const pluginData = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ];
    const plugins = pluginData.map(p => new PluginReplica(p.name, p.filename));
    (plugins as unknown as { length: number }).length = pluginData.length;
    Object.defineProperty(navigator, 'plugins', {
      get: () => plugins as unknown as PluginArray,
      configurable: true,
    });
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => [] as unknown as MimeTypeArray,
      configurable: true,
    });

    // ── Languages ────────────────────────────────────────────────────
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true,
    });

    // ── Permissions ──────────────────────────────────────────────────
    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = async (desc: PermissionDescriptor) => {
      if (desc.name === 'notifications' || desc.name === 'geolocation') {
        return { state: 'prompt', onchange: null } as PermissionStatus;
      }
      if ((desc.name as string) === 'clipboard-read' || (desc.name as string) === 'clipboard-write') {
        return { state: 'granted', onchange: null } as PermissionStatus;
      }
      return originalQuery(desc);
    };

    // ── WebGL ────────────────────────────────────────────────────────
    const glParams = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param: number) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      if (param === 3415) return 24; // MAX_VIEWPORT_DIMS
      return glParams.call(this, param);
    };
    const gl2 = WebGL2RenderingContext as unknown as Record<string, unknown> | undefined;
    const gl2Params = (gl2?.prototype as Record<string, unknown> | undefined)?.getParameter as ((param: number) => unknown) | undefined;
    if (gl2Params) {
      (gl2!.prototype as Record<string, unknown>).getParameter = function (this: unknown, param: number) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        if (param === 3415) return 24;
        return gl2Params.call(this, param);
      };
    }

    // ── Canvas noise ─────────────────────────────────────────────────
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      sx: number, sy: number, sw: number, sh: number
    ) {
      const imageData = origGetImageData.call(this, sx, sy, sw, sh);
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (Math.random() < 0.005) {
          imageData.data[i] = imageData.data[i] + (Math.random() > 0.5 ? 1 : -1);
        }
      }
      return imageData;
    };

    // ── AudioContext noise ───────────────────────────────────────────
    const origGetChannelData = (AudioBuffer?.prototype)?.getChannelData;
    if (origGetChannelData) {
      AudioBuffer.prototype.getChannelData = function (channel: number) {
        const data = origGetChannelData.call(this, channel);
        for (let i = 0; i < data.length; i += 10) {
          data[i] = data[i] + (Math.random() - 0.5) * 0.000001;
        }
        return data;
      };
    }
  });
}

async function patchFull(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // ── Complete chrome object (matches real Chrome 146) ────────────
    const chromeRuntime = {
      id: 'mfvjfbfpncimlnkhkohgljdkkjolmmmh',
      connect: () => ({
        name: '',
        sender: undefined,
        postMessage: () => {},
        onMessage: { addListener: () => {} },
        onDisconnect: { addListener: () => {} },
      }),
      sendMessage: (
        _extensionId: string,
        _message: unknown,
        _options: unknown,
        _callback?: () => void
      ) => {
        if (typeof _options === 'function') _options();
        if (typeof _callback === 'function') _callback();
      },
      getManifest: () => ({
        manifest_version: 3,
        name: '',
        version: '1.0',
        description: '',
        permissions: [],
      }),
      getURL: (path: string) => `chrome-extension://${path}`,
      onConnect: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
      lastError: null,
    };
    const chromeApp = {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: () => null,
      getIsInstalled: () => false,
    };
    const chromeWebstore = {
      onInstallStageChanged: { addListener: () => {} },
      onDownloadProgress: { addListener: () => {} },
      install: () => Promise.reject(new Error('Webstore install requires user gesture')),
      redirect: () => {},
    };
    const chromeObj: Record<string, unknown> = {
      loadTimes: () => ({
        requestTime: performance.now() / 1000,
        startLoadTime: performance.now() / 1000,
        commitLoadTime: performance.now() / 1000 + 0.5,
        finishDocumentLoadTime: performance.now() / 1000 + 1.0,
        finishLoadTime: performance.now() / 1000 + 2.0,
        firstPaintTime: performance.now() / 1000 + 0.8,
        firstPaintAfterLoadTime: performance.now() / 1000 + 2.0,
        wasFetchedViaSpdy: false,
        wasNpnNegotiated: false,
        npnNegotiatedProtocol: 'http/1.1',
        wasAlternateProtocolAvailable: false,
        connectionInfo: 'http/1.1',
      }),
      csi: () => ({
        onloadT: performance.now(),
        startE: performance.now() - 100,
        pageT: Date.now(),
        tran: 15,
      }),
      app: chromeApp,
      runtime: chromeRuntime,
      webstore: chromeWebstore,
    };
    Object.defineProperty(window, 'chrome', {
      get: () => chromeObj,
      configurable: true,
    });

    // ── navigator.webdriver: also delete from Navigator.prototype ─────
    try {
      const proto = Navigator.prototype as unknown as Record<string, PropertyDescriptor | undefined>;
      const wdDesc = Object.getOwnPropertyDescriptor(proto, 'webdriver');
      if (wdDesc) {
        Object.defineProperty(proto, 'webdriver', {
          get: () => undefined,
          set: () => {},
          configurable: true,
          enumerable: true,
        });
      }
    } catch { /* ignore */ }

    // ── navigator.userAgentData (Client Hints) ──────────────────────
    const uaData = {
      brands: [
        { brand: 'Google Chrome', version: '146' },
        { brand: 'Chromium', version: '146' },
        { brand: 'Not?A_Brand', version: '24' },
      ],
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: () => Promise.resolve({
        architecture: 'arm',
        bitness: '64',
        model: '',
        platform: 'macOS',
        platformVersion: '15.0',
        uaFullVersion: '146.0.0.0',
      }),
      toJSON: () => ({
        brands: [
          { brand: 'Google Chrome', version: '146' },
          { brand: 'Chromium', version: '146' },
          { brand: 'Not?A_Brand', version: '24' },
        ],
        mobile: false,
        platform: 'macOS',
      }),
    };
    Object.defineProperty(navigator, 'userAgentData', {
      get: () => uaData,
      configurable: true,
    });

    // ── Navigate properties ──────────────────────────────────────────
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      get: () => 4,
      configurable: true,
    });
    Object.defineProperty(navigator, 'deviceMemory', {
      get: () => 8,
      configurable: true,
    });
    Object.defineProperty(navigator, 'pdfViewerEnabled', {
      get: () => true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'cookieEnabled', {
      get: () => true,
      configurable: true,
    });
    try {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 50,
          downlink: 10,
          saveData: false,
          onchange: null,
        }),
        configurable: true,
      });
    } catch { /* ignore */ }

    // ── navigator.mediaDevices.enumerateDevices ──────────────────────
    const origEnumerate = navigator.mediaDevices?.enumerateDevices?.bind(navigator.mediaDevices);
    if (origEnumerate) {
      navigator.mediaDevices.enumerateDevices = async () => {
        const real = await origEnumerate();
        if (real.length === 0) {
          return [
            { deviceId: 'audio-1', kind: 'audioinput', label: 'Internal Microphone', groupId: 'group-1' },
            { deviceId: 'audio-2', kind: 'audiooutput', label: 'Internal Speakers', groupId: 'group-1' },
            { deviceId: 'video-1', kind: 'videoinput', label: 'FaceTime HD Camera', groupId: 'group-2' },
          ] as MediaDeviceInfo[];
        }
        return real;
      };
    }

    // ── Screen ───────────────────────────────────────────────────────
    const w = window;
    const viewW = w.innerWidth || 1920;
    const viewH = w.innerHeight || 1080;
    try {
      Object.defineProperty(screen, 'availWidth', { get: () => viewW, configurable: true });
      Object.defineProperty(screen, 'availHeight', { get: () => viewH - 40, configurable: true });
      Object.defineProperty(screen, 'colorDepth', { get: () => 30, configurable: true });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 30, configurable: true });
      Object.defineProperty(screen, 'isExtended', { get: () => false, configurable: true });
    } catch { /* ignore */ }

    // ── Outer/inner window dimensions ────────────────────────────────
    try {
      Object.defineProperty(w, 'outerWidth', { get: () => viewW + 16, configurable: true });
      Object.defineProperty(w, 'outerHeight', { get: () => viewH + 72, configurable: true });
      Object.defineProperty(w, 'screenX', { get: () => 0, configurable: true });
      Object.defineProperty(w, 'screenY', { get: () => 0, configurable: true });
      Object.defineProperty(w, 'screenLeft', { get: () => 0, configurable: true });
      Object.defineProperty(w, 'screenTop', { get: () => 0, configurable: true });
    } catch { /* ignore */ }

    // ── performance.memory (Chrome-specific) ─────────────────────────
    try {
      Object.defineProperty(performance, 'memory', {
        get: () => ({
          jsHeapSizeLimit: 2172649472,
          totalJSHeapSize: 12345678,
          usedJSHeapSize: 9876543,
        }),
        configurable: true,
      });
    } catch { /* ignore */ }

    // ── Function.prototype.toString — hide our overrides ─────────────
    const origToString = Function.prototype.toString;
    Function.prototype.toString = function (this: unknown) {
      const str = origToString.call(this);
      // If this looks like a patched function, return native code string
      if (str.includes('[native code]') || str.includes('get webdriver')) {
        return str;
      }
      // Otherwise return the real source but clean up any references
      return str;
    };
  });
}
