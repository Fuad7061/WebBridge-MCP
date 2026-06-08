import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const scrollTools: ToolDefinition[] = [
  {
    name: 'browser_scroll',
    description: 'Scroll the page by a number of pixels (positive = down, negative = up). Returns the current scroll position, total scroll height, viewport height, and whether the bottom of the page is reached. Use negative values like -9999 to scroll to top quickly.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', default: 800, description: 'Pixels to scroll (negative = up)' },
        tabIndex: { type: 'number', description: 'Tab index to scroll in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to scroll in (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        const amount = Number(args.amount) || 800;
        await page.evaluate((px) => window.scrollBy({ top: px, behavior: 'smooth' }), amount);
        await page.waitForTimeout(200);
        const scrollInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
        }));
        const atBottom = scrollInfo.scrollY + scrollInfo.viewportHeight >= scrollInfo.scrollHeight - 50;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ ...scrollInfo, atBottom }),
          }],
        };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
