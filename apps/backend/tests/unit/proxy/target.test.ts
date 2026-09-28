import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTarget } from '../../../src/proxy/target.ts';

const params = (query: string) => new URLSearchParams(query);

test('resolves the encoded target for a valid session uid', () => {
  const resolved = resolveTarget('abc-123', params('url=https%3A%2F%2Fapi.example.com%2Fusers%3Fpage%3D2'));
  assert.ok('target' in resolved);
  assert.equal(resolved.uid, 'abc-123');
  assert.equal(resolved.target.href, 'https://api.example.com/users?page=2');
});

test('extra query params are appended to the target', () => {
  const resolved = resolveTarget('s', params('url=https%3A%2F%2Fapi.example.com%2Fx%3Fa%3D1&b=2&url=ignored'));
  assert.ok('target' in resolved);
  assert.equal(resolved.target.href, 'https://api.example.com/x?a=1&b=2');
});

test('rejects bad uids and targets with the right status', () => {
  const cases: [string, string, number][] = [
    ['bad.uid', 'url=http://x', 404],
    ['', 'url=http://x', 404],
    ['s', '', 400],
    ['s', 'url=not-a-url', 400],
    ['s', 'url=ftp%3A%2F%2Fx', 400],
  ];
  for (const [uid, query, status] of cases) {
    const resolved = resolveTarget(uid, params(query));
    assert.ok('error' in resolved, `${uid}?${query}`);
    assert.equal(resolved.status, status, `${uid}?${query}`);
  }
});
