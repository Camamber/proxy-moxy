import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RequestRecord, SessionEvent } from '@proxy-moxy/shared';
import { SessionStore } from '../../../src/sessions/store.ts';

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

test('getOrCreate is idempotent and get() does not create', () => {
  const store = new SessionStore({ historyLimit: 10 });
  assert.equal(store.get('a'), null);
  const first = store.getOrCreate('a');
  assert.equal(first.paused, false);
  assert.equal(store.getOrCreate('a').createdAt, first.createdAt);
  assert.equal(store.get('a')?.requestCount, 0);
});

test('upsert replaces by id, trims the oldest records and supports lookup', () => {
  const store = new SessionStore({ historyLimit: 2 });
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

test('pause state is per session and announced to subscribers', () => {
  const store = new SessionStore({ historyLimit: 10 });
  const seen: SessionEvent[] = [];
  store.subscribe('s1', (event) => seen.push(event));

  assert.equal(store.setPaused('s1', true).paused, true);
  assert.equal(store.get('s1')?.paused, true);
  assert.equal(store.getOrCreate('s2').paused, false);
  store.setPaused('s1', false);

  assert.deepEqual(seen.map((e) => (e.type === 'session' ? `session:${e.session.paused}` : e.type)), ['session:true', 'session:false']);
});

test('subscribers get request and cleared events until they unsubscribe', () => {
  const store = new SessionStore({ historyLimit: 10 });
  const seen: SessionEvent[] = [];
  const unsubscribe = store.subscribe('s1', (event) => seen.push(event));

  store.upsertRequest(record('1'));
  store.upsertRequest(record('other', 's2'));
  store.clearRequests('s1');
  unsubscribe();
  store.upsertRequest(record('2'));

  assert.deepEqual(seen.map((e) => (e.type === 'request' ? `request:${e.record.id}` : e.type)), ['request:1', 'cleared']);
  assert.deepEqual(store.listRequests('s1').map((r) => r.id), ['2']);
});
