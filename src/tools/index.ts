import type { ToolDefinition } from '../types/index.js';
import { navigationTools } from './navigation.js';
import { clickTools } from './click.js';
import { typeTools } from './type.js';
import { scrollTools } from './scroll.js';
import { screenshotTool } from './screenshot.js';
import { tabTools } from './tabs.js';
import { cookieTools } from './cookies.js';
import { formTools } from './forms.js';
import { evaluateTool } from './evaluate.js';
import { extractTools } from './extract.js';
import { overlayTools } from './overlay.js';
import { waitTool } from './wait.js';
import { crawlTools } from './crawl.js';
import { monitorTool } from './monitor.js';
import { webmcpTools } from './webmcp-bridge.js';
import { keyboardTool } from './keyboard.js';
import { workflowGuideTool } from './workflow-guide.js';

export function getAllTools(): ToolDefinition[] {
  return [
    ...navigationTools,
    ...clickTools,
    ...typeTools,
    ...scrollTools,
    screenshotTool,
    ...tabTools,
    ...cookieTools,
    ...formTools,
    evaluateTool,
    ...extractTools,
    ...overlayTools,
    waitTool,
    ...crawlTools,
    monitorTool,
    ...webmcpTools,
    keyboardTool,
    workflowGuideTool,
  ];
}
