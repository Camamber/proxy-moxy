import {
  DEFAULT_PAUSE_FILTER,
  parsePauseFilter,
  splitPatterns,
  type BreakpointStage,
  type PauseFilter,
} from '@proxy-moxy/shared';
import { useState, type FormEvent } from 'react';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const STAGES: { stage: BreakpointStage; label: string }[] = [
  { stage: 'request', label: 'request, before the upstream call' },
  { stage: 'response', label: 'response, before delivery' },
];

interface Props {
  filter: PauseFilter;
  onSave(filter: PauseFilter): Promise<void>;
}

/** Which requests stop while the session is paused. */
export function PauseFilterPanel({ filter, onSave }: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pause filter</h2>
        {!editing && <button onClick={() => setEditing(true)}>Edit</button>}
      </div>
      {editing ? (
        <PauseFilterForm
          initial={filter}
          onSave={async (next) => {
            await onSave(next);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="filter-summary">{describe(filter)}</p>
      )}
      <p className="hint">While the session is paused only matching requests stop; the rest pass straight through.</p>
    </section>
  );
}

interface FormProps {
  initial: PauseFilter;
  onSave(filter: PauseFilter): Promise<void>;
  onCancel(): void;
}

function PauseFilterForm({ initial, onSave, onCancel }: FormProps) {
  const [methods, setMethods] = useState(initial.methods);
  const [paths, setPaths] = useState(initial.paths.join(', '));
  const [stages, setStages] = useState(initial.stages);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Any change makes a shown validation error stale. */
  const changed = <T,>(apply: (value: T) => void) => (value: T) => {
    apply(value);
    setError(null);
  };
  const changeMethods = changed(setMethods);
  const changePaths = changed(setPaths);
  const changeStages = changed(setStages);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parsePauseFilter({ methods, paths: splitPatterns(paths), stages });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(parsed.filter);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setMethods(DEFAULT_PAUSE_FILTER.methods);
    setPaths('');
    setStages(DEFAULT_PAUSE_FILTER.stages);
    setError(null);
  };

  return (
    <form className="filter-form" onSubmit={(event) => void submit(event)}>
      <div className="filter-row">
        <span className="label">Stop at</span>
        <span className="filter-options">
          {STAGES.map(({ stage, label }) => (
            <label key={stage} className="check">
              <input type="checkbox" checked={stages.includes(stage)} onChange={() => changeStages(toggle(stages, stage))} />
              {label}
            </label>
          ))}
        </span>
      </div>
      <div className="filter-row">
        <span className="label">Methods</span>
        <span className="filter-options">
          {METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={methods.includes(method) ? 'chip on' : 'chip'}
              aria-pressed={methods.includes(method)}
              onClick={() => changeMethods(toggle(methods, method))}
            >
              {method}
            </button>
          ))}
          <span className="hint">none selected: any method</span>
        </span>
      </div>
      <label className="filter-row">
        <span className="label">Paths</span>
        <input value={paths} onChange={(event) => changePaths(event.target.value)} placeholder="/users/*, /orders" spellCheck={false} />
      </label>
      <p className="hint">
        Comma-separated. <code>*</code> matches anything, slashes included. Matched against the path after the session
        uid, without the query string. Empty matches every path.
      </p>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={busy}>
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" onClick={reset} disabled={busy}>
          Reset to all
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}

function describe(filter: PauseFilter): string {
  const stops = filter.stages.length === 2 ? 'request and response' : filter.stages[0];
  const methods = filter.methods.length ? filter.methods.join(', ') : 'any method';
  const paths = filter.paths.length ? filter.paths.join(', ') : 'any path';
  return `Stops at the ${stops} · ${methods} · ${paths}`;
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((existing) => existing !== item) : [...list, item];
}
