import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { startBackend, type Backend } from '../../src/app.ts';
import { createEchoUpstream, listRecords, listen, proxied, raw, settledRecord, stop, testConfig } from './helpers.ts';

describe('proxy endpoint', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let backend: Backend;

  before(async () => {
    upstream = createEchoUpstream();
    upstreamUrl = await listen(upstream);
    backend = await startBackend(testConfig);
  });

  after(async () => {
    await backend.close();
    await stop(upstream);
  });

  test('forwards the request, streams the response and records both', async () => {
    const res = await proxied(backend, 'sess1', `${upstreamUrl}/echo?a=1`, {
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
    assert.equal(record.response?.headers['x-upstream'], 'yes');
    assert.equal(JSON.parse(record.response?.body.text ?? '').body, 'hello');
    assert.ok(record.durationMs !== null && record.durationMs >= 0);
    assert.equal(record.error, null);
  });

  test('appends extra query params; compressed upstream bodies arrive decoded', async () => {
    const res = await raw(`${backend.proxyUrl}/sess2?url=${encodeURIComponent(`${upstreamUrl}/gz?x=1`)}&y=2`);
    // fetch decompresses and hono/proxy drops content-encoding, so the client sees plain bytes.
    assert.equal(res.headers['content-encoding'], undefined);
    assert.equal(JSON.parse(res.body.toString()).url, '/gz?x=1&y=2');

    const record = await settledRecord(backend, 'sess2');
    assert.equal(JSON.parse(record.response?.body.text ?? '').url, '/gz?x=1&y=2');
  });

  test('rejects malformed proxy urls without touching the history', async () => {
    assert.equal((await raw(`${backend.proxyUrl}/`)).status, 404);
    assert.equal((await raw(`${backend.proxyUrl}/sess3`)).status, 400);
    assert.equal((await raw(`${backend.proxyUrl}/sess3?url=nope`)).status, 400);
    assert.deepEqual(await listRecords(backend, 'sess3'), []);
  });

  test('records upstream failures and answers 502', async () => {
    const dead = createServer();
    const deadUrl = await listen(dead);
    await stop(dead);

    const res = await proxied(backend, 'sess4', `${deadUrl}/x`);
    assert.equal(res.status, 502);
    assert.equal(JSON.parse(res.body.toString()).error, 'Bad Gateway');

    const record = await settledRecord(backend, 'sess4');
    assert.equal(record.response, null);
    assert.match(record.error ?? '', /ECONNREFUSED/);
  });
});
