import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const clickTools: ToolDefinition[] = [
  {
    name: 'browser_click',
    description: 'Click an element using one of three methods: (1) CSS selector — precise, use the exact selector from recon output; (2) text content — fuzzy-match any element containing the text (best for buttons/links with visible labels); (3) x/y coordinates — pixel-precise click anywhere on the page. Add human-like behavior with hover + small random delay.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to click' },
        text: { type: 'string', description: 'Click element containing this text' },
        x: { type: 'number', description: 'X coordinate for click' },
        y: { type: 'number', description: 'Y coordinate for click' },
        waitAfter: { type: 'number', default: 500 },
        tabIndex: { type: 'number', description: 'Tab index to click in (default: active tab)' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext(args.tabIndex !== undefined ? Number(args.tabIndex) : undefined);
      try {
        

        if (args.x !== undefined && args.y !== undefined) {
          await page.mouse.click(Number(args.x), Number(args.y));
          return { content: [{ type: 'text', text: `Clicked at coordinates (${args.x}, ${args.y})` }] };
        }

        if (args.selector) {
          const el = await page.$(String(args.selector));
          if (!el) return { content: [{ type: 'text', text: `Element not found: ${args.selector}` }], isError: true };
          await el.scrollIntoViewIfNeeded();
          await el.hover();
          await page.waitForTimeout(50 + Math.random() * 50);
          await el.click();
          return { content: [{ type: 'text', text: `Clicked selector: ${args.selector}` }] };
        }

        if (args.text) {
          const text = String(args.text);
          const el = await page.locator(`:has-text("${text.replace(/"/g, '\\"')}")`).first();
          if (await el.count() === 0) {
            return { content: [{ type: 'text', text: `Element with text "${text}" not found` }], isError: true };
          }
          await el.scrollIntoViewIfNeeded();
          await el.hover();
          await page.waitForTimeout(50 + Math.random() * 50);
          await el.click();
          return { content: [{ type: 'text', text: `Clicked element with text: ${text}` }] };
        }

        return { content: [{ type: 'text', text: 'Provide selector, text, or x/y coordinates' }], isError: true };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_scroll_to_element',
    description: 'Scroll the page until the specified element is visible in the viewport. Use this before browser_click or browser_screenshot if the element is off-screen. Accepts a CSS selector or text content to locate the element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of element to scroll to' },
        text: { type: 'string', description: 'Text content of element to scroll to' },
        tabIndex: { type: 'number', description: 'Tab index to scroll in (default: active tab)' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext(args.tabIndex !== undefined ? Number(args.tabIndex) : undefined);
      try {
        
        if (args.selector) {
          await page.locator(String(args.selector)).first().scrollIntoViewIfNeeded();
          return { content: [{ type: 'text', text: `Scrolled to: ${args.selector}` }] };
        }
        if (args.text) {
          await page.locator(`:has-text("${String(args.text).replace(/"/g, '\\"')}")`).first().scrollIntoViewIfNeeded();
          return { content: [{ type: 'text', text: `Scrolled to element with text: ${args.text}` }] };
        }
        return { content: [{ type: 'text', text: 'Provide selector or text' }], isError: true };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
