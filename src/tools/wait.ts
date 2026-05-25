import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const waitTool: ToolDefinition = {
  name: 'browser_wait',
  description: 'Wait for a CSS selector or a timeout (ms)',
  inputSchema: {
    type: 'object',
    properties: {
      selector: { type: 'string', description: 'CSS selector to wait for (omit for pure delay)' },
      timeout: { type: 'number', default: 30000, description: 'Max wait time in ms' },
      ms: { type: 'number', description: 'Milliseconds to sleep (if no selector)' },
    },
  },
    handler: async (args, ctx) => {
    const { page } = await ctx.browser.acquireContext();
    try {
      if (args.ms && !args.selector) {
        const ms = Number(args.ms);
        await page.waitForTimeout(ms);
        return { content: [{ type: 'text', text: `Waited ${ms}ms` }] };
      }

      const selector = String(args.selector);
      const timeout = Number(args.timeout) || 30000;
      await page.waitForSelector(selector, { timeout, state: 'visible' });
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
