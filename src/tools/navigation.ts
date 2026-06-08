import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

function deriveTabName(url: string): string | null {
  try {
    const u = new URL(url);
    let host = u.hostname;
    host = host.replace(/^www\./, '');
    return host.split('.')[0] || null;
  } catch {
    return null;
  }
}

export const navigationTools: ToolDefinition[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the current tab. Use this as the first step to load any web page. Supports waitUntil modes: load (default, waits for all resources), domcontentloaded (faster, HTML only), networkidle (waits for network to settle).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to (http/https only)' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], default: 'load' },
        timeout: { type: 'number', default: 30000 },
        tabIndex: { type: 'number', description: 'Tab index to navigate in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to navigate in (overrides tabIndex)' },
        name: { type: 'string', description: 'Register this tab with a friendly name (e.g. "amazon") — enables tabName targeting on subsequent calls. Same as set_tab_name but done inline with navigation.' },
      },
      required: ['url'],
    },
    handler: async (args, ctx) => {
      const url = String(args.url);
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { content: [{ type: 'text', text: 'Only http/https URLs are allowed' }], isError: true };
      }
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        await page.goto(url, {
          waitUntil: (args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle') || 'load',
          timeout: (args.timeout as number) || 30000,
        });

        const explicitName = args.name ? String(args.name) : deriveTabName(url);
        if (explicitName) {
          ctx.browser.setTabName(explicitName, page);
        }

        return { content: [{ type: 'text', text: `Navigated to ${page.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_back',
    description: 'Go back to the previous page in browser history. Equivalent to clicking the browser back button.',
    inputSchema: {
      type: 'object',
      properties: {
        tabIndex: { type: 'number', description: 'Tab index to go back in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to go back in (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        await page.goBack({ waitUntil: 'load' });
        return { content: [{ type: 'text', text: `Navigated back to ${page.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_forward',
    description: 'Go forward to the next page in browser history. Only works after browser_back has been called.',
    inputSchema: {
      type: 'object',
      properties: {
        tabIndex: { type: 'number', description: 'Tab index to go forward in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to go forward in (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        await page.goForward({ waitUntil: 'load' });
        return { content: [{ type: 'text', text: `Navigated forward to ${page.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_reload',
    description: 'Reload/refresh the current page. Useful when a page is stuck, needs fresh data, or after a form submission that returns the same page.',
    inputSchema: {
      type: 'object',
      properties: {
        tabIndex: { type: 'number', description: 'Tab index to reload (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to reload (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        await page.reload({ waitUntil: 'load' });
        return { content: [{ type: 'text', text: `Reloaded: ${page.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
