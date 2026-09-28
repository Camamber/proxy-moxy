import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RequestRecord, SessionEvent } from '@proxy-moxy/shared';
import { SessionStore } from '../../../src/sessions/store.ts';

const BASE = { baseUrl: 'https://api.example.com' };

function record(id: string, sessionUid = 's1'): RequestRecord {
  return {
    id,
    sessionUid,
    startedAt: new Date().toISOString(),
    durationMs: null,
    stage: 'upstream',
    held: false,
    request: { method: 'GET', url: 'http://x/', headers: {}, body: { text: null, size: 0, truncated: false, omitted: null } },
    response: null,
    error: null,
  };
}

test('sessions exist only once saved; saving again updates the base URL and keeps the rest', () => {
  const store = new SessionStore({ historyLimit: 10 });
  assert.equal(store.get('a'), null);

  const first = store.save('a', BASE);
  assert.equal(first.created, true);
  assert.equal(first.session.baseUrl, 'https://api.example.com');
  assert.equal(first.session.paused, false);

  store.setPaused('a', true);
  store.upsertRequest(record('1', 'a'));
  const second = store.save('a', { baseUrl: 'https://other.example.com/v2' });
  assert.equal(second.created, false);
  assert.equal(second.session.createdAt, first.session.createdAt);
  assert.equal(second.session.baseUrl, 'https://other.example.com/v2');
  assert.equal(second.session.paused, true);
  assert.equal(second.session.requestCount, 1);
});

test('operations on unknown sessions are no-ops', () => {
  const store = new SessionStore({ historyLimit: 10 });
  assert.equal(store.setPaused('ghost', true), null);
  store.upsertRequest(record('1', 'ghost'));
  store.clearRequests('ghost');
  assert.equal(store.get('ghost'), null);
  assert.deepEqual(store.listRequests('ghost'), []);
});

test('upsert replaces by id, trims the oldest records and supports lookup', () => {
  const store = new SessionStore({ historyLimit: 2 });
  store.save('s1', BASE);
  store.upsertRequest(record('1'));
  store.upsertRequest(record('2'));
  store.upsertRequest({ ...record('2'), durationMs: 5 });
  assert.deepEqual(store.listRequests('s1').map((r) => [r.id, r.durationMs]), [['1', null], ['2', 5]]);
  assert.equal(store.getRequest('s1', '2')?.durationMs, 5);

  store.upsertRequest(record('3'));
  assert.deepEqual(store.listRequests('s1').map((r) => r.id), ['2', '3']);
  assert.equal(store.getRequest('s1', '1'), null);
  assert.equal(store.get('s1')?.requestCount, 2);
});

test('subscribers see session, request and cleared events until they unsubscribe', () => {
  const store = new SessionStore({ historyLimit: 10 });
  const seen: string[] = [];
  const unsubscribe = store.subscribe('s1', (event: SessionEvent) =>
    seen.push(event.type === 'request' ? `request:${event.record.id}` : event.type === 'session' ? `session:${event.session.paused}` : event.type),
  );

  store.save('s1', BASE);
  store.setPaused('s1', true);
  store.upsertRequest(record('1'));
  store.save('s2', BASE);
  store.upsertRequest(record('other', 's2'));
  store.clearRequests('s1');
  unsubscribe();
  store.upsertRequest(record('2'));

  assert.deepEqual(seen, ['session:false', 'session:true', 'request:1', 'cleared']);
  assert.deepEqual(store.listRequests('s1').map((r) => r.id), ['2']);
});
