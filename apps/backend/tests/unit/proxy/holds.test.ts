import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HoldRegistry } from '../../../src/proxy/holds.ts';

test('release resolves the hold with the edits made meanwhile, stepping by default', async () => {
  const holds = new HoldRegistry();
  const parked = holds.hold('s', 'r1', 'request');
  assert.deepEqual(holds.get('r1'), { uid: 's', recordId: 'r1', stage: 'request', edits: {} });

  assert.equal(holds.edit('r1', { body: 'edited' }), true);
  assert.equal(holds.release('r1'), true);
  assert.deepEqual(await parked, { edits: { body: 'edited' }, mode: 'step' });

  assert.equal(holds.get('r1'), null);
  assert.equal(holds.release('r1'), false);
  assert.equal(holds.edit('r1', { body: 'late' }), false);
});

test('release can continue instead of stepping', async () => {
  const holds = new HoldRegistry();
  const parked = holds.hold('s', 'r', 'request');
  holds.release('r', 'continue');
  assert.deepEqual(await parked, { edits: {}, mode: 'continue' });
});

test('releaseAll continues every hold of the given session only', async () => {
  const holds = new HoldRegistry();
  const a = holds.hold('s1', 'a', 'request');
  const b = holds.hold('s1', 'b', 'response');
  const other = holds.hold('s2', 'c', 'request');

  assert.equal(holds.releaseAll('s1'), 2);
  assert.deepEqual(await Promise.all([a, b]), [
    { edits: {}, mode: 'continue' },
    { edits: {}, mode: 'continue' },
  ]);
  assert.ok(holds.get('c'));
  assert.equal(holds.releaseAll('s1'), 0);

  holds.release('c');
  await other;
});

test('cancel rejects the hold', async () => {
  const holds = new HoldRegistry();
  const parked = holds.hold('s', 'r', 'response');
  assert.equal(holds.cancel('r', new Error('client gone')), true);
  await assert.rejects(parked, /client gone/);
  assert.equal(holds.cancel('r', new Error('again')), false);
});
