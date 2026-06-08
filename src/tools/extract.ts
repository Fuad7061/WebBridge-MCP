import type { ToolDefinition, ToolContext, ToolResult, ReconResult } from '../types/index.js';

export const extractTools: ToolDefinition[] = [
  {
    name: 'browser_get_text',
    description: 'Extract visible text content from the page. If a CSS selector is provided, only the text within that element is returned. If no selector is given, the full page text is returned. Use this for scraping article content, search results, prices, or any visible text data.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to scope text extraction' },
        tabIndex: { type: 'number', description: 'Tab index to extract from (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to extract from (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
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
    description: 'Get the raw HTML source of the page or a specific element (with CSS selector). Returns the outerHTML including tags, attributes, and structure. Use this when you need to inspect the DOM structure, extract hidden data, or scrape content that includes formatting that innerText loses.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to scope HTML extraction' },
        tabIndex: { type: 'number', description: 'Tab index to extract from (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to extract from (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
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
    description: 'Get the full URL of the currently active page. Use this to verify the current location after navigation, form submission, or redirects.',
    inputSchema: {
      type: 'object',
      properties: {
        tabIndex: { type: 'number', description: 'Tab index to get URL from (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to get URL from (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        return { content: [{ type: 'text', text: page.url() }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_get_title',
    description: 'Get the <title> of the current page. Useful for verifying the correct page loaded after navigation, or for identifying pages in multi-tab workflows.',
    inputSchema: {
      type: 'object',
      properties: {
        tabIndex: { type: 'number', description: 'Tab index to get title from (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to get title from (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        return { content: [{ type: 'text', text: await page.title() }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_find_elements',
    description: 'Find and return a list of all elements matching a CSS selector. Returns each element\'s tag name, id, class name, visible text, href (for links), and value (for inputs). Limited to 50 elements. Use this when you need to discover what elements exist on a page without loading full page content.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to search for' },
        tabIndex: { type: 'number', description: 'Tab index to search in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to search in (overrides tabIndex)' },
      },
      required: ['selector'],
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
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
    description: 'Perform a full structured reconnaissance scan of the current page. Returns: URL, title, meta tags, headings (h1-h6), all interactive elements with CSS selectors (buttons, links, inputs), form structure with fields, overlay/cookie banners, captcha detection, and a content summary. Use this as the first step after navigation to understand the page structure before interacting with elements. The output provides the exact selectors you need for browser_click, browser_type, browser_fill_form, and other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to recon (optional, uses current page if omitted)' },
        tabIndex: { type: 'number', description: 'Tab index to recon (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to recon (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
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
