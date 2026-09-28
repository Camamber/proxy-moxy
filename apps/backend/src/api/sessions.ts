import { Hono, type Handler, type MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  isSessionUid,
  parseBaseUrl,
  type RequestEdit,
  type RequestRecord,
  type Session,
  type SessionInfo,
} from '@proxy-moxy/shared';
import { editedBody } from '../capture/body.ts';
import type { HoldRegistry, ReleaseMode } from '../proxy/holds.ts';
import type { SessionStore } from '../sessions/store.ts';

export interface SessionsDeps {
  store: SessionStore;
  holds: HoldRegistry;
  /** Base URL clients should send proxied requests to. */
  proxyBaseUrl: string;
}

type Env = { Variables: { uid: string } };

const PING_INTERVAL_MS = 25_000;

/**
 * Mounted under `/api/sessions`. `PUT /:uid` creates or reconfigures a session with its base URL;
 * every other route needs an existing session and answers 404 otherwise.
 */
export function createSessionsApp({ store, holds, proxyBaseUrl }: SessionsDeps): Hono<Env> {
  const toInfo = (session: Session): SessionInfo => ({ ...session, proxyUrl: `${proxyBaseUrl}/${session.uid}` });

  /** An invalid uid is a client error on every route. */
  const validUid: MiddlewareHandler<Env> = async (c, next) => {
    const uid = c.req.param('uid') ?? '';
    if (!isSessionUid(uid)) return c.json({ error: 'Invalid session uid' }, 400);
    c.set('uid', uid);
    await next();
  };

  const requireSession: MiddlewareHandler<Env> = async (c, next) => {
    if (!store.get(c.get('uid'))) return c.json({ error: 'Session not found' }, 404);
    await next();
  };

  /** Moves a parked request on: `step` to its next stop, `continue` to the end. */
  const release =
    (mode: ReleaseMode): Handler<Env> =>
    (c) => {
      const hold = holds.get(c.req.param('id') ?? '');
      if (!hold || hold.uid !== c.get('uid')) return c.json({ error: 'Request is not held' }, 409);
      holds.release(hold.recordId, mode);
      return c.body(null, 204);
    };

  return new Hono<Env>()
    .use('/:uid', validUid)
    .use('/:uid/*', validUid)

    .get('/:uid', (c) => {
      const session = store.get(c.get('uid'));
      return session ? c.json(toInfo(session)) : c.json({ error: 'Session not found' }, 404);
    })
    .put('/:uid', async (c) => {
      const payload = (await c.req.json().catch(() => null)) as { baseUrl?: unknown } | null;
      const parsed = parseBaseUrl(typeof payload?.baseUrl === 'string' ? payload.baseUrl : '');
      if (!parsed.ok) return c.json({ error: parsed.error }, 400);
      const { session, created } = store.save(c.get('uid'), { baseUrl: parsed.baseUrl });
      return c.json(toInfo(session), created ? 201 : 200);
    })

    .post('/:uid/pause', requireSession, (c) => c.json(toInfo(store.setPaused(c.get('uid'), true) as Session)))
    .post('/:uid/resume', requireSession, (c) => {
      const uid = c.get('uid');
      // Unpause first so released requests do not stop again at the response breakpoint.
      const session = store.setPaused(uid, false) as Session;
      const released = holds.releaseAll(uid);
      return c.json({ ...toInfo(session), released });
    })

    .get('/:uid/requests', requireSession, (c) => c.json({ requests: store.listRequests(c.get('uid')) }))
    .delete('/:uid/requests', requireSession, (c) => {
      store.clearRequests(c.get('uid'));
      return c.body(null, 204);
    })

    .post('/:uid/requests/:id/step', requireSession, release('step'))
    .post('/:uid/requests/:id/continue', requireSession, release('continue'))
    .patch('/:uid/requests/:id', requireSession, async (c) => {
      const uid = c.get('uid');
      const id = c.req.param('id');
      const hold = holds.get(id);
      const record = store.getRequest(uid, id);
      if (!hold || hold.uid !== uid || !record) return c.json({ error: 'Request is not held' }, 409);

      const edit = (await c.req.json().catch(() => null)) as RequestEdit | null;
      const stage = edit?.request ? 'request' : edit?.response ? 'response' : null;
      const body = stage ? edit?.[stage]?.body : undefined;
      if (!stage || typeof body !== 'string') {
        return c.json({ error: 'Send { request: { body } } or { response: { body } }' }, 400);
      }
      if (stage !== hold.stage) return c.json({ error: `Request is held at the ${hold.stage} stage` }, 409);

      holds.edit(id, { body });
      const updated: RequestRecord =
        stage === 'request'
          ? { ...record, request: { ...record.request, body: editedBody(body) } }
          : { ...record, response: record.response && { ...record.response, body: editedBody(body) } };
      store.upsertRequest(updated);
      return c.json(updated);
    })

    .get('/:uid/events', requireSession, (c) => {
      c.header('x-accel-buffering', 'no');
      return streamSSE(c, async (stream) => {
        const uid = c.get('uid');
        await stream.write(': connected\n\n');

        const unsubscribe = store.subscribe(uid, (event) => {
          void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        });
        const ping = setInterval(() => void stream.write(': ping\n\n'), PING_INTERVAL_MS);

        // Stay open until the client goes away, whichever signal fires first.
        await new Promise<void>((resolve) => {
          stream.onAbort(resolve);
          c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        clearInterval(ping);
        unsubscribe();
      });
    });
}
