import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const navigationTools: ToolDefinition[] = [
  {
    name: 'browser_navigate',
    description: 'Navigate to a URL in the current tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to navigate to (http/https only)' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle'], default: 'load' },
        timeout: { type: 'number', default: 30000 },
      },
      required: ['url'],
    },
    handler: async (args, ctx) => {
      const url = String(args.url);
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { content: [{ type: 'text', text: 'Only http/https URLs are allowed' }], isError: true };
      }
      const { page } = await ctx.browser.acquireContext();
      try {
        
        await page.goto(url, {
          waitUntil: (args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle') || 'load',
          timeout: (args.timeout as number) || 30000,
        });
        return { content: [{ type: 'text', text: `Navigated to ${page.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_back',
    description: 'Go back in browser history',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
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
    description: 'Go forward in browser history',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
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
    description: 'Reload the current page',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        await page.reload({ waitUntil: 'load' });
        return { content: [{ type: 'text', text: `Reloaded: ${page.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
