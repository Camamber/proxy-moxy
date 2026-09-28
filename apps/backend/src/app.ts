import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import { createApiApp } from './api/app.ts';
import type { BackendConfig } from './config.ts';
import { createLogger, type Logger } from './logger.ts';
import { createProxyApp } from './proxy/app.ts';
import { HoldRegistry } from './proxy/holds.ts';
import { SessionStore } from './sessions/store.ts';

export interface Backend {
  store: SessionStore;
  apiUrl: string;
  proxyUrl: string;
  /** What the UI tells clients to use; equals `proxyUrl` unless `publicProxyUrl` is configured. */
  proxyBaseUrl: string;
  close(): Promise<void>;
}

export interface BackendOptions {
  logger?: Logger;
}

/** Starts both listeners. The proxy goes first so the API can advertise its real address. */
export async function startBackend(config: BackendConfig, options: BackendOptions = {}): Promise<Backend> {
  const log = options.logger ?? createLogger(config.logLevel);
  const store = new SessionStore({ historyLimit: config.historyLimit });
  const holds = new HoldRegistry();

  const proxy = await listen(createProxyApp({ store, holds, config, log }), config.proxyPort, config.host);
  const proxyBaseUrl = config.publicProxyUrl ?? proxy.url;

  const staticDir = resolveStaticDir(config.staticDir, log);
  const api = await listen(
    createApiApp({ store, holds, config: { ...config, staticDir }, log, proxyBaseUrl }),
    config.apiPort,
    config.host,
  );

  log.info(`api    ${api.url}${staticDir ? `  (serving ${staticDir})` : ''}`);
  log.info(`proxy  ${proxy.url}  →  ${proxyBaseUrl}/<session-uid>?url=<target-url>`);

  return {
    store,
    apiUrl: api.url,
    proxyUrl: proxy.url,
    proxyBaseUrl,
    close: async () => {
      await Promise.all([api.server, proxy.server].map(shutdown));
    },
  };
}

function resolveStaticDir(dir: string | null, log: Logger): string | null {
  if (dir && !existsSync(dir)) {
    log.info(`frontend build not found at ${dir}; serving the API only (run \`pnpm build\`)`);
    return null;
  }
  return dir;
}

interface Listening {
  server: ServerType;
  url: string;
}

function listen(app: Hono, port: number, hostname: string): Promise<Listening> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname }, (info: AddressInfo) => {
      server.off('error', reject);
      resolve({ server, url: `http://${displayHost(info.address)}:${info.port}` });
    });
    server.once('error', reject);
  });
}

function shutdown(server: ServerType): Promise<void> {
  if ('closeAllConnections' in server) server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

function displayHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return 'localhost';
  return host.includes(':') ? `[${host}]` : host;
}
