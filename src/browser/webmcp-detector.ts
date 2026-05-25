import type { Page } from 'playwright';
import type { WebMCPTool } from '../types/index.js';

export async function discoverWebMCPTools(page: Page): Promise<WebMCPTool[]> {
  try {
    const hasWebMCP = await page.evaluate(() => {
      return !!(navigator as unknown as Record<string, unknown>).modelContext;
    });
    if (!hasWebMCP) return [];

    const hasTestingAPI = await page.evaluate(() => {
      return !!(navigator as unknown as Record<string, unknown>).modelContextTesting;
    });

    if (hasTestingAPI) {
      const tools = await page.evaluate(async () => {
        const testing = (navigator as unknown as Record<string, unknown>).modelContextTesting as {
          listTools?: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
          getTools?: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
        };
        if (testing.listTools) return testing.listTools();
        if (testing.getTools) return testing.getTools();
        return [];
      });
      return Array.isArray(tools) ? tools.map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
      })) : [];
    }

    const tools = await page.evaluate(() => {
      const mc = (navigator as unknown as Record<string, unknown>).modelContext as {
        listTools?: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
        getTools?: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
      };
      if (mc.listTools) return mc.listTools();
      if (mc.getTools) return mc.getTools();

      const registered = (mc as unknown as Record<string, unknown>).registeredTools;
      if (Array.isArray(registered)) return registered;
      return [];
    });
    return Array.isArray(tools) ? tools.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    })) : [];
  } catch {
    return [];
  }
}

export async function callWebMCPTool(
  page: Page,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const result = await page.evaluate(
    async ({ name, args: callArgs }) => {
      const mc = (navigator as unknown as Record<string, unknown>).modelContext as {
        executeTool?: (name: string, args: string) => Promise<unknown>;
        callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
        invoke?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
      };
      const testing = (navigator as unknown as Record<string, unknown>).modelContextTesting as {
        executeTool?: (name: string, args: string) => Promise<unknown>;
      };

      if (testing?.executeTool) {
        return testing.executeTool(name, JSON.stringify(callArgs));
      }
      if (mc?.executeTool) {
        return mc.executeTool(name, JSON.stringify(callArgs));
      }
      if (mc?.callTool) {
        return mc.callTool(name, callArgs);
      }
      if (mc?.invoke) {
        return mc.invoke(name, callArgs);
      }
      throw new Error('No WebMCP execution method available');
    },
    { name: toolName, args }
  );
  return result;
}
