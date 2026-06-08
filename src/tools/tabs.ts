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
    description: 'Open a new browser tab and optionally name it. If a URL is provided, the new tab navigates to that URL. If a name is provided, you can target this tab later with any tool\'s tabName parameter — no need to track indices.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in the new tab' },
        name: { type: 'string', description: 'Optional friendly name for this tab (e.g. "amazon", "admin") — use with tabName on any tool' },
      },
    },
    handler: async (args, ctx) => {
      const { context, page: _activePage } = await ctx.browser.acquireContext();
      try {
        const newPage = await context.newPage();
        if (args.url) {
          await newPage.goto(String(args.url), { waitUntil: 'load' });
        }
        if (args.name) {
          ctx.browser.setTabName(String(args.name), newPage);
          return { content: [{ type: 'text', text: `Opened new tab "${args.name}": ${newPage.url()}` }] };
        }
        return { content: [{ type: 'text', text: `Opened new tab: ${newPage.url()}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_switch_tab',
    description: 'Switch to a different browser tab by its index or name. Use browser_list_tabs to see all tabs with their indices. After switching, all subsequent tool calls (click, type, screenshot, etc.) operate on the newly active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Tab index to switch to' },
        name: { type: 'string', description: 'Switch to tab by its friendly name (set via set_tab_name or new_tab name)' },
      },
    },
    handler: async (args, ctx) => {
      try {
        if (args.name !== undefined) {
          const { page } = await ctx.browser.acquireContext(undefined, String(args.name));
          return { content: [{ type: 'text', text: `Switched to tab "${args.name}": ${page.url()}` }] };
        }
        if (args.index !== undefined) {
          const { page } = await ctx.browser.acquireContext(Number(args.index));
          return { content: [{ type: 'text', text: `Switched to tab ${args.index}: ${page.url()}` }] };
        }
        return { content: [{ type: 'text', text: 'Provide index or name' }], isError: true };
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
  {
    name: 'browser_set_tab_name',
    description: 'Assign a friendly name to a browser tab so you can target it with any tool\'s tabName parameter instead of tracking positional indices. If no index is specified, the current active tab is named. Names persist until the tab is closed. Example: set_tab_name name="amazon" → later use navigate tabName="amazon" or click tabName="amazon".',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Friendly name to assign (e.g. "amazon", "admin-panel", "search-results")' },
        index: { type: 'number', description: 'Tab index to name (optional, defaults to active tab)' },
      },
      required: ['name'],
    },
    handler: async (args, ctx) => {
      const tabIndex = args.index !== undefined ? Number(args.index) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex);
      try {
        ctx.browser.setTabName(String(args.name), page);
        return { content: [{ type: 'text', text: `Tab named "${args.name}" (URL: ${page.url()})` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
