import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const tabTools: ToolDefinition[] = [
  {
    name: 'browser_list_tabs',
    description: 'List all open browser tabs with their index, URL, and page title. Use the index from this list to switch to or close a specific tab with browser_switch_tab or browser_close_tab.',
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
    description: 'Open a new browser tab. If a URL is provided, the new tab navigates to that URL. Use this to work with multiple pages simultaneously without losing state on the current page.',
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
    description: 'Switch to a different browser tab by its index number. Use browser_list_tabs first to see all tabs with their indices. After switching, all subsequent tool calls (click, type, screenshot, etc.) operate on the newly active tab.',
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
    description: 'Close a browser tab by its index number. Use browser_list_tabs to get the index first. Cannot close the last remaining tab. After closing, the next available tab becomes active automatically.',
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
