import type { CapturedBody } from '@proxy-moxy/shared';
import { formatBytes, prettyBody } from '../lib/format.ts';

export function BodyView({ body }: { body: CapturedBody }) {
  if (body.size === 0) return <p className="hint">Empty body</p>;
  if (body.text === null) {
    const reason = body.omitted === 'binary' ? 'Binary body' : 'Body could not be decoded';
    return (
      <p className="hint">
        {reason} · {formatBytes(body.size)}
      </p>
    );
  }
  return (
    <div className="body">
      <pre>{prettyBody(body.text)}</pre>
      {body.truncated && <p className="hint">Truncated: showing the beginning of {formatBytes(body.size)}</p>}
    </div>
  );
}
