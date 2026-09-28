import { useState } from 'react';
import { CopyButton } from '../ui/CopyButton.tsx';

interface Props {
  proxyUrl: string | null;
}

/** Shows the session's proxy endpoint and builds a ready-to-use URL for a target. */
export function ProxyUrlPanel({ proxyUrl }: Props) {
  const [target, setTarget] = useState('https://httpbin.org/get');
  const built = proxyUrl ? `${proxyUrl}?url=${encodeURIComponent(target)}` : '';
  const curl = built ? `curl "${built}"` : '';

  return (
    <section className="panel">
      <h2>Proxy endpoint</h2>
      <p className="hint">
        Send requests to <code>{proxyUrl ?? '…'}?url=&lt;target-url&gt;</code>. The target is percent-encoded; any other
        query parameters are appended to it. Requests and responses pass through unchanged.
      </p>
      <label className="field">
        <span>Target URL</span>
        <input value={target} onChange={(event) => setTarget(event.target.value)} spellCheck={false} />
      </label>
      <div className="built">
        <code>{built || '…'}</code>
        <CopyButton text={built} />
      </div>
      <div className="built">
        <code>{curl || '…'}</code>
        <CopyButton text={curl} label="Copy curl" />
      </div>
    </section>
  );
}
