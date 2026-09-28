import { fileURLToPath } from 'node:url';
import type { LogLevel } from './logger.ts';

export interface BackendConfig {
  /** Bind address for both listeners. */
  host: string;
  apiPort: number;
  proxyPort: number;
  /** Public base URL of the proxy shown in the UI; null derives it from the bound address. */
  publicProxyUrl: string | null;
  /** Built frontend to serve from the API listener; null for API only. */
  staticDir: string | null;
  /** Bytes of each request/response body kept in the history. */
  bodyCaptureLimit: number;
  /** Records kept per session. */
  historyLimit: number;
  upstreamTimeoutMs: number;
  logLevel: LogLevel;
}

const LOG_LEVELS = new Set<string>(['debug', 'info', 'warn', 'error', 'silent']);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BackendConfig {
  const logLevel = env.LOG_LEVEL || 'info';
  if (!LOG_LEVELS.has(logLevel)) throw new Error(`LOG_LEVEL must be one of ${[...LOG_LEVELS].join(', ')}`);

  return {
    host: env.HOST || '127.0.0.1',
    apiPort: intEnv(env, 'API_PORT', 4000),
    proxyPort: intEnv(env, 'PROXY_PORT', 4001),
    publicProxyUrl: env.PUBLIC_PROXY_URL ? env.PUBLIC_PROXY_URL.replace(/\/+$/, '') : null,
    staticDir: env.STATIC_DIR === undefined ? defaultStaticDir() : env.STATIC_DIR || null,
    bodyCaptureLimit: intEnv(env, 'BODY_CAPTURE_LIMIT', 256 * 1024),
    historyLimit: intEnv(env, 'HISTORY_LIMIT', 500),
    upstreamTimeoutMs: intEnv(env, 'UPSTREAM_TIMEOUT_MS', 30_000),
    logLevel: logLevel as LogLevel,
  };
}

/** `apps/frontend/dist`, resolved relative to this file so it works from any cwd. */
function defaultStaticDir(): string {
  return fileURLToPath(new URL('../../frontend/dist', import.meta.url));
}

function intEnv(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return value;
}
