import { Hono } from 'hono';
import { proxy } from 'hono/proxy';
import type { RequestRecord } from '@proxy-moxy/shared';
import { bufferSource, EMPTY_BODY, toCapturedBody } from '../capture/body.ts';
import { headersToRecord } from '../capture/headers.ts';
import { BodyCapture } from '../capture/stream.ts';
import type { BackendConfig } from '../config.ts';
import type { Logger } from '../logger.ts';
import type { SessionStore } from '../sessions/store.ts';
import type { HoldRegistry } from './holds.ts';
import { resolveTarget } from './target.ts';

export interface ProxyDeps {
  store: SessionStore;
  holds: HoldRegistry;
  config: BackendConfig;
  log: Logger;
}

const USAGE = 'Use /<session-uid>?url=<target-url>';

/**
 * `ANY /<session-uid>?url=<target>`: forwards the request with `hono/proxy` and records it.
 *
 * Running session: bodies stream through, the history keeps the first bytes of each.
 * Paused session: the request is buffered and parked before the upstream call, and the
 * response is buffered and parked before delivery. Each stop waits for step into (go to the
 * next stop), continue (run to the end, skipping later stops) or resume, and applies whatever
 * the user edited meanwhile.
 */
export function createProxyApp({ store, holds, config, log }: ProxyDeps): Hono {
  const app = new Hono();
  const limit = config.bodyCaptureLimit;

  app.all('/:uid', async (c) => {
    const resolved = resolveTarget(c.req.param('uid'), new URL(c.req.url).searchParams);
    if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status);
    const { uid, target } = resolved;

    const paused = store.getOrCreate(uid).paused;
    const requestHeaders = headersToRecord(c.req.raw.headers);
    const tracker = new Tracker(store, log, {
      id: crypto.randomUUID(),
      sessionUid: uid,
      startedAt: new Date().toISOString(),
      durationMs: null,
      stage: paused ? 'request' : 'upstream',
      held: paused,
      request: { method: c.req.method, url: target.href, headers: requestHeaders, body: EMPTY_BODY },
      response: null,
      error: null,
    });
    const { id } = tracker.record;
    c.req.raw.signal.addEventListener(
      'abort',
      () => holds.cancel(id, new Error('Client disconnected while the request was held')),
      { once: true },
    );

    // In streaming mode the request body is only known once it has been sent.
    let requestCapture: BodyCapture | null = null;
    const requestPatch = (): Partial<RequestRecord> =>
      requestCapture
        ? { request: { ...tracker.record.request, body: toCapturedBody(requestCapture, requestHeaders) } }
        : {};

    // Set by `continue`: this request skips the rest of its stops even while the session stays paused.
    let runToEnd = false;

    try {
      // --- request breakpoint ---
      let raw = c.req.raw;
      let body: RequestInit['body'];
      if (paused) {
        const original = Buffer.from(await c.req.raw.arrayBuffer());
        tracker.update({ request: { ...tracker.record.request, body: toCapturedBody(bufferSource(original, limit), requestHeaders) } });

        const { edits, mode } = await holds.hold(uid, id, 'request');
        runToEnd = mode === 'continue';
        const edited = edits.body !== undefined;
        const bytes = edited ? Buffer.from(edits.body as string, 'utf8') : original;
        raw = new Request(c.req.raw.url, {
          method: c.req.method,
          headers: bufferedHeaders(c.req.raw.headers, c.req.raw.body ? bytes : null, edited),
          body: c.req.raw.body ? bytes : undefined,
          signal: c.req.raw.signal,
        });
        const headers = headersToRecord(raw.headers);
        tracker.update({
          stage: 'upstream',
          held: false,
          request: { ...tracker.record.request, headers, body: toCapturedBody(bufferSource(bytes, limit), headers) },
        });
      } else {
        requestCapture = new BodyCapture(limit);
        body = c.req.raw.body?.pipeThrough(requestCapture.stream) ?? null;
      }

      // --- upstream call; the timeout covers waiting for response headers only ---
      const timeout = new AbortController();
      const timer = setTimeout(
        () => timeout.abort(new Error(`Upstream timed out after ${config.upstreamTimeoutMs}ms`)),
        config.upstreamTimeoutMs,
      );
      let upstream: Response;
      try {
        upstream = await proxy(target, {
          raw,
          ...(body === undefined ? {} : { body }),
          signal: AbortSignal.any([c.req.raw.signal, timeout.signal]),
        });
      } finally {
        clearTimeout(timer);
      }

      const responseHeaders = headersToRecord(upstream.headers);
      const base = { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders };
      if (!upstream.body) {
        tracker.settle({ ...requestPatch(), response: { ...base, body: EMPTY_BODY }, error: null });
        return upstream;
      }

      // --- response breakpoint (also catches requests that were in flight when the session paused) ---
      if (!runToEnd && store.get(uid)?.paused) {
        const original = Buffer.from(await upstream.arrayBuffer());
        tracker.update({
          ...requestPatch(),
          stage: 'response',
          held: true,
          response: { ...base, body: toCapturedBody(bufferSource(original, limit), responseHeaders) },
        });

        const { edits } = await holds.hold(uid, id, 'response');
        const edited = edits.body !== undefined;
        const bytes = edited ? Buffer.from(edits.body as string, 'utf8') : original;
        const headers = new Headers(upstream.headers);
        headers.set('content-length', String(bytes.byteLength));
        if (edited) headers.delete('content-encoding');
        const finalHeaders = headersToRecord(headers);
        tracker.settle({
          response: { ...base, headers: finalHeaders, body: toCapturedBody(bufferSource(bytes, limit), finalHeaders) },
          error: null,
        });
        return new Response(bytes, { status: upstream.status, statusText: upstream.statusText, headers });
      }

      // --- streaming delivery ---
      const responseCapture = new BodyCapture(limit);
      void responseCapture.done.then((outcome) => {
        tracker.settle({
          ...requestPatch(),
          response: { ...base, body: toCapturedBody(responseCapture, responseHeaders) },
          error: outcome.complete ? null : `Response interrupted: ${describeError(outcome.reason)}`,
        });
      });
      return new Response(upstream.body.pipeThrough(responseCapture.stream), upstream);
    } catch (err) {
      const message = describeError(err);
      tracker.settle({ ...requestPatch(), response: null, error: message });
      return c.json({ error: 'Bad Gateway', message }, 502);
    }
  });

  app.notFound((c) => c.json({ error: USAGE }, 404));
  return app;
}

