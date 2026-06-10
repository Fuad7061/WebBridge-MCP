import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const monitorTool: ToolDefinition = {
  name: 'surf_monitor',
    description: 'Monitor a specific element on the page by CSS selector or XPath and detect when its text content changes. Polls every `interval` ms (default 500) until the text changes or `timeout` ms (default 60000) is reached. Returns the previous and current text, and elapsed time. Use this to wait for dynamic content updates, live search results, loading spinners to complete, or chat messages to appear.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or XPath to monitor' },
      timeout: { type: 'number', default: 60000, description: 'Max monitoring time in ms' },
      interval: { type: 'number', default: 500, description: 'Poll interval in ms' },
      tabIndex: { type: 'number', description: 'Tab index to monitor (default: active tab)' },
      tabName: { type: 'string', description: 'Tab name to monitor (overrides tabIndex)' },
    },
    required: ['selector'],
  },
  handler: async (args, ctx) => {
    const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
    const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
    const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
    try {
      
      const selector = String(args.selector);
      const timeout = Number(args.timeout) || 60000;
      const interval = Number(args.interval) || 500;

      const result = await page.evaluate(
        async ({ sel, time, inter }) => {
          const isXPath = (s: string) => s.startsWith('//') || s.startsWith('../') || s.startsWith('./') || s.startsWith('(');
          const q = (s: string) => {
            if (isXPath(s)) return document.evaluate(s, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null;
            return document.querySelector(s);
            };
          const start = Date.now();
          let lastText = q(sel)?.textContent?.trim() || '';

          while (Date.now() - start < time) {
            await new Promise(r => setTimeout(r, inter));
            const currentText = q(sel)?.textContent?.trim() || '';
            if (currentText !== lastText) {
              return {
                changed: true,
                previous: lastText.slice(0, 1000),
                current: currentText.slice(0, 1000),
                elapsed: Date.now() - start,
              };
            }
          }
          return { changed: false, previous: lastText.slice(0, 1000), elapsed: time };
        },
        { sel: selector, time: timeout, inter: interval }
      );

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } finally {
      await ctx.browser.releaseContext();
    }
  },
};
