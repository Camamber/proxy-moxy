import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinTarget, splitProxyPath } from '../../../src/proxy/target.ts';

test('splits the session uid from the forwarded path', () => {
  assert.deepEqual(splitProxyPath('/abc-123/users/1'), { uid: 'abc-123', rest: '/users/1' });
  assert.deepEqual(splitProxyPath('/abc'), { uid: 'abc', rest: '' });
  assert.deepEqual(splitProxyPath('/abc/'), { uid: 'abc', rest: '/' });
  assert.deepEqual(splitProxyPath('/abc/a%20b/%2F'), { uid: 'abc', rest: '/a%20b/%2F' }); // encoding untouched
});

test('rejects paths without a valid uid', () => {
  for (const path of ['/', '', '/bad.uid/x', '//x']) assert.equal(splitProxyPath(path), null, path);
});

test('joins base URL, path and query', () => {
  assert.equal(joinTarget('https://api.example.com', '/users/1', '?x=1').href, 'https://api.example.com/users/1?x=1');
  assert.equal(joinTarget('https://api.example.com/v1', '/users', '').href, 'https://api.example.com/v1/users');
  assert.equal(joinTarget('https://api.example.com/v1', '', '?q=a').href, 'https://api.example.com/v1?q=a');
  assert.equal(joinTarget('https://api.example.com/v1', '/', '').href, 'https://api.example.com/v1/');
  assert.equal(joinTarget('http://localhost:3000', '/a%20b', '').href, 'http://localhost:3000/a%20b');
});
