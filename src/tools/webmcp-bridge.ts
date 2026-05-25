import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

export const webmcpTools: ToolDefinition[] = [
  {
    name: 'webmcp_discover',
    description: 'Discover WebMCP tools registered on the current page via navigator.modelContext',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Navigate to URL first (optional)' },
      },
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        if (args.url && typeof args.url === 'string') {
          await page.goto(String(args.url), { waitUntil: 'load', timeout: 30000 });
        }
        const hasAPI = await page.evaluate(() => {
          return !!(navigator as unknown as Record<string, unknown>).modelContext;
        });
        if (!hasAPI) {
          return { content: [{ type: 'text', text: 'No WebMCP API found on this page. Requires Chrome 146+ with --enable-experimental-web-platform-features' }] };
        }
        const tools = await page.evaluate(() => {
          const mc = (navigator as unknown as Record<string, unknown>).modelContext as {
            listTools?: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
            getTools?: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
          };
          if (mc.listTools) return mc.listTools();
          if (mc.getTools) return mc.getTools();
          return [];
        });
        return { content: [{ type: 'text', text: JSON.stringify({ tools: tools ?? [] }, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
  {
    name: 'webmcp_call',
    description: 'Call a WebMCP tool on the current page',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'Name of the WebMCP tool to call' },
        args: { type: 'object', description: 'Arguments to pass to the tool' },
      },
      required: ['tool'],
    },
    handler: async (args, ctx) => {
      const { page } = await ctx.browser.acquireContext();
      try {
        
        const toolName = String(args.tool);
        const callArgs = (args.args as Record<string, unknown>) || {};
        const result = await page.evaluate(
          async ({ name, callArgs: cargs }) => {
            const mc = (navigator as unknown as Record<string, unknown>).modelContext as {
              executeTool?: (name: string, args: string) => Promise<unknown>;
              callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
            };
            const testing = (navigator as unknown as Record<string, unknown>).modelContextTesting as {
              executeTool?: (name: string, args: string) => Promise<unknown>;
            };
            if (testing?.executeTool) return testing.executeTool(name, JSON.stringify(cargs));
            if (mc?.executeTool) return mc.executeTool(name, JSON.stringify(cargs));
            if (mc?.callTool) return mc.callTool(name, cargs);
            throw new Error('No WebMCP execution method available');
          },
          { name: toolName, callArgs }
        );
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } finally {
        await ctx.browser.releaseContext();
      }
    },
  },
];
