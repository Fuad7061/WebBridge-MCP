import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const tabTools: ToolDefinition[] = [
  {
    name: 'browser_list_tabs',
    description: 'List all open tabs/pages in the current browser context',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const pages = context.pages();
        const tabs = await Promise.all(pages.map(async (p, i) => ({
          index: i,
          title: p.url() !== 'about:blank' ? await p.title() : '(new tab)',
          url: p.url(),
        })));
        return { content: [{ type: 'text', text: JSON.stringify(tabs, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_new_tab',
    description: 'Open a new tab (optionally navigate to a URL)',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in the new tab' },
      },
    },
    handler: async (args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const newPage = await context.newPage();
        if (args.url) {
          await newPage.goto(String(args.url), { waitUntil: 'load' });
        }
        return { content: [{ type: 'text', text: `Opened new tab: ${newPage.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch to a tab by index, URL, or title',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Tab index to switch to' },
      },
    },
    handler: async (args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const pages = context.pages();
        const idx = Number(args.index);
        if (idx < 0 || idx >= pages.length) {
          return { content: [{ type: 'text', text: `Tab index ${idx} out of range (0-${pages.length - 1})` }], isError: true };
        }
        await pages[idx].bringToFront();
        return { content: [{ type: 'text', text: `Switched to tab ${idx}: ${pages[idx].url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_close_tab',
    description: 'Close a tab by index (default: current)',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Tab index to close' },
      },
    },
    handler: async (args, ctx) => {
      const { context } = await ctx.browser.acquireContext();
      try {
        const pages = context.pages();
        if (pages.length <= 1) {
          return { content: [{ type: 'text', text: 'Cannot close the last tab' }], isError: true };
        }
        const idx = args.index !== undefined ? Number(args.index) : 0;
        if (idx < 0 || idx >= pages.length) {
          return { content: [{ type: 'text', text: `Tab index ${idx} out of range` }], isError: true };
        }
        await pages[idx].close();
        return { content: [{ type: 'text', text: `Closed tab ${idx}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
