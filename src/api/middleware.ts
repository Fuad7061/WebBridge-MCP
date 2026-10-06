import type { FastifyInstance } from 'fastify';
import { validateApiKey } from '../auth.js';
import type { AppConfig } from '../types/index.js';

/** Paths that handle their own auth (dashboard uses a session cookie) or are public. */
function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  return path === '/health' || path === '/' || path === '/favicon.ico' || path.startsWith('/assets/') || path === '/dashboard' || path.startsWith('/dashboard/');
}

export function registerMiddleware(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onRequest', async (request, reply) => {
    if (isPublicPath(request.url)) return;

    // Read config.authToken on every request so dashboard changes apply live
    if (!config.authToken) return;

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.status(401).send({ success: false, error: 'Missing Authorization header' });
      return;
    }
    if (!validateApiKey(authHeader, config.authToken)) {
      reply.status(401).send({ success: false, error: 'Invalid API key' });
      return;
    }
  });
}
