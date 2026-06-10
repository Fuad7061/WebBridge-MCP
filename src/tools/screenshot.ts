import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const screenshotTool: ToolDefinition = {
  name: 'browser_screenshot',
    description: 'Capture a PNG screenshot of the current viewport, the full scrollable page (with fullPage: true), or a specific element (with a CSS selector or XPath). Returns base64-encoded image data. Useful for visual verification, debugging layouts, or capturing dynamic content.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or XPath of element to capture (omit for full page)' },
        fullPage: { type: 'boolean', default: false, description: 'Capture full page (not just viewport)' },
        tabIndex: { type: 'number', description: 'Tab index to screenshot (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to screenshot (overrides tabIndex)' },
      },
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
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
