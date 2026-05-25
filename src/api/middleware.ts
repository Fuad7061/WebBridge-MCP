import type { FastifyInstance } from 'fastify';
import { validateApiKey } from '../auth.js';
import type { AppConfig } from '../types/index.js';

export function registerMiddleware(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;

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
