import type { Page, BrowserContext } from 'playwright';
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
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  });
}

async function patchStandard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ];
        plugins.length = 3;
        return plugins as unknown as PluginArray;
      },
      configurable: true,
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
      configurable: true,
    });

    const originalQuery = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = async (desc: PermissionDescriptor) => {
      if (desc.name === 'notifications' || desc.name === 'geolocation') {
        return { state: 'prompt', onchange: null } as PermissionStatus;
      }
      return originalQuery(desc);
    };
  });
}

async function patchFull(page: Page): Promise<void> {
  await page.addInitScript(() => {
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
      app: {},
      runtime: {},
    };
    Object.defineProperty(window, 'chrome', {
      get: () => chromeObj,
      configurable: true,
    });

    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param: number) {
      if (param === 37445) return 'Intel Inc.';
      if (param === 37446) return 'Intel Iris OpenGL Engine';
      return getParameter.call(this, param);
    };

    const getImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (
      sx: number, sy: number, sw: number, sh: number
    ) {
      const imageData = getImageData.call(this, sx, sy, sw, sh);
      for (let i = 0; i < imageData.data.length; i += 4) {
        if (Math.random() < 0.005) {
          imageData.data[i] = imageData.data[i] + (Math.random() > 0.5 ? 1 : -1);
        }
      }
      return imageData;
    };

    const originalToString = Function.prototype.toString;
    Function.prototype.toString = function () {
      if (this === navigator.webdriver?.constructor) {
        return 'function get webdriver() { [native code] }';
      }
      return originalToString.call(this);
    };
  });
}
