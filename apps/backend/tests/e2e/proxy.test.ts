import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { startBackend, type Backend } from '../../src/app.ts';
import {
  createEchoUpstream,
  createSession,
  listRecords,
  listen,
  proxied,
  raw,
  settledRecord,
  stop,
  testConfig,
} from './helpers.ts';

describe('proxy endpoint', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let backend: Backend;

  const echoedUrl = async (uid: string, path: string) => JSON.parse((await proxied(backend, uid, path)).body.toString()).url as string;

  before(async () => {
    upstream = createEchoUpstream();
    upstreamUrl = await listen(upstream);
    backend = await startBackend(testConfig);
  });

  after(async () => {
    await backend.close();
    await stop(upstream);
  });

  test('forwards the path after the session uid to the base URL and records both sides', async () => {
    await createSession(backend, 'sess1', upstreamUrl);
    const res = await proxied(backend, 'sess1', '/echo?a=1', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-test': 'abc' },
      body: 'hello',
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers['x-upstream'], 'yes');
    const echoed = JSON.parse(res.body.toString());
    assert.equal(echoed.method, 'POST');
    assert.equal(echoed.url, '/echo?a=1');
    assert.equal(echoed.body, 'hello');
    assert.equal(echoed.xTest, 'abc');
    assert.equal(echoed.host, new URL(upstreamUrl).host);

    const record = await settledRecord(backend, 'sess1');
    assert.equal(record.request.method, 'POST');
    assert.equal(record.request.url, `${upstreamUrl}/echo?a=1`);
    assert.equal(record.request.headers['x-test'], 'abc');
    assert.equal(record.request.body.text, 'hello');
    assert.equal(record.response?.status, 201);
    assert.equal(JSON.parse(record.response?.body.text ?? '').body, 'hello');
    assert.ok(record.durationMs !== null && record.durationMs >= 0);
    assert.equal(record.error, null);
  });

  test('keeps the base URL path prefix, trailing slashes and percent-encoding', async () => {
    await createSession(backend, 'prefix', `${upstreamUrl}/v1/`);
    assert.equal(await echoedUrl('prefix', '/users/1?x=1&y=a%20b'), '/v1/users/1?x=1&y=a%20b');
    assert.equal(await echoedUrl('prefix', ''), '/v1');
    assert.equal(await echoedUrl('prefix', '/'), '/v1/');
    assert.equal(await echoedUrl('prefix', '/files/a%20b/%2F'), '/v1/files/a%20b/%2F');
  });

  test('uses the new base URL as soon as the session is reconfigured', async () => {
    await createSession(backend, 'moved', `${upstreamUrl}/old`);
    assert.equal(await echoedUrl('moved', '/x'), '/old/x');
    await createSession(backend, 'moved', `${upstreamUrl}/new`);
    assert.equal(await echoedUrl('moved', '/x'), '/new/x');
  });

  test('compressed upstream bodies arrive decoded', async () => {
    await createSession(backend, 'sess2', upstreamUrl);
    const res = await proxied(backend, 'sess2', '/gz?x=1');
    // fetch decompresses and hono/proxy drops content-encoding, so the client sees plain bytes.
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(JSON.parse(res.body.toString()).url, '/gz?x=1');
    assert.equal(JSON.parse((await settledRecord(backend, 'sess2')).response?.body.text ?? '').url, '/gz?x=1');
  });

  test('unknown sessions and malformed paths get a 404 and nothing is recorded', async () => {
    const unknown = await proxied(backend, 'nobody', '/x');
    assert.equal(unknown.status, 404);
    assert.match(JSON.parse(unknown.body.toString()).error, /Unknown session "nobody"/);
    assert.equal((await raw(`${backend.proxyUrl}/`)).status, 404);
    assert.equal((await raw(`${backend.proxyUrl}/bad.uid/x`)).status, 404);
    assert.equal(backend.store.get('nobody'), null);
  });

  test('records upstream failures and answers 502', async () => {
    const dead = createServer();
    const deadUrl = await listen(dead);
    await stop(dead);
    await createSession(backend, 'sess4', deadUrl);

    const res = await proxied(backend, 'sess4', '/x');
    assert.equal(res.status, 502);
    assert.equal(JSON.parse(res.body.toString()).error, 'Bad Gateway');

    const record = await settledRecord(backend, 'sess4');
    assert.equal(record.response, null);
    assert.match(record.error ?? '', /ECONNREFUSED/);
    assert.equal((await listRecords(backend, 'sess4')).length, 1);
  });
});
