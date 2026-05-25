import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const cookieTools: ToolDefinition[] = [
  {
    name: 'browser_cookies',
    description: 'Get or set cookies in the browser context',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['get', 'set', 'clear'], description: 'Cookie action' },
        name: { type: 'string', description: 'Cookie name (for set)' },
        value: { type: 'string', description: 'Cookie value (for set)' },
        url: { type: 'string', description: 'URL scope (for set)' },
        domain: { type: 'string', description: 'Cookie domain (for set)' },
        path: { type: 'string', default: '/', description: 'Cookie path (for set)' },
      },
      required: ['action'],
    },
    handler: async (args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const action = String(args.action);

        if (action === 'get') {
          const cookies = await context.cookies();
          return { content: [{ type: 'text', text: JSON.stringify(cookies, null, 2) }] };
        }

        if (action === 'set') {
          await context.addCookies([{
            name: String(args.name),
            value: String(args.value),
            url: args.url ? String(args.url) : undefined,
            domain: args.domain ? String(args.domain) : undefined,
            path: String(args.path || '/'),
          }]);
          return { content: [{ type: 'text', text: `Cookie set: ${args.name}` }] };
        }

        if (action === 'clear') {
          await context.clearCookies();
          return { content: [{ type: 'text', text: 'All cookies cleared' }] };
        }

        return { content: [{ type: 'text', text: `Unknown action: ${action}` }], isError: true };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_cookies_export',
    description: 'Export all cookies as a portable JSON blob',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const cookies = await context.cookies();
        ctx.session.set('exported_cookies', JSON.stringify(cookies));
        return { content: [{ type: 'text', text: JSON.stringify(cookies) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_cookies_import',
    description: 'Import cookies from a portable JSON blob',
    inputSchema: {
      type: 'object',
      properties: {
        cookies: {
          type: 'array',
          description: 'Array of cookie objects',
          items: { type: 'object' },
        },
      },
      required: ['cookies'],
    },
    handler: async (args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const cookies = args.cookies as Array<{ name: string; value: string; domain?: string; url?: string; path?: string }>;
        await context.addCookies(cookies);
        return { content: [{ type: 'text', text: `Imported ${cookies.length} cookies` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_cookies_from_header',
    description: 'Set cookies from a raw Cookie header string (e.g. "session=abc; token=xyz"). Parses name=value pairs and sets them for the given URL or domain.',
    inputSchema: {
      type: 'object',
      properties: {
        cookieString: {
          type: 'string',
          description: 'Cookie header string, e.g. "session=abc123; token=xyz789; theme=dark"',
        },
        url: {
          type: 'string',
          description: 'URL to scope cookies to (required — e.g. https://example.com)',
        },
        domain: {
          type: 'string',
          description: 'Optional domain override (e.g. .example.com)',
        },
      },
      required: ['cookieString', 'url'],
    },
    handler: async (args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const raw = String(args.cookieString);
        const url = String(args.url);
        const domain = args.domain ? String(args.domain) : undefined;

        const cookies: Array<{ name: string; value: string; domain?: string; path?: string }> = [];
        const pairs = raw.split(/;\s*/);

        for (const pair of pairs) {
          const sep = pair.indexOf('=');
          if (sep === -1) continue;
          const name = pair.slice(0, sep).trim();
          const value = pair.slice(sep + 1).trim();
          if (!name) continue;

          // Extract domain from URL for Playwright
          let cookieDomain = domain;
          if (!cookieDomain) {
            try { cookieDomain = new URL(url).hostname; } catch { cookieDomain = url; }
          }

          cookies.push({ name, value, domain: cookieDomain, path: '/' });
        }

        if (cookies.length === 0) {
          return { content: [{ type: 'text', text: 'No valid cookie pairs found in string' }], isError: true };
        }

        await context.addCookies(cookies);
        return { content: [{ type: 'text', text: `Set ${cookies.length} cookie(s) from header string` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
