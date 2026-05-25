import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const typeTools: ToolDefinition[] = [
  {
    name: 'browser_type',
    description: 'Type text into an input field using real keystrokes',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input element' },
        text: { type: 'string', description: 'Text to type' },
        submit: { type: 'boolean', default: false, description: 'Press Enter after typing' },
        clear: { type: 'boolean', default: true, description: 'Clear existing content first' },
        delay: { type: 'number', description: 'Delay between keystrokes (ms)' },
      },
      required: ['selector', 'text'],
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        const locator = page.locator(String(args.selector));
        const count = await locator.count();
        if (count === 0) {
          return { content: [{ type: 'text', text: `Element not found: ${args.selector}` }], isError: true };
        }
        await locator.scrollIntoViewIfNeeded();
        await locator.click();

        if (args.clear !== false) {
          await page.keyboard.press('Meta+a');
          await page.waitForTimeout(30);
          await page.keyboard.press('Backspace');
          await page.waitForTimeout(30);
        }

        const delay = Number(args.delay) || ctx.config.typingDelayMs;
        await locator.fill(String(args.text));
        await page.waitForTimeout(delay);

        if (args.submit) {
          await page.keyboard.press('Enter');
        }

        return { content: [{ type: 'text', text: `Typed into ${args.selector}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
