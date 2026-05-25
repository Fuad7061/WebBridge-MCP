import type { ToolDefinition, ToolContext, ToolResult, ReconResult } from '../types/index.js';

export const extractTools: ToolDefinition[] = [
  {
    name: 'browser_get_text',
    description: 'Get visible text from the page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to scope text extraction' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        let text: string;
        if (args.selector) {
          text = await page.locator(String(args.selector)).innerText();
        } else {
          text = await page.evaluate(() => document.body?.innerText || '');
        }
        return { content: [{ type: 'text', text: text.slice(0, 500000) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_get_html',
    description: 'Get the HTML content of the page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to scope HTML extraction' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        let html: string;
        if (args.selector) {
          html = await page.locator(String(args.selector)).evaluate(el => el.outerHTML);
        } else {
          html = await page.evaluate(() => document.documentElement?.outerHTML || '');
        }
        return { content: [{ type: 'text', text: html.slice(0, 1000000) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_get_url',
    description: 'Get the current URL of the page',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        return { content: [{ type: 'text', text: page.url() }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_get_title',
    description: 'Get the page title',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        return { content: [{ type: 'text', text: await page.title() }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_find_elements',
    description: 'Find all elements matching a CSS selector',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to search for' },
      },
      required: ['selector'],
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        const elements = await page.evaluate((sel: string) => {
          const els = document.querySelectorAll(sel);
          return Array.from(els).slice(0, 50).map(el => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: (el as HTMLElement).className || undefined,
            text: (el.textContent || '').trim().slice(0, 100) || undefined,
            href: (el as HTMLAnchorElement).href || undefined,
            value: (el as HTMLInputElement).value || undefined,
            selector: sel,
          }));
        }, String(args.selector));
        return { content: [{ type: 'text', text: JSON.stringify(elements, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'recon',
    description: 'Get a structured reconnaissance map of the page',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to recon (optional, uses current page if omitted)' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        if (args.url && typeof args.url === 'string') {
          await page.goto(args.url, { waitUntil: 'load', timeout: 30000 });
        }

        const result: ReconResult = await page.evaluate(() => {
          const meta: Record<string, string> = {};
          document.querySelectorAll('meta').forEach(m => {
            const name = m.getAttribute('name') || m.getAttribute('property') || '';
            const content = m.getAttribute('content') || '';
            if (name && content) meta[name] = content;
          });

          const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({
            level: parseInt(h.tagName[1], 10),
            text: h.textContent?.trim() || '',
          })).filter(h => h.text);

          const interactiveTags = 'a,button,input,select,textarea,[role="button"],[role="link"],[tabindex]:not([tabindex="-1"])';
          const elements = Array.from(document.querySelectorAll(interactiveTags)).slice(0, 200).map(el => {
            const tag = el.tagName.toLowerCase();
            const text = el.textContent?.trim() || null;
            const id = el.id || '';
            const ariaLabel = el.getAttribute('aria-label') || '';
            const dataTestId = el.getAttribute('data-testid') || '';
            const name = el.getAttribute('name') || '';
            let selector = '';
            if (id) selector = `#${CSS.escape(id)}`;
            else if (ariaLabel) selector = `[aria-label="${CSS.escape(ariaLabel)}"]`;
            else if (dataTestId) selector = `[data-testid="${CSS.escape(dataTestId)}"]`;
            else if (name && (tag === 'input' || tag === 'select' || tag === 'textarea')) selector = `[name="${CSS.escape(name)}"]`;
            else selector = tag + (text ? `:has-text("${text.slice(0, 50).replace(/"/g, '\\"')}")` : '');
            return {
              tag, text,
              type: (el as HTMLInputElement).type || undefined,
              href: (el as HTMLAnchorElement).href || undefined,
              role: el.getAttribute('role') || undefined,
              selector,
            };
          });

          const forms = Array.from(document.querySelectorAll('form')).slice(0, 20).map(form => ({
            action: (form as HTMLFormElement).action || undefined,
            method: (form as HTMLFormElement).method || undefined,
            id: form.id || undefined,
            fields: Array.from(form.querySelectorAll('input,select,textarea')).slice(0, 30).map(f => {
              const field = f as HTMLInputElement;
              const label = form.querySelector(`label[for="${field.id}"]`)?.textContent?.trim()
                || form.querySelector(`label:has(+ ${field.tagName}[name="${field.name}"])`)?.textContent?.trim()
                || field.placeholder || '';
              return {
                tag: field.tagName.toLowerCase(),
                type: field.type || undefined,
                name: field.name || undefined,
                id: field.id || undefined,
                label,
                placeholder: field.placeholder || undefined,
                required: field.required || undefined,
                selector: field.id ? `#${CSS.escape(field.id)}` : `[name="${CSS.escape(field.name)}"]`,
              };
            }),
          }));

          const overlays = Array.from(document.querySelectorAll(
            '[class*="modal"],[class*="overlay"],[class*="popup"],[class*="dialog"],[class*="cookie"],[class*="consent"],[aria-modal="true"]'
          )).slice(0, 10).map(el => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 200),
            selector: el.id ? `#${CSS.escape(el.id)}` : el.getAttribute('aria-label') ? `[aria-label="${CSS.escape(el.getAttribute('aria-label')!)}"]` : el.tagName.toLowerCase(),
          }));

          const captchas = Array.from(document.querySelectorAll('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="arkose"], iframe[src*="funcaptcha"], iframe[title*="captcha"], iframe[title*="CAPTCHA"]')).map(el => {
            const src = (el as HTMLIFrameElement).src || '';
            let type = 'unknown';
            if (src.includes('recaptcha')) type = 'reCAPTCHA';
            else if (src.includes('hcaptcha')) type = 'hCaptcha';
            else if (src.includes('arkose') || src.includes('funcaptcha')) type = 'Arkose/FunCaptcha';
            return { type, selector: `iframe[src="${CSS.escape(src)}"]` };
          });

          const contentSummary = (document.body?.innerText || '').trim().slice(0, 2000);

          return {
            url: location.href,
            title: document.title,
            meta,
            headings,
            elements,
            totalElements: elements.length,
            forms,
            overlays,
            captchas,
            contentSummary,
          };
        });

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
