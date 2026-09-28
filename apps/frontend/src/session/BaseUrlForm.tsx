import { parseBaseUrl } from '@proxy-moxy/shared';
import { useState, type FormEvent } from 'react';

interface Props {
  initial?: string;
  submitLabel: string;
  onSubmit(baseUrl: string): Promise<void>;
  onCancel?(): void;
}

/** Base URL input with the same validation the backend applies. */
export function BaseUrlForm({ initial = '', submitLabel, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseBaseUrl(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.baseUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="base-url-form" onSubmit={(event) => void submit(event)}>
      <input
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        placeholder="https://api.example.com/v1"
        spellCheck={false}
        inputMode="url"
        aria-label="Base URL"
      />
      <button className="primary" type="submit" disabled={busy}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      )}
      {error && <span className="error form-error">{error}</span>}
    </form>
  );
}
