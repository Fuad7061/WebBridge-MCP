import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const typeTools: ToolDefinition[] = [
  {
    name: 'browser_type',
    description: 'Type text into an input field',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input element' },
        text: { type: 'string', description: 'Text to type (alias: value)' },
        value: { type: 'string', description: 'Text to type (alias: text)' },
        action: { type: 'string', enum: ['fill', 'type'], default: 'fill', description: '"fill" = clear + fill instantly (default), "type" = per-character keystrokes with delay' },
        submit: { type: 'boolean', default: false, description: 'Press Enter after typing' },
        clear: { type: 'boolean', default: true, description: 'Clear existing content first (only for action: fill)' },
        delay: { type: 'number', description: 'Delay between keystrokes in ms (for action: type)' },
      },
      required: ['selector'],
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        const inputText = String(args.text ?? args.value ?? '');
        if (!inputText) {
          return { content: [{ type: 'text', text: 'No text or value provided' }], isError: true };
        }

        const locator = page.locator(String(args.selector));
        const count = await locator.count();
        if (count === 0) {
          return { content: [{ type: 'text', text: `Element not found: ${args.selector}` }], isError: true };
        }
        await locator.scrollIntoViewIfNeeded();
        await locator.click();

        const action = String(args.action || 'fill');
        const delay = Number(args.delay) || ctx.config.typingDelayMs;

        if (action === 'fill') {
          if (args.clear !== false) {
            await page.keyboard.press('Meta+a');
            await page.waitForTimeout(30);
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(30);
          }
          await locator.fill(inputText);
          await page.waitForTimeout(delay);
        } else {
          await page.keyboard.type(inputText, { delay });
        }

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
