import type { ToolDefinition, ToolContext } from '../types/index.js';
import { getAllTools } from '../tools/index.js';

export function createToolRegistry(ctx: ToolContext) {
  const tools = getAllTools();
  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  return {
    listTools() {
      return tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    },
    async callTool(name: string, args: Record<string, unknown>) {
      const tool = toolMap.get(name);
      if (!tool) {
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
      try {
        return await tool.handler(args, ctx);
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}` }],
          isError: true,
        };
      }
    },
  };
}
