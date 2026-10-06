import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { AppConfig, ToolContext } from '../types/index.js';
import { registerMiddleware } from './middleware.js';
import { registerRoutes } from './routes/index.js';
import { createBrowserManager } from '../browser/engine.js';
import { createSessionStore } from '../browser/session.js';
import { registerDashboard } from '../dashboard/routes.js';
import { logger } from '../logger.js';

export async function startHTTPServer(config: AppConfig): Promise<void> {
  const app = Fastify({ logger: { level: 'error' }, trustProxy: true, bodyLimit: 10 * 1024 * 1024 });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    // Dashboard polling must never consume the API quota of the same IP
    allowList: (req) => req.url === '/health' || req.url === '/' || req.url.startsWith('/dashboard') || req.url.startsWith('/assets'),
  });

  const browser = createBrowserManager(config);
  const session = createSessionStore(config);

  const ctx: ToolContext = { browser, session, config };

  registerMiddleware(app as unknown as FastifyInstance, config);
  registerRoutes(app as unknown as FastifyInstance, ctx);
  await registerDashboard(app as unknown as FastifyInstance, ctx);

  // Request logging (debug level only — keeps disk IO low by default)
  app.addHook('onResponse', async (request, reply) => {
    const url = request.url;
    if (url === '/' || url.startsWith('/dashboard') || url.startsWith('/assets') || url === '/health' || url === '/favicon.ico') return;
    const ms = Math.round(reply.elapsedTime);
    if (reply.statusCode >= 500) logger.warn('http', `${request.method} ${url} → ${reply.statusCode} (${ms}ms)`, { ip: request.ip });
    else if (reply.statusCode === 401) logger.warn('http', `Unauthorized ${request.method} ${url}`, { ip: request.ip });
    else logger.debug('http', `${request.method} ${url} → ${reply.statusCode} (${ms}ms)`, { ip: request.ip });
  });

  app.addHook('onError', async (request, _reply, error) => {
    logger.error('http', `${request.method} ${request.url}: ${error.message}`, { stack: error.stack?.split('\n').slice(0, 4).join('\n') });
  });

  app.addHook('onClose', async () => {
    await browser.close();
  });

  const shutdown = async (signal: string) => {
    logger.info('server', `Received ${signal}, shutting down`);
    logger.flush();
    try { await app.close(); } catch { /* ignore */ }
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info('server', `WebBridge MCP HTTP server running on http://${config.host}:${config.port}`);
    logger.info('server', `Dashboard: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/dashboard/`);
    logger.info('server', `Auth: ${config.authToken ? 'enabled' : 'DISABLED (insecure)'} · Stealth level: ${config.stealthLevel} · Data dir: ${config.dataDir}`);
  } catch (err) {
    logger.error('server', `Failed to start: ${err instanceof Error ? err.message : String(err)}`);
    logger.flush();
    process.exit(1);
  }
}

// Type only used for middleware
import type { FastifyInstance } from 'fastify';
