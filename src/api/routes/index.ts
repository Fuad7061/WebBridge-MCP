import type { FastifyInstance } from 'fastify';
import type { ToolContext } from '../../types/index.js';
import { createToolRegistry } from '../../mcp/registry.js';
import { getAllTools } from '../../tools/index.js';
import { randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';

const sseClients = new Map<string, FastifyReply>();

export function registerRoutes(app: FastifyInstance, ctx: ToolContext): void {
  const registry = createToolRegistry(ctx);

  app.get('/health', async () => {
    return { status: 'ok', version: '1.0.0', mode: 'http' };
  });

  app.get('/tools', async () => {
    const tools = registry.listTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return { tools };
  });

  app.post('/tools/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const args = (request.body as Record<string, unknown>) || {};
    const result = await registry.callTool(name, args);
    if (result.isError) {
      reply.status(400);
    }
    return { success: !result.isError, ...result };
  });

  for (const tool of getAllTools()) {
    const routePath = `/${tool.name.replace(/^browser_/, '').replace(/^surf_/, '')}`;

    app.post(routePath, async (request, reply) => {
      const args = (request.body as Record<string, unknown>) || {};
      const result = await registry.callTool(tool.name, args);
      if (result.isError) {
        reply.status(400);
      }
      return { success: !result.isError, data: result.content };
    });
  }

  // MCP Streamable HTTP endpoint (JSON-RPC over HTTP POST)
  // Used by n8n MCP Client (Streamable HTTP transport), Claude Code, Cursor, etc.
  app.post('/mcp', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const method = body.method as string;
    const id = body.id;
    const sessionId = (request.query as Record<string, string>)?.sessionId;

    try {
      let result;

      if (method === 'tools/list') {
        const tools = registry.listTools().map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        result = { tools };
      } else if (method === 'tools/call') {
        const params = body.params as Record<string, unknown>;
        const name = params?.name as string;
        const args = (params?.arguments as Record<string, unknown>) || {};
        const callResult = await registry.callTool(name, args);
        result = callResult;
      } else if (method === 'initialize') {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'webridge-mcp', version: '1.0.0' },
        };
      } else if (method === 'ping') {
        result = {};
      } else {
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
      }

      const response = { jsonrpc: '2.0', id, result };

      // If this request is associated with an SSE session, send via SSE
      if (sessionId && sseClients.has(sessionId)) {
        const sseReply = sseClients.get(sessionId)!;
        sseReply.raw.write(`data: ${JSON.stringify(response)}\n\n`);
        return { ok: true };
      }

      return response;
    } catch (err) {
      const error = { code: -32603, message: err instanceof Error ? err.message : String(err) };
      return { jsonrpc: '2.0', id, error };
    }
  });

  // MCP SSE endpoint — used by n8n MCP Client (SSE transport), Claude Code, etc.
  // 1. Client connects via GET /sse
  // 2. Server sends "endpoint" event with session-specific POST URL
  // 3. Client POSTs JSON-RPC to /mcp?sessionId=<id>
  // 4. Server sends responses back through this SSE stream
  app.get('/sse', async (request, reply) => {
    const sessionId = randomUUID();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Register this SSE client
    sseClients.set(sessionId, reply);

    // Send endpoint event — tells the client where to POST JSON-RPC messages
    const endpointUrl = `/mcp?sessionId=${sessionId}`;
    reply.raw.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        reply.raw.write(`:keepalive\n\n`);
      } catch {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(sessionId);
    });
  });
}
