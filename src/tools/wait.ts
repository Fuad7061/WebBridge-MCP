import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';
import { findElement } from './shared.js';

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

      const found = await findElement(page, selector);
      if (found) {
        await found.first().waitFor({ timeout, state: 'visible' });
      } else {
        await page.waitForFunction((sel: string) => {
          const isXPath = sel.startsWith('//') || sel.startsWith('../') || sel.startsWith('./') || sel.startsWith('(');
          const q = (s: string) => {
            if (isXPath) return document.evaluate(s, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return document.querySelector(s);
          };
          if (q(sel)) return true;
          for (const iframe of document.querySelectorAll('iframe')) {
            try {
              const doc = iframe.contentDocument || iframe.contentWindow?.document;
              if (doc) {
                if (isXPath) {
                  if (doc.evaluate(sel, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue) return true;
                } else {
                  if (doc.querySelector(sel)) return true;
                }
              }
            } catch {}
          }
          return false;
        }, selector, { timeout });
      }
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
