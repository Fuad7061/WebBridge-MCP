import type { BrowserContext, Page, Browser } from 'playwright';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  browser: BrowserManager;
  session: SessionStore;
  config: AppConfig;
}

export interface ToolResult {
  content: Array<{ type: 'text' | 'image'; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

export interface BrowserManager {
  acquireContext(tabIndex?: number, tabName?: string): Promise<{ context: BrowserContext; page: Page }>;
  releaseContext(): Promise<void>;
  getPage(): Promise<Page>;
  close(): Promise<void>;
  storeCookies(cookies: any[]): void;
  getStoredCookies(): any[];
  clearStoredCookies(): void;
  runLocked<T>(fn: () => Promise<T>): Promise<T>;
  pages(): Promise<Page[]>;
  setTabName(name: string, page?: Page): void;
  getLastTabInfo(): { name: string | null; index: number };
  getTabStats(): Promise<Array<{ index: number; name: string | null; url: string; title: string; idleSeconds: number }>>;
}

export interface SessionStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  export(): Record<string, string>;
  import(data: Record<string, string>): void;
}

export interface AppConfig {
  mode: 'stdio' | 'http';
  port: number;
  host: string;
  authToken: string;
  stealthLevel: 'basic' | 'standard' | 'stealth';
  headless: boolean | 'new';
  chromePath?: string;
  dataDir: string;
  maxConcurrency: number;
  typingDelayMs: number;
  proxyUrl?: string;
  rateLimitMax: number;
  tabIdleTimeoutMs?: number;
}

export interface ReconResult {
  url: string;
  title: string;
  meta: Record<string, string>;
  headings: Array<{ level: number; text: string }>;
  elements: Array<{
    tag: string;
    text: string | null;
    selector: string;
    type?: string;
    href?: string;
    role?: string;
    x?: number;
    y?: number;
  }>;
  totalElements: number;
  forms: Array<{
    action?: string;
    method?: string;
    id?: string;
    fields: Array<{
      tag: string;
      type?: string;
      name?: string;
      id?: string;
      label?: string;
      placeholder?: string;
      required?: boolean;
      selector: string;
    }>;
  }>;
  overlays: Array<{ tag: string; text: string; selector: string }>;
  captchas: Array<{ type: string; selector: string }>;
  contentSummary: string;
}

export interface CrawlOptions {
  url: string;
  maxDepth?: number;
  maxPages?: number;
  include?: string[];
  exclude?: string[];
  extractContent?: boolean;
}

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
