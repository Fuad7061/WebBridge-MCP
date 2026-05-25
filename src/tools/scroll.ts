import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const scrollTools: ToolDefinition[] = [
  {
    name: 'browser_scroll',
    description: 'Scroll the page up or down by a given amount, or to top/bottom',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', default: 800, description: 'Pixels to scroll (negative = up)' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
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
