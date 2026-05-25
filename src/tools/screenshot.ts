import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const screenshotTool: ToolDefinition = {
  name: 'browser_screenshot',
  description: 'Take a screenshot of the current page or a specific element',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector of element to capture (omit for full page)' },
      fullPage: { type: 'boolean', default: false, description: 'Capture full page (not just viewport)' },
    },
  },
  handler: async (args, ctx) => {
    const { page } = await ctx.browser.acquireContext();
    try {
      

      if (args.selector) {
        const locator = page.locator(String(args.selector));
        if (await locator.count() === 0) {
          return { content: [{ type: 'text', text: `Element not found: ${args.selector}` }], isError: true };
        }
        const screenshot = await locator.screenshot();
        return {
          content: [
            { type: 'text', text: `Screenshot of ${args.selector}:` },
            { type: 'image', data: screenshot.toString('base64'), mimeType: 'image/png' },
          ],
        };
      }

      const screenshot = await page.screenshot({
        fullPage: args.fullPage === true,
        type: 'png',
      });
      return {
        content: [
          { type: 'text', text: 'Screenshot:' },
          { type: 'image', data: screenshot.toString('base64'), mimeType: 'image/png' },
        ],
      };
    } finally {
      await ctx.browser.releaseContext();
    }
  },
};
