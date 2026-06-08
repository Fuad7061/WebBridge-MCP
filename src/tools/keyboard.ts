import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const keyboardTool: ToolDefinition = {
  name: 'browser_press_key',
  description: 'Press a single keyboard key. Common uses: Enter to submit forms or confirm dialogs; Tab to move focus between fields; Escape to close modals/popups; ArrowDown/ArrowUp to navigate dropdown menus or autocomplete suggestions; Space to toggle checkboxes; Backspace/Delete to remove characters. The optional delay parameter adds human-like pause between keydown and keyup events. Note: the element must already be focused — use browser_click first to focus a field, or Tab to navigate focus.',
  inputSchema: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        description: 'Key to press. Common values: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, End, PageUp, PageDown, Space, Control, Alt, Shift, Meta, F1-F12',
      },
      delay: {
        type: 'number',
        default: 0,
        description: 'Delay between keydown and keyup in ms (mimics human typing)',
      },
      tabIndex: { type: 'number', description: 'Tab index to press key in (default: active tab)' },
      tabName: { type: 'string', description: 'Tab name to press key in (overrides tabIndex)' },
    },
    required: ['key'],
  },
  handler: async (args, ctx) => {
    const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
    const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
    const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
    try {
      const key = String(args.key);
      const delay = Number(args.delay) || 0;

      await page.keyboard.press(key, { delay });
      return { content: [{ type: 'text', text: `Pressed key: ${key}` }] };
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
