#!/usr/bin/env node
import { program } from 'commander';
import { getConfig } from './config.js';
import { startHTTPServer } from './api/server.js';
import { startMCPServer } from './mcp/server.js';
import { createBrowserManager } from './browser/engine.js';
import { createSessionStore } from './browser/session.js';
import type { AppConfig } from './types/index.js';

async function main() {
  program
    .name('webridge')
    .description('WebBridge MCP — Dual-protocol browser automation server')
    .version('1.0.0')
    .option('--mode <mode>', 'Server mode: http or stdio')
    .option('-p, --port <port>', 'HTTP server port')
    .option('--host <host>', 'HTTP server host')
    .option('--auth-token <token>', 'API key for authentication')
    .option('--stealth-level <level>', 'Stealth level: basic, standard, stealth')
    .action(async (options) => {
      const envConfig = getConfig();
      const config: AppConfig = {
        ...envConfig,
        mode: (options.mode as 'http' | 'stdio') || envConfig.mode,
        port: options.port ? parseInt(options.port, 10) : envConfig.port,
        host: options.host || envConfig.host,
        authToken: options.authToken || envConfig.authToken,
        stealthLevel: (options.stealthLevel as AppConfig['stealthLevel']) || envConfig.stealthLevel,
      };

      if (config.mode === 'http' && !config.authToken) {
        console.warn('WARNING: No auth token set. Set WEBBRIDGE_AUTH_TOKEN or pass --auth-token');
        console.warn('Continuing without authentication (insecure)');
      }

      if (config.mode === 'http') {
        await startHTTPServer(config);
      } else {
        const browser = createBrowserManager(config);
        const session = createSessionStore(config);
        const ctx = { browser, session, config };
        console.error('WebBridge MCP stdio server starting...');
        await startMCPServer(ctx);
      }
    });

  program
    .command('health')
    .description('Check if the HTTP server is running')
    .option('--port <port>', 'Server port', '3456')
    .action(async (options) => {
      const port = options.port || '3456';
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
      } catch (err) {
        console.error('Server not reachable:', err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  if (process.argv.length <= 2) {
    process.argv.push('--help');
  }

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
