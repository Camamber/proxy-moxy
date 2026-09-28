import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesUrlFilter, splitPatterns, wildcardToRegExp } from '@proxy-moxy/shared';

test('wildcards are anchored and case-sensitive by default; other characters are literal', () => {
  assert.equal(wildcardToRegExp('/users/*').test('/users/1/orders'), true);
  assert.equal(wildcardToRegExp('/users/*').test('/api/users/1'), false);
  assert.equal(wildcardToRegExp('/Users').test('/users'), false);
  assert.equal(wildcardToRegExp('/a.b?c').test('/a.b?c'), true);
  assert.equal(wildcardToRegExp('/a.b').test('/axb'), false);
  assert.equal(wildcardToRegExp('users', { anchored: false, ignoreCase: true }).test('/API/Users/1'), true);
});

test('splits pattern lists on commas and whitespace, dropping blanks and duplicates', () => {
  assert.deepEqual(splitPatterns(' /users/*, orders  orders,,'), ['/users/*', 'orders']);
  assert.deepEqual(splitPatterns('   '), []);
});

test('history search matches anywhere in the URL, case-insensitively', () => {
  const url = 'https://api.example.com/v1/Orders/42/items?page=2';
  assert.equal(matchesUrlFilter(url, []), true);
  assert.equal(matchesUrlFilter(url, ['orders']), true); // contains, any case
  assert.equal(matchesUrlFilter(url, ['*/orders/*/items']), true); // spans a segment
  assert.equal(matchesUrlFilter(url, ['api.example.com*page=2']), true);
  assert.equal(matchesUrlFilter(url, ['users', 'items']), true); // any pattern
  assert.equal(matchesUrlFilter(url, ['users']), false);
  assert.equal(matchesUrlFilter(url, ['orders/43']), false);
});
