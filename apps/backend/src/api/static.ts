import { extname } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/**
 * Serves a built single-page app from `root`: fingerprinted assets are cached forever,
 * HTML is always revalidated, and extension-less paths fall back to index.html so `/:uid` works.
 * Register after the API routes so those keep precedence.
 */
export function mountSpa(app: Hono, root: string): void {
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.ok) c.res.headers.set('cache-control', 'public, max-age=31536000, immutable');
  });
  app.use('*', async (c, next) => {
    await next();
    if (c.res.headers.get('content-type')?.startsWith('text/html')) c.res.headers.set('cache-control', 'no-cache');
  });
  app.use('*', serveStatic({ root }));

  const index = serveStatic({ root, path: 'index.html' });
  app.get('*', (c, next) => (extname(c.req.path) ? next() : index(c, next)));
}
