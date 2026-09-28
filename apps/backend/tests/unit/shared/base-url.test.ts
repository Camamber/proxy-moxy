import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseBaseUrl } from '@proxy-moxy/shared';

test('normalizes valid base URLs', () => {
  const cases: [string, string][] = [
    ['https://api.example.com', 'https://api.example.com'],
    ['https://api.example.com/', 'https://api.example.com'],
    ['  https://api.example.com/v1//  ', 'https://api.example.com/v1'],
    ['http://localhost:3000/api', 'http://localhost:3000/api'],
    ['https://API.Example.com:443/V1', 'https://api.example.com/V1'],
  ];
  for (const [input, expected] of cases) assert.deepEqual(parseBaseUrl(input), { ok: true, baseUrl: expected }, input);
});

test('rejects what cannot serve as a base URL', () => {
  const cases: [string, RegExp][] = [
    ['', /Enter the base URL/],
    ['api.example.com', /include the scheme/],
    ['ftp://example.com', /Only http and https/],
    ['https://user:pass@example.com', /credentials/],
    ['https://example.com/?a=1', /query string/],
    ['https://example.com/#top', /query string and fragment/],
  ];
  for (const [input, error] of cases) {
    const result = parseBaseUrl(input);
    assert.equal(result.ok, false, input);
    if (!result.ok) assert.match(result.error, error, input);
  }
});
