import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

const DISMISS_PATTERNS = [
  'reject all', 'reject', 'decline', 'deny',
  'accept all', 'accept',
  'godta alle', 'godta',
  'alle ablehnen', 'ablehnen',
  'tout refuser', 'refuser',
  'rechazar todo', 'rechazar',
  'rifiuta tutto', 'rifiuta',
  'bare nødvendige', 'bare必要的',
  'only necessary', 'nur notwendige',
  'manage preferences', 'cookie settings',
  'close', '×', '✕',
];

export const overlayTools: ToolDefinition[] = [
  {
    name: 'browser_dismiss_overlays',
    description: 'Automatically detect and dismiss cookie consent banners, modal dialogs, and popup overlays that may block interaction with the page. Searches for common dismiss buttons by text (Reject, Accept, Close, etc.) in multiple languages (EN, DE, FR, ES, IT, NO) and by ARIA labels. Attempts up to 3 dismissals. Use this right after browser_navigate to clear the page for interaction.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['auto', 'click', 'scroll'], default: 'auto' },
        tabIndex: { type: 'number', description: 'Tab index to dismiss overlays in (default: active tab)' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext(args.tabIndex !== undefined ? Number(args.tabIndex) : undefined);
      try {
        
        const method = String(args.method || 'auto');
        let dismissed = 0;

        for (const pattern of DISMISS_PATTERNS) {
          const btn = page.locator(`button:has-text("${pattern.replace(/"/g, '\\"')}"), [role="button"]:has-text("${pattern.replace(/"/g, '\\"')}"), input[type="button"]:has-text("${pattern.replace(/"/g, '\\"')}")`).first();
          if (await btn.count() > 0 && await btn.isVisible()) {
            await btn.click({ timeout: 1000 }).catch(() => {});
            dismissed++;
            if (dismissed >= 3) break;
          }
        }

        if (dismissed === 0) {
          const closeButtons = page.locator('[aria-label="Close"], [aria-label="close"], .close, .modal-close, .cookie-close');
          const count = await closeButtons.count();
          for (let i = 0; i < Math.min(count, 3); i++) {
            try {
              await closeButtons.nth(i).click({ timeout: 1000 });
              dismissed++;
            } catch { /* ignore */ }
          }
        }

        return { content: [{ type: 'text', text: `Dismissed ${dismissed} overlay element(s)` }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
