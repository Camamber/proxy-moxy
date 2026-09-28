import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { SessionInfo } from '@proxy-moxy/shared';
import { startBackend, type Backend } from '../../src/app.ts';
import { createEchoUpstream, listRecords, listen, proxied, raw, settledRecord, stop, testConfig } from './helpers.ts';

describe('session API', () => {
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

  test('sessions are created on first touch and advertise their proxy url', async () => {
    const info = JSON.parse((await raw(`${backend.apiUrl}/api/sessions/sess5`)).body.toString()) as SessionInfo;
    assert.equal(info.uid, 'sess5');
    assert.equal(info.proxyUrl, `${backend.proxyUrl}/sess5`);
    assert.equal(info.requestCount, 0);
  });

  test('lists and clears the history', async () => {
    await proxied(backend, 'sess6', `${upstreamUrl}/one`);
    await settledRecord(backend, 'sess6');
    assert.equal((await listRecords(backend, 'sess6')).length, 1);

    assert.equal((await raw(`${backend.apiUrl}/api/sessions/sess6/requests`, { method: 'DELETE' })).status, 204);
    assert.deepEqual(await listRecords(backend, 'sess6'), []);
  });

  test('validates uids and answers 404 for unknown routes', async () => {
    assert.equal((await raw(`${backend.apiUrl}/api/sessions/bad.uid`)).status, 400);
    assert.equal((await raw(`${backend.apiUrl}/nope`)).status, 404);
    assert.equal((await raw(`${backend.apiUrl}/api/health`)).status, 200);
  });

  test('events stream pushes pending and settled records', async () => {
    const controller = new AbortController();
    const res = await fetch(`${backend.apiUrl}/api/sessions/sess7/events`, { signal: controller.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await proxied(backend, 'sess7', `${upstreamUrl}/live`);

    let text = '';
    while (!/"response":\{/.test(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    controller.abort();

    const events = text.split('\n\n').filter((block) => block.startsWith('event: request'));
    assert.ok(events.length >= 2, 'pending and settled events');
    assert.match(events[0] ?? '', /"response":null/);
    assert.match(events.at(-1) ?? '', /"status":201/);
  });
});
