import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig, ToolContext, BrowserManager, SessionStore } from '../types/index.js';
import { registerMiddleware } from './middleware.js';
import { registerRoutes } from './routes/index.js';
import { getConfig } from '../config.js';
import { createBrowserManager } from '../browser/engine.js';
import { createSessionStore } from '../browser/session.js';

export async function startHTTPServer(config: AppConfig): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
  });

  const browser = createBrowserManager(config);
  const session = createSessionStore(config);

  const ctx: ToolContext = { browser, session, config };

  registerMiddleware(app as unknown as FastifyInstance, config);
  registerRoutes(app as unknown as FastifyInstance, ctx);

  app.addHook('onClose', async () => {
    await browser.close();
  });

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`WebBridge MCP HTTP server running on http://${config.host}:${config.port}`);
    console.log(`Auth: ${config.authToken ? 'enabled' : 'DISABLED (insecure)'}`);
    console.log(`Stealth level: ${config.stealthLevel}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Type only used for middleware
import type { FastifyInstance } from 'fastify';
