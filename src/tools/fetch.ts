import type { ToolDefinition } from '../types/index.js';

export const fetchTool: ToolDefinition = {
  name: 'browser_fetch',
  description: 'Execute an HTTP request from within the browser page context. Uses the browser\'s fetch() API, so cookies, CORS, origin, and same-origin credentials are handled automatically. Perfect for API calls to the same origin as the current page, or for sites that require the browser\'s cookie jar and headers. Supports text and base64-encoded binary bodies (e.g., protobuf). Response is returned as text, parsed JSON, or base64-encoded raw bytes.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch (required)' },
      method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], default: 'GET', description: 'HTTP method' },
      headers: { type: 'object', default: {}, description: 'HTTP headers as key-value pairs (e.g. {"content-type": "application/json"})' },
      body: { type: 'string', description: 'Text body to send (e.g. JSON string). Use bodyBase64 for binary data.' },
      bodyBase64: { type: 'string', description: 'Base64-encoded binary body (e.g. protobuf bytes). Used instead of body for binary payloads.' },
      responseType: { type: 'string', enum: ['text', 'json', 'raw'], default: 'text', description: 'How to return the response: "text" = raw text, "json" = parse & pretty-print JSON, "raw" = base64-encoded bytes' },
      tabName: { type: 'string', description: 'Tab name to execute the fetch in' },
      tabIndex: { type: 'number', description: 'Tab index to execute the fetch in' },
    },
    required: ['url'],
  },
  handler: async (args, ctx) => {
    const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
    const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
    const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
    try {
      const url = String(args.url);
      const method = String(args.method || 'GET');
      const headers = (args.headers as Record<string, string>) || {};
      const body = args.body ? String(args.body) : undefined;
      const bodyBase64 = args.bodyBase64 ? String(args.bodyBase64) : undefined;
      const responseType = String(args.responseType || 'text');

      const result = await page.evaluate(
        async ({ url, method, headers, body, bodyBase64, responseType }) => {
          const opts: RequestInit = { method, headers };
          if (body) {
            opts.body = body;
          } else if (bodyBase64) {
            const binary = Uint8Array.from(atob(bodyBase64), c => c.charCodeAt(0));
            opts.body = binary;
          }
          try {
            const res = await fetch(url, opts);
            const respHeaders: Record<string, string> = {};
            res.headers.forEach((v, k) => { respHeaders[k] = v; });

            let data: string;
            if (responseType === 'json') {
              data = JSON.stringify(await res.json(), null, 2);
            } else if (responseType === 'raw') {
              const buf = await res.arrayBuffer();
              data = btoa(String.fromCharCode(...new Uint8Array(buf)));
            } else {
              data = await res.text();
            }

            return {
              ok: res.ok,
              status: res.status,
              statusText: res.statusText,
              headers: respHeaders,
              data,
            };
          } catch (err: any) {
            return {
              ok: false,
              status: 0,
              statusText: String(err?.message || err || 'Unknown error'),
              headers: {},
              data: '',
            };
          }
        },
        { url, method, headers, body, bodyBase64, responseType }
      );

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } finally {
      await ctx.browser.releaseContext();
    }
  },
};
