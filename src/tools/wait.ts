import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const waitTool: ToolDefinition = {
  name: 'browser_wait',
    description: 'Wait for either (1) a CSS selector or XPath to become visible on the page (waits up to timeout ms), or (2) a fixed number of milliseconds to pass (when using the ms parameter with no selector). Use selector-based waiting after navigation or clicks to ensure elements are ready before interacting. Use ms-based waiting for simple delays like waiting for animations, redirects, or AJAX updates.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or XPath to wait for (omit for pure delay)' },
      timeout: { type: 'number', default: 30000, description: 'Max wait time in ms' },
      ms: { type: 'number', description: 'Milliseconds to sleep (if no selector)' },
      tabIndex: { type: 'number', description: 'Tab index to wait in (default: active tab)' },
      tabName: { type: 'string', description: 'Tab name to wait in (overrides tabIndex)' },
    },
  },
    handler: async (args, ctx) => {
    const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
    const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
    const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
    try {
      if (args.ms && !args.selector) {
        const ms = Number(args.ms);
        await page.waitForTimeout(ms);
        return { content: [{ type: 'text', text: `Waited ${ms}ms` }] };
      }

      const selector = String(args.selector);
      const timeout = Number(args.timeout) || 30000;
      await page.locator(selector).first().waitFor({ timeout, state: 'visible' });
      return { content: [{ type: 'text', text: `Selector "${selector}" is now visible` }] };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    } finally {
      await ctx.browser.releaseContext();
    }
  },
};
