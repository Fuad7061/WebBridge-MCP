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
    description: 'Perform a full structured reconnaissance scan of the current page. Returns: URL, title, meta tags, headings (h1-h6), all interactive elements with CSS selectors (buttons, links, inputs), form structure with fields, overlay/cookie banners, captcha detection, and a content summary. Uses deep traversal including Shadow DOM and ARIA roles to find elements even in complex SPAs like Google Flow. The output provides the exact selectors you need for browser_click, browser_type, browser_fill_form, and other tools.',
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

          function getSelector(el: Element): { css: string; xpath: string } {
            const id = el.id || '';
            const tag = el.tagName.toLowerCase();
            const ariaLabel = el.getAttribute('aria-label') || '';
            const dataTestId = el.getAttribute('data-testid') || '';
            const name = el.getAttribute('name') || '';
            const placeholder = el.getAttribute('placeholder') || '';
            const role = el.getAttribute('role') || '';
            const text = el.textContent?.trim()?.slice(0, 100) || '';
            const innerText = (el as HTMLElement).innerText?.trim()?.slice(0, 100) || '';

            const esc = (s: string) => s.replace(/"/g, '\\"');
            const escXpath = (s: string) => s.replace(/'/g, "&apos;");

            let css = '';
            let xpath = '';

            if (id) {
              css = `#${CSS.escape(id)}`;
              xpath = `//*[@id="${escXpath(id)}"]`;
            } else if (dataTestId) {
              css = `[data-testid="${CSS.escape(dataTestId)}"]`;
              xpath = `//*[@data-testid="${escXpath(dataTestId)}"]`;
            } else if (ariaLabel) {
              css = `[aria-label="${CSS.escape(ariaLabel)}"]`;
              xpath = `//*[@aria-label="${escXpath(ariaLabel)}"]`;
            } else if (name && (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'iframe')) {
              css = `[name="${CSS.escape(name)}"]`;
              xpath = `//${tag}[@name="${escXpath(name)}"]`;
            } else if (placeholder) {
              css = `[placeholder="${CSS.escape(placeholder)}"]`;
              xpath = `//${tag}[@placeholder="${escXpath(placeholder)}"]`;
            } else if (role && ariaLabel) {
              css = `[role="${role}"][aria-label="${CSS.escape(ariaLabel)}"]`;
              xpath = `//*[@role="${role}" and @aria-label="${escXpath(ariaLabel)}"]`;
            } else if (role && text) {
              css = `[role="${role}"]:has-text("${esc(text.slice(0,50))}")`;
              xpath = `//*[@role="${role}" and normalize-space()="${escXpath(text.slice(0,80))}"]`;
            } else if (role && name) {
              css = `[role="${role}"][name="${CSS.escape(name)}"]`;
              xpath = `//*[@role="${role}" and @name="${escXpath(name)}"]`;
            } else if (role) {
              css = `[role="${role}"]`;
              xpath = `//*[@role="${role}"]`;
            } else if (text && (tag === 'a' || tag === 'button' || tag === 'label' || tag === 'span')) {
              css = `${tag}:has-text("${esc(text.slice(0,50))}")`;
              xpath = `//${tag}[normalize-space()="${escXpath(text.slice(0,80))}"]`;
            } else if (innerText) {
              xpath = `//${tag}[normalize-space()="${escXpath(innerText.slice(0,80))}"]`;
              css = tag;
            } else {
              css = tag;
              xpath = `//${tag}`;
            }

            return { css, xpath };
          }

          function isVisible(el: Element): boolean {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            return true;
          }

          const seenElements = new WeakSet<Element>();

          function deepQueryAll(root: Element | Document | ShadowRoot): Element[] {
            const interactiveRoles = [
              'button', 'link', 'textbox', 'combobox', 'listbox', 'option',
              'checkbox', 'radio', 'switch', 'slider', 'tab', 'menuitem',
              'menuitemcheckbox', 'menuitemradio', 'spinbutton', 'searchbox',
              'progressbar', 'scrollbar', 'gridcell', 'treeitem', 'dialog',
              'alertdialog', 'tooltip', 'heading'
            ];
            const interactiveTags = 'a,button,input,select,textarea,label,summary,details,meter,progress';
            const results: Element[] = [];

            const interactive = root.querySelectorAll<HTMLElement>(interactiveTags);
            for (const el of interactive) {
              if (!seenElements.has(el) && (isVisible(el) || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
                seenElements.add(el);
                results.push(el);
              }
            }

            const roleElements = root.querySelectorAll<HTMLElement>('[role]');
            for (const el of roleElements) {
              const role = el.getAttribute('role') || '';
              if (!seenElements.has(el) && interactiveRoles.includes(role)) {
                seenElements.add(el);
                results.push(el);
              }
            }

            if ((root as Element).shadowRoot) {
              const shadowResults = deepQueryAll((root as Element).shadowRoot!);
              results.push(...shadowResults);
            }

            const children = root.querySelectorAll<Element>(':not(script):not(style):not(template)');
            for (const child of children) {
              if (child.shadowRoot && !seenElements.has(child)) {
                const shadowResults = deepQueryAll(child.shadowRoot);
                results.push(...shadowResults);
              }
            }

            return results;
          }

          const allInteractive = deepQueryAll(document);
          const seen = new Set<string>();
          const elements = allInteractive.slice(0, 500).map(el => {
            const tag = el.tagName.toLowerCase();
            let text = '';
            if (tag === 'input' || tag === 'textarea') {
              text = (el as HTMLInputElement).value || (el as HTMLInputElement).placeholder || '';
            } else {
              text = el.textContent?.trim()?.slice(0, 100) || '';
            }
            const ariaLabel = el.getAttribute('aria-label') || '';
            const role = el.getAttribute('role') || undefined;
            const sel = getSelector(el);
            const label = el.getAttribute('placeholder') || ariaLabel || '';
            const result = {
              tag,
              text: text || undefined,
              type: (el as HTMLInputElement).type || undefined,
              href: (el as HTMLAnchorElement).href || undefined,
              role,
              name: el.getAttribute('name') || undefined,
              'aria-label': ariaLabel || undefined,
              label: label || undefined,
              selector: sel.css,
              xpath: sel.xpath,
            };

            const dedupKey = sel.css || sel.xpath || (tag + text);
            if (seen.has(dedupKey)) return null;
            seen.add(dedupKey);
            return result;
          }).filter(Boolean);

          const forms = Array.from(document.querySelectorAll('form')).slice(0, 20).map(form => ({
            action: (form as HTMLFormElement).action || undefined,
            method: (form as HTMLFormElement).method || undefined,
            id: form.id || undefined,
            fields: Array.from(form.querySelectorAll('input,select,textarea,div[contenteditable]')).slice(0, 30).map(f => {
              const field = f as HTMLInputElement;
              const fieldId = field.id || '';
              const label = form.querySelector(`label[for="${CSS.escape(fieldId)}"]`)?.textContent?.trim()
                || field.placeholder || field.getAttribute('aria-label') || '';
              return {
                tag: field.tagName.toLowerCase(),
                type: field.type || undefined,
                name: field.name || undefined,
                id: field.id || undefined,
                label,
                placeholder: field.placeholder || undefined,
                required: field.required || undefined,
                selector: field.id ? `#${CSS.escape(field.id)}` : (field.name ? `[name="${CSS.escape(field.name)}"]` : `[placeholder="${CSS.escape(field.placeholder || '')}"]`),
              };
            }),
          }));

          const overlays = Array.from(document.querySelectorAll(
            '[class*="modal"],[class*="overlay"],[class*="popup"],[class*="dialog"],[class*="cookie"],[class*="consent"],[aria-modal="true"],[role="dialog"],[role="alertdialog"]'
          )).slice(0, 10).map(el => ({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 200),
            selector: el.id ? `#${CSS.escape(el.id)}` : el.getAttribute('aria-label') ? `[aria-label="${CSS.escape(el.getAttribute('aria-label')!)}"]` : el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : el.tagName.toLowerCase(),
          }));

          const captchas = Array.from(document.querySelectorAll('iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="arkose"], iframe[src*="funcaptcha"], iframe[title*="captcha"], iframe[title*="CAPTCHA"]')).map(el => {
            const src = (el as HTMLIFrameElement).src || '';
            let type = 'unknown';
            if (src.includes('recaptcha')) type = 'reCAPTCHA';
            else if (src.includes('hcaptcha')) type = 'hCaptcha';
            else if (src.includes('arkose') || src.includes('funcaptcha')) type = 'Arkose/FunCaptcha';
            const name = el.getAttribute('name') || '';
            let selector = `iframe[src="${CSS.escape(src)}"]`;
            if (name) selector = `iframe[name="${CSS.escape(name)}"]`;
            return { type, selector };
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
          } as ReconResult;
        });

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