/** Keeps the store in sync with a request's progress and settles it exactly once. */
class Tracker {
  record: RequestRecord;
  #store: SessionStore;
  #log: Logger;
  #startedAt = performance.now();
  #settled = false;

  constructor(store: SessionStore, log: Logger, initial: RequestRecord) {
    this.#store = store;
    this.#log = log;
    this.record = initial;
    store.upsertRequest(initial);
  }

  update(patch: Partial<RequestRecord>): void {
    this.record = { ...this.record, ...patch };
    this.#store.upsertRequest(this.record);
  }

  settle(patch: Partial<RequestRecord>): void {
    if (this.#settled) return;
    this.#settled = true;
    this.update({ ...patch, stage: 'done', held: false, durationMs: Math.round(performance.now() - this.#startedAt) });

    const { sessionUid, request, response, error, durationMs } = this.record;
    const label = `${sessionUid} ${request.method} ${request.url}`;
    if (error) this.#log.warn(`${label} ✖ ${error} ${durationMs}ms`);
    else this.#log.info(`${label} → ${response?.status} ${durationMs}ms`);
  }
}

/** Headers for a body that was buffered whole: the length is known, chunking is not needed. */
function bufferedHeaders(source: Headers, body: Buffer | null, edited: boolean): Headers {
  const headers = new Headers(source);
  headers.delete('transfer-encoding');
  headers.delete('content-length');
  if (body) headers.set('content-length', String(body.byteLength));
  if (edited) headers.delete('content-encoding'); // the user edited the decoded text
  return headers;
}

/** `fetch` wraps network errors: "fetch failed" with the real reason in `cause`. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return err === undefined ? 'aborted' : String(err);
  let cause: unknown = err.cause;
  if (cause instanceof AggregateError && cause.errors.length > 0) cause = cause.errors[0];
  const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : null;
  return detail && detail !== err.message ? `${err.message}: ${detail}` : err.message;
}
