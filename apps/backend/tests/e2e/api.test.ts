import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import type { SessionInfo } from '@proxy-moxy/shared';
import { startBackend, type Backend } from '../../src/app.ts';
import { createEchoUpstream, createSession, json, listRecords, listen, proxied, raw, settledRecord, stop, testConfig } from './helpers.ts';

describe('session API', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let backend: Backend;

  const sessionUrl = (uid: string) => `${backend.apiUrl}/api/sessions/${uid}`;

  before(async () => {
    upstream = createEchoUpstream();
    upstreamUrl = await listen(upstream);
    backend = await startBackend(testConfig);
  });

  after(async () => {
    await backend.close();
    await stop(upstream);
  });

  test('a session is created with PUT and a base URL, and only then exists', async () => {
    assert.equal((await json(sessionUrl('sess5'))).status, 404);

    const created = await json<SessionInfo>(sessionUrl('sess5'), 'PUT', { baseUrl: 'https://api.example.com/v1/' });
    assert.equal(created.status, 201);
    assert.equal(created.body?.baseUrl, 'https://api.example.com/v1'); // normalized
    assert.equal(created.body?.proxyUrl, `${backend.proxyUrl}/sess5`);
    assert.equal(created.body?.paused, false);

    const fetched = await json<SessionInfo>(sessionUrl('sess5'));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body?.baseUrl, 'https://api.example.com/v1');

    const updated = await json<SessionInfo>(sessionUrl('sess5'), 'PUT', { baseUrl: 'http://localhost:3000' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body?.baseUrl, 'http://localhost:3000');
    assert.equal(updated.body?.createdAt, created.body?.createdAt);
  });

  test('rejects invalid base URLs with a reason', async () => {
    const cases: [unknown, RegExp][] = [
      [{}, /Enter the base URL/],
      [{ baseUrl: 42 }, /Enter the base URL/],
      [{ baseUrl: 'not a url' }, /include the scheme/],
      [{ baseUrl: 'ftp://x' }, /Only http and https/],
      [{ baseUrl: 'https://x/?a=1' }, /query string/],
    ];
    for (const [payload, error] of cases) {
      const res = await json<{ error: string }>(sessionUrl('badurl'), 'PUT', payload);
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.match(res.body?.error ?? '', error);
    }
    assert.equal((await json(sessionUrl('badurl'))).status, 404);
  });

  test('routes under an unknown session answer 404', async () => {
    for (const [method, path] of [
      ['GET', '/requests'],
      ['DELETE', '/requests'],
      ['POST', '/pause'],
      ['POST', '/resume'],
      ['POST', '/requests/x/step'],
      ['GET', '/events'],
    ] as const) {
      assert.equal((await raw(`${sessionUrl('ghost')}${path}`, { method })).status, 404, `${method} ${path}`);
    }
  });

  test('lists and clears the history', async () => {
    await createSession(backend, 'sess6', upstreamUrl);
    await proxied(backend, 'sess6', '/one');
    await settledRecord(backend, 'sess6');
    assert.equal((await listRecords(backend, 'sess6')).length, 1);

    assert.equal((await raw(`${sessionUrl('sess6')}/requests`, { method: 'DELETE' })).status, 204);
    assert.deepEqual(await listRecords(backend, 'sess6'), []);
  });

  test('validates uids and answers 404 for unknown routes', async () => {
    assert.equal((await raw(sessionUrl('bad.uid'))).status, 400);
    assert.equal((await raw(sessionUrl('bad.uid'), { method: 'PUT' })).status, 400);
    assert.equal((await raw(`${backend.apiUrl}/nope`)).status, 404);
    assert.equal((await raw(`${backend.apiUrl}/api/health`)).status, 200);
  });

  test('events stream pushes pending and settled records, and base URL changes', async () => {
    await createSession(backend, 'sess7', upstreamUrl);
    const controller = new AbortController();
    const res = await fetch(`${sessionUrl('sess7')}/events`, { signal: controller.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await proxied(backend, 'sess7', '/live');
    await createSession(backend, 'sess7', `${upstreamUrl}/v2`);

    let text = '';
    while (!/"response":\{/.test(text) || !/\/v2"/.test(text)) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    controller.abort();

    const events = text.split('\n\n');
    const requests = events.filter((block) => block.startsWith('event: request'));
    assert.ok(requests.length >= 2, 'pending and settled events');
    assert.match(requests[0] ?? '', /"response":null/);
    assert.match(requests.at(-1) ?? '', /"status":201/);
    assert.ok(events.some((block) => block.startsWith('event: session') && block.includes(`"baseUrl":"${upstreamUrl}/v2"`)));
  });
});
