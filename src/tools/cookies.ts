import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const cookieTools: ToolDefinition[] = [
  {
    name: 'browser_cookies',
    description: 'Manage browser cookies. Actions: "get" — read all cookies (name, value, domain, path, secure, httpOnly, sameSite); "set" — set a single cookie by name, value, url/domain, and path; "clear" — delete all cookies. Cookies set through this tool are automatically persisted in-memory and will survive browser crashes.',
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
          // Persist for crash recovery
          ctx.browser.storeCookies(await context.cookies());
          return { content: [{ type: 'text', text: `Cookie set: ${args.name}` }] };
        }

        if (action === 'clear') {
          await context.clearCookies();
          ctx.browser.clearStoredCookies();
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
    description: 'Export all current cookies as a JSON array. The output can be saved and reused later with browser_cookies_import. Also stores the cookies in the session store for later retrieval in the same session.',
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
    description: 'Import cookies from a JSON array (typically obtained from browser_cookies_export). Restores the session state previously saved. Cookies are also persisted in-memory for crash recovery.',
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
        ctx.browser.storeCookies(await context.cookies());
        return { content: [{ type: 'text', text: `Imported ${cookies.length} cookies` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_cookies_from_header',
    description: 'Set cookies from a raw Cookie header string. Handles __Secure- and __Host- prefixed cookies, Secure/HttpOnly flags, Path/Domain/SameSite attributes, and URL-encoded values.',
    inputSchema: {
      type: 'object',
      properties: {
        cookieString: {
          type: 'string',
          description: 'Cookie header string — simple format "session=abc; token=xyz" or full format with attributes "session=abc; Secure; HttpOnly; Path=/; SameSite=Lax"',
        },
        url: {
          type: 'string',
          description: 'URL to scope cookies to (required)',
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
        const overrideDomain = args.domain ? String(args.domain) : undefined;

        // Derive base domain from URL
        let baseDomain: string;
        try { baseDomain = new URL(url).hostname; } catch { baseDomain = url; }

        const KNOWN_ATTRS = new Set(['path', 'domain', 'expires', 'max-age', 'samesite', 'secure', 'httponly', 'priority']);

        interface PendingCookie {
          name: string;
          value: string;
          url?: string;
          domain?: string;
          path?: string;
          secure?: boolean;
          httpOnly?: boolean;
          sameSite?: 'Strict' | 'Lax' | 'None';
        }

        const pending: Array<PendingCookie & { useUrl?: string }> = [];
        const segments = raw.split(/;\s*/);

        for (const seg of segments) {
          const eqIdx = seg.indexOf('=');
          const key = eqIdx === -1 ? seg.trim().toLowerCase() : seg.slice(0, eqIdx).trim();
          const val = eqIdx === -1 ? '' : seg.slice(eqIdx + 1).trim();

          // Check if this segment is a cookie attribute flag
          if (KNOWN_ATTRS.has(key) && pending.length > 0) {
            const cur = pending[pending.length - 1];
            if (key === 'secure') cur.secure = true;
            else if (key === 'httponly') cur.httpOnly = true;
            else if (key === 'path') cur.path = val;
            else if (key === 'domain') cur.domain = val;
            else if (key === 'samesite') { const v = val.toLowerCase(); if (v === 'strict') cur.sameSite = 'Strict'; else if (v === 'lax') cur.sameSite = 'Lax'; else if (v === 'none') cur.sameSite = 'None'; }
            continue;
          }

          // Standalone flag (Secure, HttpOnly) with no =
          if (eqIdx === -1 && (key === 'secure' || key === 'httponly') && pending.length > 0) {
            const cur = pending[pending.length - 1];
            if (key === 'secure') cur.secure = true;
            else if (key === 'httponly') cur.httpOnly = true;
            continue;
          }

          // Extract domain for non-Host cookies
          let cookieDomain = overrideDomain || baseDomain;

          // URL-decode value
          let decodedValue = val;
          try { decodedValue = decodeURIComponent(val); } catch { decodedValue = val; }

          const isHostPrefix = key.startsWith('__Host-');
          const isSecurePrefix = key.startsWith('__Secure-');

          // __Host- cookies: must have secure:true, path:/, and NO explicit domain
          if (isHostPrefix) {
            pending.push({
              name: key, value: decodedValue,
              url, secure: true,
            });
          } else if (isSecurePrefix) {
            // __Secure- cookies: must have secure:true
            pending.push({
              name: key, value: decodedValue,
              domain: cookieDomain, path: '/', secure: true,
            });
          } else {
            pending.push({
              name: key, value: decodedValue,
              domain: cookieDomain, path: '/',
            });
          }
        }

        if (pending.length === 0) {
          return { content: [{ type: 'text', text: 'No valid cookie pairs found in string' }], isError: true };
        }

        const cookies = pending.map(c => {
          const out: Record<string, unknown> = { name: c.name, value: c.value };
          if (c.url) out.url = c.url;
          else {
            if (c.domain) out.domain = c.domain;
            out.path = c.path || '/';
          }
          if (c.secure) out.secure = true;
          if (c.httpOnly) out.httpOnly = true;
          if (c.sameSite) out.sameSite = c.sameSite;
          return out;
        });

        await context.addCookies(cookies as any);
        ctx.browser.storeCookies(await context.cookies());
        return { content: [{ type: 'text', text: `Set ${cookies.length} cookie(s) from header string` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
