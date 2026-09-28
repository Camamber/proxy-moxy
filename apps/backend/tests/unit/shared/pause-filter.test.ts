import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_PAUSE_FILTER,
  isDefaultPauseFilter,
  parsePauseFilter,
  shouldPause,
  type PauseFilter,
} from '@proxy-moxy/shared';

test('normalizes filters: defaults, trimming, upper-casing, de-duplication, stage order', () => {
  assert.deepEqual(parsePauseFilter({}), { ok: true, filter: DEFAULT_PAUSE_FILTER });
  assert.deepEqual(
    parsePauseFilter({ methods: [' post', 'POST', ''], paths: [' /a/* ', '', '/a/*'], stages: ['response', 'request'] }),
    { ok: true, filter: { methods: ['POST'], paths: ['/a/*'], stages: ['request', 'response'] } },
  );
});

test('rejects malformed filters with a reason', () => {
  const cases: [unknown, RegExp][] = [
    [null, /Send \{ methods, paths, stages \}/],
    [[], /Send \{ methods, paths, stages \}/],
    [{ paths: '/a' }, /paths must be an array/],
    [{ methods: ['GE T'] }, /Not an HTTP method: GE T/],
    [{ paths: ['users/*'] }, /start with \/ or \*/],
    [{ stages: [] }, /at least one stop/],
    [{ stages: ['upstream'] }, /Unknown stop: upstream/],
  ];
  for (const [input, error] of cases) {
    const result = parsePauseFilter(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    if (!result.ok) assert.match(result.error, error);
  }
});

test('matches methods, anchored path globs and stages', () => {
  const filter: PauseFilter = { methods: ['POST'], paths: ['/users/*', '/health'], stages: ['request'] };
  assert.equal(shouldPause(filter, 'request', 'post', '/users/1/orders'), true); // * spans slashes; method case-insensitive
  assert.equal(shouldPause(filter, 'request', 'POST', '/health'), true);
  assert.equal(shouldPause(filter, 'request', 'POST', '/healthz'), false); // anchored
  assert.equal(shouldPause(filter, 'request', 'GET', '/users/1'), false);
  assert.equal(shouldPause(filter, 'response', 'POST', '/users/1'), false);

  const literal: PauseFilter = { methods: [], paths: ['*.json', '/a.b'], stages: ['response'] };
  assert.equal(shouldPause(literal, 'response', 'GET', '/data/x.json'), true);
  assert.equal(shouldPause(literal, 'response', 'GET', '/axb'), false); // dots are literal
  assert.equal(shouldPause(DEFAULT_PAUSE_FILTER, 'response', 'DELETE', '/anything'), true);
});

test('recognizes the default filter', () => {
  assert.equal(isDefaultPauseFilter(DEFAULT_PAUSE_FILTER), true);
  assert.equal(isDefaultPauseFilter({ ...DEFAULT_PAUSE_FILTER, stages: ['request'] }), false);
  assert.equal(isDefaultPauseFilter({ ...DEFAULT_PAUSE_FILTER, methods: ['GET'] }), false);
});
