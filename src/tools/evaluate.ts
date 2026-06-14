import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

async function tryEvaluate(target: any, code: string): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    return await target.evaluate(async (c: string) => {
      try {
        const val = eval(c);
        return { success: true, result: await val };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }, code);
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

function formatResult(result: any): string {
  if (result && typeof result === 'object' && result.success === false) {
    return JSON.stringify(result, null, 2);
  }
  return typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
}

export const evaluateTool: ToolDefinition = {
  name: 'browser_evaluate',
  description: 'Execute arbitrary JavaScript code in the browser page context and get the return value. Returns serialized results (objects become JSON, primitives become strings). Useful for: reading data from JavaScript variables, triggering functions not exposed via UI, accessing localStorage/sessionStorage, modifying page state, or extracting data that is not visible in the DOM. Optionally target a specific iframe by URL pattern (frameUrl) to execute code in a different origin context (e.g., reCAPTCHA iframes). If no frameUrl is given and the code throws on the main page, it automatically retries on each child iframe.',
  inputSchema: {
    type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
        frameUrl: { type: 'string', description: 'Target a specific iframe by matching its src URL (substring match). Code runs in the iframe\'s origin context with its cookies. E.g., "recaptcha" targets reCAPTCHA iframes.' },
        tabIndex: { type: 'number', description: 'Tab index to evaluate in (default: active tab)' },
        tabName: { type: 'string', description: 'Tab name to evaluate in (overrides tabIndex)' },
      },
      required: ['code'],
    },
    handler: async (args, ctx) => {
      const tabIndex = args.tabIndex !== undefined ? Number(args.tabIndex) : undefined;
      const tabName = args.tabName !== undefined ? String(args.tabName) : undefined;
      const { page } = await ctx.browser.acquireContext(tabIndex, tabName);
    try {
      
      const code = String(args.code);
      const frameUrl = args.frameUrl ? String(args.frameUrl) : undefined;

      let result;

      if (frameUrl) {
        const frames = page.frames();
        const targetFrame = frames.find(f => f.url().includes(frameUrl));
        if (!targetFrame) {
          return { content: [{ type: 'text', text: `Error: No frame found with URL containing "${frameUrl}". Available frames: ${frames.map(f => f.url()).join(', ')}` }], isError: true };
        }
        result = await tryEvaluate(targetFrame, code);
      } else {
        result = await tryEvaluate(page, code);
        const isErrorResult = (r: any) =>
          !r.success ||
          (r.result && typeof r.result === 'object' && (r.result.status === 'error' || r.result.error));
        if (isErrorResult(result)) {
          for (const frame of page.frames()) {
            if (frame === page.mainFrame()) continue;
            result = await tryEvaluate(frame, code);
            if (!isErrorResult(result)) break;
          }
        }
      }

      if (!result.success) {
        return { content: [{ type: 'text', text: `Error: ${result.error}` }], isError: true };
      }

      const output = formatResult(result.result);
      return { content: [{ type: 'text', text: output }] };
    } finally {
      await ctx.browser.releaseContext();
    }
  },
};
