import { BaseUrlForm } from './BaseUrlForm.tsx';

interface Props {
  uid: string;
  onCreate(baseUrl: string): Promise<void>;
}

/** First visit to a session uid: ask which server its requests should go to. */
export function CreateSession({ uid, onCreate }: Props) {
  return (
    <section className="panel">
      <h2>
        Create session <code>{uid}</code>
      </h2>
      <p className="hint">
        Which server should this session proxy to? Requests to the session's proxy URL are forwarded to this base URL,
        with the rest of the path and the query string appended.
      </p>
      <BaseUrlForm submitLabel="Create session" onSubmit={onCreate} />
    </section>
  );
}
