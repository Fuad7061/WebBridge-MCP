import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const formTools: ToolDefinition[] = [
  {
    name: 'browser_fill_form',
    description: 'Fill multiple form fields at once by passing a key-value object. The tool automatically resolves each key as an element id, name attribute, placeholder text, or label text (in that order). Supports text inputs, textareas, and select dropdowns. Optionally submits the form after filling all fields. Example: {"fields":{"Email":"user@test.com","Password":"secret123","Country":"US"},"submit":true}',
    inputSchema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description: 'Object mapping field identifiers (label, name, id, or placeholder) to values',
          additionalProperties: { type: 'string' },
        },
        submit: { type: 'boolean', default: false, description: 'Submit the form after filling' },
        tabIndex: { type: 'number', description: 'Tab index to fill form in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to fill form in (overrides tabIndex)' },
      },
      required: ['fields'],
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        const fields = args.fields as Record<string, string>;
        const filled: string[] = [];

        for (const [key, value] of Object.entries(fields)) {
          if (typeof value !== 'string') continue;
          let locator = page.locator(`#${CSS.escape(key)}`);

          if (await locator.count() === 0) {
            locator = page.locator(`[name="${CSS.escape(key)}"]`);
          }
          if (await locator.count() === 0) {
            locator = page.locator(`[placeholder="${CSS.escape(key)}"]`);
          }
          if (await locator.count() === 0) {
            locator = page.locator(`label:has-text("${CSS.escape(key)}") + input, label:has-text("${CSS.escape(key)}") + textarea`);
          }
          if (await locator.count() === 0) {
            locator = page.locator(`label:has-text("${CSS.escape(key)}") ~ input, label:has-text("${CSS.escape(key)}") ~ textarea`);
          }
          if (await locator.count() === 0) {
            locator = page.locator(`label:has-text("${CSS.escape(key)}") + select`);
          }
          if (await locator.count() === 0) {
            locator = page.locator(`label:has-text("${CSS.escape(key)}") ~ select`);
          }

          if (await locator.count() > 0) {
            const tag = await locator.evaluate(el => el.tagName.toLowerCase());
            if (tag === 'select') {
              await locator.selectOption(value);
            } else {
              await locator.click();
              await page.keyboard.press('Meta+a');
              await page.keyboard.press('Backspace');
              await locator.fill(value);
            }
            filled.push(key);
          }
        }

        if (args.submit) {
          const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
          if (await submitBtn.count() > 0) {
            await submitBtn.click();
          } else {
            await page.keyboard.press('Enter');
          }
        }

        return { content: [{ type: 'text', text: `Filled ${filled.length}/${Object.keys(fields).length} fields: ${filled.join(', ')}` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'browser_select',
    description: 'Select an option in a <select> dropdown element. Choose the target by the option\'s value attribute or its visible label text. Use this instead of browser_type or browser_click for native dropdowns. Example: {"selector":"select#country","label":"United States"} or {"selector":"select#country","value":"us"}.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector or XPath of the select element' },
        value: { type: 'string', description: 'Option value to select' },
        label: { type: 'string', description: 'Option label text to select' },
        tabIndex: { type: 'number', description: 'Tab index to select in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to select in (overrides tabIndex)' },
      },
      required: ['selector'],
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
      try {
        
        const locator = page.locator(String(args.selector));
        if (await locator.count() === 0) {
          return { content: [{ type: 'text', text: `Select element not found: ${args.selector}` }], isError: true };
        }
        if (args.value) {
          await locator.selectOption(String(args.value));
          return { content: [{ type: 'text', text: `Selected option value: ${args.value}` }] };
        }
        if (args.label) {
          await locator.selectOption({ label: String(args.label) });
          return { content: [{ type: 'text', text: `Selected option label: ${args.label}` }] };
        }
        return { content: [{ type: 'text', text: 'Provide value or label' }], isError: true };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
