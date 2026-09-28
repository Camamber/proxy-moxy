import {
  brotliDecompressSync,
  gunzipSync,
  inflateRawSync,
  inflateSync,
  zstdDecompressSync,
} from 'node:zlib';
import type { CapturedBody, HeaderRecord } from '@proxy-moxy/shared';
/** Anything that can hand over the bytes it saw: a live `BodyCapture` or a fully buffered body. */
export interface BodySource {
  size: number;
  truncated: boolean;
  bytes(): Buffer;
}

/** A body that was buffered whole, e.g. while parked at a breakpoint. */
export function bufferSource(bytes: Buffer, limit: number): BodySource {
  return { size: bytes.byteLength, truncated: bytes.byteLength > limit, bytes: () => bytes.subarray(0, limit) };
}

/** The history entry for text the user typed into a held body. */
export function editedBody(text: string): CapturedBody {
  return { text, size: Buffer.byteLength(text, 'utf8'), truncated: false, omitted: null };
}

export const EMPTY_BODY: CapturedBody = { text: null, size: 0, truncated: false, omitted: null };

/** Builds the history entry for a body: decoded and stringified when that is meaningful. */
export function toCapturedBody(capture: BodySource, headers: HeaderRecord): CapturedBody {
  const size = capture.size;
  if (size === 0) return EMPTY_BODY;

  let bytes = capture.bytes();
  const encoding = header(headers, 'content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    // A cut compressed stream cannot be decoded; keep the size only.
    if (capture.truncated) return { text: null, size, truncated: true, omitted: 'undecodable' };
    try {
      bytes = decodeBody(bytes, encoding);
    } catch {
      return { text: null, size, truncated: false, omitted: 'undecodable' };
    }
  }

  if (!looksTextual(header(headers, 'content-type'), bytes)) {
    return { text: null, size, truncated: capture.truncated, omitted: 'binary' };
  }
  return { text: bytes.toString('utf8'), size, truncated: capture.truncated, omitted: null };
}

/**
 * Reverses a `Content-Encoding` chain. Encodings are applied in the listed order,
 * so they are undone in reverse.
 */
export function decodeBody(body: Buffer, contentEncoding: string): Buffer {
  const encodings = contentEncoding
    .split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter(Boolean);
  let out = body;
  for (const encoding of encodings.reverse()) out = decodeOnce(out, encoding);
  return out;
}

function decodeOnce(body: Buffer, encoding: string): Buffer {
  switch (encoding) {
    case 'identity':
      return body;
    case 'gzip':
    case 'x-gzip':
      return gunzipSync(body);
    case 'deflate':
      return inflateLenient(body);
    case 'br':
      return brotliDecompressSync(body);
    case 'zstd':
      return zstdDecompressSync(body);
    default:
      throw new Error(`Unsupported content-encoding: ${encoding}`);
  }
}

/** Some servers send raw DEFLATE under the `deflate` name; try the zlib-wrapped form first. */
function inflateLenient(body: Buffer): Buffer {
  try {
    return inflateSync(body);
  } catch {
    return inflateRawSync(body);
  }
}

const TEXT_MIME = /^(text\/|application\/(json|xml|javascript|ecmascript|x-www-form-urlencoded|graphql|x-ndjson)|multipart\/form-data)/i;
const TEXT_SUFFIX = /\+(json|xml)$/i;

function looksTextual(contentType: string | undefined, bytes: Buffer): boolean {
  if (contentType) {
    const mime = (contentType.split(';')[0] ?? '').trim();
    return TEXT_MIME.test(mime) || TEXT_SUFFIX.test(mime);
  }
  // No content-type: treat as text unless the first KB contains a NUL byte.
  return !bytes.subarray(0, 1024).includes(0);
}

function header(headers: HeaderRecord, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
