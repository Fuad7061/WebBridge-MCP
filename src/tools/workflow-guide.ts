import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDefinition, ToolContext, ToolResult } from '../types/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillPath = join(__dirname, '../../SKILL_workflow.md');

let cachedContent: string | null = null;

function getSkillContent(): string {
  if (!cachedContent) {
    try {
      cachedContent = readFileSync(skillPath, 'utf-8');
    } catch {
      cachedContent = '# WebBridge Workflow Guide\n\nWorkflow guide file not found. See SKILL_workflow.md at the project root.';
    }
  }
  return cachedContent;
}

export const workflowGuideTool: ToolDefinition = {
  name: 'browser_workflow_guide',
  description: 'Get complete workflow generation guide for browser automation. Returns patterns for auth+scrape, search+extract, login+fill, multi-tab, crawl, recon-to-curl mapping, selector formats, error handling, and n8n workflow layouts. Use this to generate step-by-step cURL or n8n MCP workflows for any browser automation task.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_args, ctx) => {
    return { content: [{ type: 'text', text: getSkillContent() }] };
  },
};
