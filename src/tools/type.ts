import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const typeTools: ToolDefinition[] = [
  {
    name: 'browser_type',
    description: 'Type text into an input field identified by CSS selector or XPath. Two modes: action "fill" (default) — clears existing content (unless clear:false) and sets the value instantly via Playwright fill(); action "type" — types each character individually with configurable delay (human-like keystrokes). Accepts "text" or "value" as the input parameter name. Set submit:true to press Enter after typing (useful for search fields and forms). Requires the selector to match an input, textarea, or contenteditable element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or XPath of the input element' },
        text: { type: 'string', description: 'Text to type (alias: value)' },
        value: { type: 'string', description: 'Text to type (alias: text)' },
        action: { type: 'string', enum: ['fill', 'type'], default: 'fill', description: '"fill" = clear + fill instantly (default), "type" = per-character keystrokes with delay' },
        submit: { type: 'boolean', default: false, description: 'Press Enter after typing' },
        clear: { type: 'boolean', default: true, description: 'Clear existing content first (only for action: fill)' },
        delay: { type: 'number', description: 'Delay between keystrokes in ms (for action: type)' },
        tabIndex: { type: 'number', description: 'Tab index to type in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to type in (overrides tabIndex)' },
      },
      required: ['selector'],
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
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
