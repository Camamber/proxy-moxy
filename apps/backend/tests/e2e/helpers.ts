import { createServer, request, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import type { RequestRecord } from '@proxy-moxy/shared';
import type { Backend } from '../../src/app.ts';
import type { BackendConfig } from '../../src/config.ts';

/** Ephemeral ports, no static files, quiet logs. */
export const testConfig: BackendConfig = {
  host: '127.0.0.1',
  apiPort: 0,
  proxyPort: 0,
  publicProxyUrl: null,
  staticDir: null,
  bodyCaptureLimit: 4096,
  historyLimit: 100,
  upstreamTimeoutMs: 5000,
  logLevel: 'silent',
};

export interface RawInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** Plain http client, so compression and headers arrive exactly as the server sent them. */
export function raw(url: string, init: RawInit = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', headers: init.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

export function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });
}

export function stop(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

/** Polls until `probe` returns a value. */
export async function until<T>(probe: () => Promise<T | undefined>, timeoutMs = 2000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/**
 * Upstream that echoes what it received as JSON with status 201.
 * Paths starting with `/gz` answer gzip-encoded with status 200; `/slow` answers after 200ms.
 */
export function createEchoUpstream(): Server {
  return createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const payload = JSON.stringify({
        method: req.method,
        url: req.url,
        host: req.headers.host,
        xTest: req.headers['x-test'] ?? null,
        body: Buffer.concat(chunks).toString(),
      });
      if (req.url?.startsWith('/slow')) {
        setTimeout(() => {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(payload);
        }, 200);
        return;
      }
      if (req.url?.startsWith('/gz')) {
        res.writeHead(200, { 'content-type': 'application/json', 'content-encoding': 'gzip' });
        res.end(gzipSync(payload));
      } else {
        res.writeHead(201, { 'content-type': 'application/json', 'x-upstream': 'yes' });
        res.end(payload);
      }
    });
  });
}

/** Sends `target` through the session's proxy endpoint. */
export function proxied(backend: Backend, uid: string, target: string, init?: RawInit): Promise<RawResponse> {
  return raw(`${backend.proxyUrl}/${uid}?url=${encodeURIComponent(target)}`, init);
}

export async function listRecords(backend: Backend, uid: string): Promise<RequestRecord[]> {
  const res = await raw(`${backend.apiUrl}/api/sessions/${uid}/requests`);
  return (JSON.parse(res.body.toString()) as { requests: RequestRecord[] }).requests;
}

/** The record settles a tick after the client has its response, so wait for it. */
export function settledRecord(backend: Backend, uid: string, index = 0): Promise<RequestRecord> {
  return until(async () => {
    const record = (await listRecords(backend, uid))[index];
    return record && (record.response || record.error) ? record : undefined;
  });
}

/** JSON call against the API; resolves with the status and the parsed body (or null). */
export async function json<T = unknown>(url: string, method = 'GET', payload?: unknown): Promise<{ status: number; body: T | null }> {
  const res = await raw(url, {
    method,
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = res.body.toString();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
}

/** Polls until the record matching `where` exists. */
export function recordWhere(backend: Backend, uid: string, where: (record: RequestRecord) => boolean): Promise<RequestRecord> {
  return until(async () => (await listRecords(backend, uid)).find(where));
}
