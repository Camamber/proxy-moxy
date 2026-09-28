import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { RequestRecord, SessionInfo } from '@proxy-moxy/shared';
import { startBackend, type Backend } from '../../src/app.ts';
import { createEchoUpstream, createSession, json, listen, proxied, recordWhere, settledRecord, stop, testConfig } from './helpers.ts';

describe('breakpoints', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let backend: Backend;

  const sessionUrl = (uid: string) => `${backend.apiUrl}/api/sessions/${uid}`;
  const pause = (uid: string) => json<SessionInfo>(`${sessionUrl(uid)}/pause`, 'POST');
  const resume = (uid: string) => json<SessionInfo & { released: number }>(`${sessionUrl(uid)}/resume`, 'POST');
  const step = (uid: string, id: string) => json(`${sessionUrl(uid)}/requests/${id}/step`, 'POST');
  const cont = (uid: string, id: string) => json(`${sessionUrl(uid)}/requests/${id}/continue`, 'POST');
  const edit = (uid: string, id: string, payload: unknown) => json<RequestRecord>(`${sessionUrl(uid)}/requests/${id}`, 'PATCH', payload);
  const setFilter = (uid: string, filter: unknown) => json<SessionInfo & { error?: string }>(`${sessionUrl(uid)}/pause-filter`, 'PUT', filter);
  const heldAt = (uid: string, stage: 'request' | 'response') => recordWhere(backend, uid, (r) => r.held && r.stage === stage);
  /** A session pointed at the echo upstream, already paused. */
  const pausedSession = async (uid: string) => {
    await createSession(backend, uid, upstreamUrl);
    assert.equal((await pause(uid)).body?.paused, true);
  };

  before(async () => {
    upstream = createEchoUpstream();
    upstreamUrl = await listen(upstream);
    backend = await startBackend(testConfig);
  });

  after(async () => {
    await backend.close();
    await stop(upstream);
  });

  test('a paused session parks the request, then the response; edits reach both sides', async () => {
    const uid = 'bp1';
    await pausedSession(uid);
    const client = proxied(backend, uid, '/edit', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'original' });

    const atRequest = await heldAt(uid, 'request');
    assert.equal(atRequest.request.body.text, 'original');
    assert.equal(atRequest.request.url, `${upstreamUrl}/edit`);
    assert.equal(atRequest.response, null);

    assert.equal((await edit(uid, atRequest.id, { response: { body: 'x' } })).status, 409); // wrong stage
    assert.equal((await edit(uid, atRequest.id, {})).status, 400);
    const edited = await edit(uid, atRequest.id, { request: { body: 'edited request' } });
    assert.equal(edited.status, 200);
    assert.equal(edited.body?.request.body.text, 'edited request');

    assert.equal((await step(uid, atRequest.id)).status, 204);
    const atResponse = await heldAt(uid, 'response');
    assert.equal(JSON.parse(atResponse.response?.body.text ?? '').body, 'edited request'); // upstream saw the edit
    assert.equal(atResponse.request.headers['content-length'], String('edited request'.length));

    assert.equal((await edit(uid, atResponse.id, { response: { body: '{"replaced":true}' } })).status, 200);
    assert.equal((await step(uid, atResponse.id)).status, 204);

    const res = await client;
    assert.equal(res.status, 201);
    assert.equal(res.body.toString(), '{"replaced":true}');
    assert.equal(res.headers['content-length'], '17');

    const done = await settledRecord(backend, uid);
    assert.equal(done.stage, 'done');
    assert.equal(done.held, false);
    assert.equal(done.response?.body.text, '{"replaced":true}');
    assert.equal((await step(uid, done.id)).status, 409);
    await resume(uid);
  });

  test('continue runs one parked request to the end while the session stays paused', async () => {
    const uid = 'bp5';
    await pausedSession(uid);
    const client = proxied(backend, uid, '/run', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'original' });
    const parked = await heldAt(uid, 'request');
    await edit(uid, parked.id, { request: { body: 'edited' } });
    assert.equal((await cont(uid, parked.id)).status, 204);

    const res = await client; // would hang if it stopped again at the response stop
    assert.equal(res.status, 201);
    assert.equal(JSON.parse(res.body.toString()).body, 'edited');
    const done = await settledRecord(backend, uid);
    assert.equal(done.stage, 'done');
    assert.equal((await cont(uid, parked.id)).status, 409);

    // The session is still paused, so the next request stops as usual.
    assert.equal((await json<SessionInfo>(sessionUrl(uid))).body?.paused, true);
    const next = proxied(backend, uid, '/next');
    await recordWhere(backend, uid, (r) => r.held && r.request.url.endsWith('/next'));
    await resume(uid);
    assert.equal((await next).status, 201);
  });

  test('continue at the response stop delivers the response', async () => {
    const uid = 'bp6';
    await pausedSession(uid);
    const client = proxied(backend, uid, '/late');
    await step(uid, (await heldAt(uid, 'request')).id);
    const parked = await heldAt(uid, 'response');
    assert.equal((await cont(uid, parked.id)).status, 204);
    assert.equal((await client).status, 201);
    assert.equal((await settledRecord(backend, uid)).stage, 'done');
    await resume(uid);
  });

  test('resume releases every parked request and unpauses the session', async () => {
    const uid = 'bp2';
    await pausedSession(uid);
    const clients = [proxied(backend, uid, '/a'), proxied(backend, uid, '/b')];
    await recordWhere(backend, uid, (r) => r.held && r.request.url.endsWith('/a'));
    await recordWhere(backend, uid, (r) => r.held && r.request.url.endsWith('/b'));

    const resumed = await resume(uid);
    assert.equal(resumed.body?.paused, false);
    assert.equal(resumed.body?.released, 2);

    for (const res of await Promise.all(clients)) assert.equal(res.status, 201);
    await settledRecord(backend, uid, 0);
    await settledRecord(backend, uid, 1);
  });

  test('pausing while a request is in flight parks only its response', async () => {
    const uid = 'bp3';
    await createSession(backend, uid, upstreamUrl);
    const client = proxied(backend, uid, '/slow');
    await recordWhere(backend, uid, (r) => r.stage === 'upstream');
    await pause(uid);

    const parked = await heldAt(uid, 'response');
    assert.equal(parked.response?.status, 201);
    await step(uid, parked.id);

    assert.equal((await client).status, 201);
    assert.equal((await settledRecord(backend, uid)).stage, 'done');
    await resume(uid);
  });

  test('a client that gives up while parked is recorded as an error and released', async () => {
    const uid = 'bp4';
    await pausedSession(uid);
    const controller = new AbortController();
    const client = fetch(`${backend.proxyUrl}/${uid}/gone`, { signal: controller.signal }).catch(() => null);
    const parked = await heldAt(uid, 'request');

    controller.abort();
    await client;
    const failed = await recordWhere(backend, uid, (r) => r.id === parked.id && r.error !== null);
    assert.match(failed.error ?? '', /disconnected/);
    assert.equal(failed.held, false);
    assert.equal((await step(uid, parked.id)).status, 409);
    await resume(uid);
  });

  test('the pause filter stops only matching paths; the rest pass through while paused', async () => {
    const uid = 'flt1';
    await pausedSession(uid);
    const set = await setFilter(uid, { paths: ['/users/*'] });
    assert.equal(set.status, 200);
    assert.deepEqual(set.body?.pauseFilter, { methods: [], paths: ['/users/*'], stages: ['request', 'response'] });

    assert.equal((await proxied(backend, uid, '/orders/1')).status, 201); // not matched: answered although paused

    const matched = proxied(backend, uid, '/users/7');
    const parked = await heldAt(uid, 'request');
    assert.equal(parked.request.url, `${upstreamUrl}/users/7`);
    await resume(uid);
    assert.equal((await matched).status, 201);
  });

  test('the pause filter can match a method and stop at the response only', async () => {
    const uid = 'flt2';
    await pausedSession(uid);
    await setFilter(uid, { methods: ['post'], stages: ['response'] });

    assert.equal((await proxied(backend, uid, '/read')).status, 201); // GET passes

    const client = proxied(backend, uid, '/write', { method: 'POST', body: 'x' });
    const parked = await heldAt(uid, 'response'); // went past the request stop
    assert.equal(parked.request.method, 'POST');
    assert.equal(parked.request.url, `${upstreamUrl}/write`);
    await cont(uid, parked.id);
    assert.equal((await client).status, 201);
    await resume(uid);
  });

  test('a filter change applies to requests already in flight', async () => {
    const uid = 'flt3';
    await createSession(backend, uid, upstreamUrl);
    const client = proxied(backend, uid, '/slow');
    await recordWhere(backend, uid, (r) => r.stage === 'upstream');
    await setFilter(uid, { paths: ['/other'] });
    await pause(uid);
    assert.equal((await client).status, 201); // its response no longer matches, so it is not parked
    await resume(uid);
  });

  test('rejects invalid pause filters and unknown sessions', async () => {
    await createSession(backend, 'flt4', upstreamUrl);
    const cases: [unknown, RegExp][] = [
      [[], /Send \{ methods, paths, stages \}/],
      [{ methods: 'GET' }, /methods must be an array/],
      [{ paths: ['users'] }, /start with \/ or \*/],
      [{ stages: [] }, /at least one stop/],
    ];
    for (const [payload, error] of cases) {
      const res = await setFilter('flt4', payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.match(res.body?.error ?? '', error);
    }
    assert.equal((await setFilter('ghost', {})).status, 404);
  });
});
