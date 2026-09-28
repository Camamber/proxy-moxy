import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { startBackend, type Backend } from '../../src/app.ts';
import { raw, testConfig } from './helpers.ts';

describe('static frontend', () => {
  let dir: string;
  let backend: Backend;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'moxy-static-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>moxy</title>');
    await writeFile(join(dir, 'assets', 'app.js'), 'console.log(1)');
    backend = await startBackend({ ...testConfig, staticDir: dir });
  });

  after(async () => {
    await backend.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('serves assets with immutable caching', async () => {
    const asset = await raw(`${backend.apiUrl}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.equal(asset.headers['content-type'], 'text/javascript; charset=utf-8');
    assert.match(asset.headers['cache-control'] ?? '', /immutable/);
    assert.equal((await raw(`${backend.apiUrl}/assets/missing.js`)).status, 404);
  });

  test('falls back to index.html for app routes and keeps /api first', async () => {
    const spa = await raw(`${backend.apiUrl}/some-session-uid`);
    assert.equal(spa.status, 200);
    assert.match(spa.body.toString(), /<title>moxy<\/title>/);
    assert.equal(spa.headers['cache-control'], 'no-cache');
    assert.equal((await raw(`${backend.apiUrl}/api/health`)).status, 200);
  });

  test('never resolves outside the root', async () => {
    assert.equal((await raw(`${backend.apiUrl}/..%2F..%2Fetc%2Fpasswd`)).status, 404);
  });
});
