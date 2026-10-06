import type { ToolDefinition, ToolContext } from '../types/index.js';
import { getAllTools } from '../tools/index.js';
import { logger } from '../logger.js';
import { metrics } from '../metrics.js';

/** Keep logged arguments small and never log obvious secrets. */
function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (/pass(word)?|secret|token|cookie/i.test(k)) { out[k] = '***'; continue; }
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    out[k] = s && s.length > 200 ? s.slice(0, 200) + '…' : v;
  }
  return out;
}

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
    async callTool(name: string, args: Record<string, unknown>, source = 'api') {
      const tool = toolMap.get(name);
      if (!tool) {
        logger.warn('tool', `Unknown tool requested: ${name}`, { source });
        return {
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
      const started = Date.now();
      try {
        const result = await ctx.browser.runLocked(() => tool.handler(args, ctx));
        const ms = Date.now() - started;
        if (!result.isError) {
          const tabInfo = ctx.browser.getLastTabInfo();
          result.content.push({
            type: 'text',
            text: tabInfo.name
              ? `Tab: "${tabInfo.name}" (index: ${tabInfo.index})`
              : `Tab: index ${tabInfo.index}`,
          });
        }
        const errText = result.isError ? result.content.find(c => c.type === 'text')?.text : undefined;
        metrics.record(name, !result.isError, ms, source, errText);
        if (ctx.config.logToolCalls) {
          logger.write(result.isError ? 'warn' : 'info', 'tool', `${name} ${result.isError ? 'failed' : 'ok'} in ${ms}ms`,
            { tool: name, ms, source, args: summarizeArgs(args), ...(errText ? { error: errText.slice(0, 500) } : {}) });
        }
        return result;
      } catch (err) {
        const ms = Date.now() - started;
        const message = err instanceof Error ? err.message : String(err);
        metrics.record(name, false, ms, source, message);
        logger.error('tool', `${name} threw after ${ms}ms: ${message}`, { tool: name, ms, source, args: summarizeArgs(args) });
        return {
          content: [{ type: 'text' as const, text: `Error executing ${name}: ${message}` }],
          isError: true,
        };
      }
    },
  };
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>;
