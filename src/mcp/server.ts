import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '../types/index.js';
import { createToolRegistry } from './registry.js';

export async function startMCPServer(ctx: ToolContext): Promise<void> {
  const registry = createToolRegistry(ctx);

  const server = new Server(
    { name: 'webridge-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = registry.listTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await registry.callTool(name, (args as Record<string, unknown>) || {});
    return {
      content: result.content.map(c => ({
        type: c.type,
        text: c.text,
        data: c.data,
        mimeType: c.mimeType,
      })),
      isError: result.isError,
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
