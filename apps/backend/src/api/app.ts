import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { BackendConfig } from '../config.ts';
import type { Logger } from '../logger.ts';
import type { HoldRegistry } from '../proxy/holds.ts';
import type { SessionStore } from '../sessions/store.ts';
import { createSessionsApp } from './sessions.ts';
import { mountSpa } from './static.ts';

export interface ApiDeps {
  store: SessionStore;
  holds: HoldRegistry;
  config: BackendConfig;
  log: Logger;
  proxyBaseUrl: string;
}

/** JSON API under /api plus, when configured, the built frontend for everything else. */
export function createApiApp({ store, holds, config, log, proxyBaseUrl }: ApiDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    log.error(`${c.req.method} ${c.req.path}: ${err.message}`);
    return c.json({ error: 'Internal error' }, 500);
  });
  app.notFound((c) => c.json({ error: 'Not found' }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api/sessions', createSessionsApp({ store, holds, proxyBaseUrl }));
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404)); // keep unknown API paths out of the SPA fallback

  if (config.staticDir) mountSpa(app, config.staticDir);
  return app;
}
