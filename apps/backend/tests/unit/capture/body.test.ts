import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { toCapturedBody } from '../../../src/capture/body.ts';
import { BodyCapture } from '../../../src/capture/stream.ts';

function source(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function capture(chunks: (string | Uint8Array)[], limit: number): Promise<{ capture: BodyCapture; passed: Buffer }> {
  const capture = new BodyCapture(limit);
  const out: Uint8Array[] = [];
  await source(chunks)
    .pipeThrough(capture.stream)
    .pipeTo(new WritableStream({ write: (chunk) => void out.push(chunk) }));
  return { capture, passed: Buffer.concat(out) };
}

test('BodyCapture passes everything through but keeps only the first bytes', async () => {
  const { capture: cap, passed } = await capture(['hello ', 'world', '!'], 8);
  assert.equal(passed.toString(), 'hello world!');
  assert.equal(cap.size, 12);
  assert.equal(cap.truncated, true);
  assert.equal(cap.bytes().toString(), 'hello wo');
  assert.deepEqual(await cap.done, { complete: true });
});

test('done reports cancellation when the reader goes away', async () => {
  const cap = new BodyCapture(10);
  const endless = new ReadableStream<Uint8Array>({ pull: (controller) => controller.enqueue(new Uint8Array([1])) });
  const reader = endless.pipeThrough(cap.stream).getReader();
  await reader.read();
  await reader.cancel('client gone');
  assert.deepEqual(await cap.done, { complete: false, reason: 'client gone' });
});

test('text bodies are stored as text, with a truncation flag', async () => {
  const full = await capture(['{"a":1}'], 100);
  assert.deepEqual(toCapturedBody(full.capture, { 'content-type': 'application/json' }), {
    text: '{"a":1}',
    size: 7,
    truncated: false,
    omitted: null,
  });

  const cut = await capture(['abcdef'], 3);
  assert.deepEqual(toCapturedBody(cut.capture, { 'content-type': 'text/plain' }), {
    text: 'abc',
    size: 6,
    truncated: true,
    omitted: null,
  });
});

test('compressed bodies are decoded for the record when complete', async () => {
  const gz = gzipSync('{"zipped":true}');
  const full = await capture([gz], 1000);
  assert.equal(toCapturedBody(full.capture, { 'content-type': 'application/json', 'content-encoding': 'gzip' }).text, '{"zipped":true}');

  const cut = await capture([gz], 4);
  assert.equal(toCapturedBody(cut.capture, { 'content-encoding': 'gzip' }).omitted, 'undecodable');
});

test('binary bodies keep only their size', async () => {
  const png = await capture([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])], 100);
  assert.equal(toCapturedBody(png.capture, { 'content-type': 'image/png' }).omitted, 'binary');
  assert.equal(toCapturedBody(png.capture, {}).omitted, 'binary'); // sniffed: NUL bytes

  const plain = await capture(['no content type'], 100);
  assert.equal(toCapturedBody(plain.capture, {}).text, 'no content type');
  assert.equal(toCapturedBody(new BodyCapture(10), {}).size, 0);
});
