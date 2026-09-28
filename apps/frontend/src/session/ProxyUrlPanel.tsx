import { useState } from 'react';
import { CopyButton } from '../ui/CopyButton.tsx';
import { BaseUrlForm } from './BaseUrlForm.tsx';

interface Props {
  proxyUrl: string;
  baseUrl: string;
  onChangeBaseUrl(baseUrl: string): Promise<void>;
}

/** The session's proxy URL, the base URL it forwards to, and a builder for a concrete request. */
export function ProxyUrlPanel({ proxyUrl, baseUrl, onChangeBaseUrl }: Props) {
  const [editing, setEditing] = useState(false);
  const [path, setPath] = useState('/');
  const suffix = toSuffix(path);
  const built = proxyUrl + suffix;
  const curl = `curl "${built}"`;

  return (
    <section className="panel">
      <h2>Proxy endpoint</h2>
      <div className="mapping">
        <span className="label">Proxy URL</span>
        <span className="value">
          <code>{proxyUrl}</code>
          <CopyButton text={proxyUrl} />
        </span>
        <span className="label">Base URL</span>
        {editing ? (
          <BaseUrlForm
            initial={baseUrl}
            submitLabel="Save"
            onSubmit={async (next) => {
              await onChangeBaseUrl(next);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <span className="value">
            <code>{baseUrl}</code>
            <button onClick={() => setEditing(true)}>Change</button>
          </span>
        )}
      </div>
      <p className="hint">
        The path and query string after the proxy URL are appended to the base URL. Requests and responses pass
        through unchanged unless the session is paused.
      </p>
      <label className="field">
        <span>Try a path</span>
        <input value={path} onChange={(event) => setPath(event.target.value)} spellCheck={false} placeholder="/users/1?expand=true" />
      </label>
      <div className="built">
        <code>{built}</code>
        <CopyButton text={built} />
      </div>
      <p className="hint forwards">
        forwards to <code>{baseUrl + suffix}</code>
      </p>
      <div className="built">
        <code>{curl}</code>
        <CopyButton text={curl} label="Copy curl" />
      </div>
    </section>
  );
}

/** `users` → `/users`; paths and bare query strings are kept as typed. */
function toSuffix(path: string): string {
  const value = path.trim();
  if (!value) return '';
  return value.startsWith('/') || value.startsWith('?') ? value : `/${value}`;
}
