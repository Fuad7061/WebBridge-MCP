import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const evaluateTool: ToolDefinition = {
  name: 'browser_evaluate',
  description: 'Execute arbitrary JavaScript code in the browser page context and get the return value. Returns serialized results (objects become JSON, primitives become strings). Useful for: reading data from JavaScript variables, triggering functions not exposed via UI, accessing localStorage/sessionStorage, modifying page state, or extracting data that is not visible in the DOM.',
  inputSchema: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
    },
    required: ['code'],
  },
  handler: async (args, ctx) => {
    const { page } = await ctx.browser.acquireContext();
    try {
      
      const code = String(args.code);
      const result = await page.evaluate((c: string) => {
        try {
          return { success: true, result: eval(c) };
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
      }, code);

      if (result.success === false) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
      }

      const output = typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : String(result.result);
      return { content: [{ type: 'text', text: output }] };
    } finally {
      await ctx.browser.releaseContext();
    }
  },
};
