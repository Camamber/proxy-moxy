import type { BreakpointStage, CapturedBody } from '@proxy-moxy/shared';
import { useState } from 'react';
import { formatBytes, prettyBody } from '../lib/format.ts';
import { DebugControls } from './DebugControls.tsx';

interface Props {
  stage: BreakpointStage;
  body: CapturedBody;
  onApply(body: string): Promise<void>;
  onContinue(): Promise<void>;
  onStepInto(): Promise<void>;
}

/** Editable body of a request parked at a breakpoint. Continue and Step into apply pending edits first. */
export function BodyEditor({ stage, body, onApply, onContinue, onStepInto }: Props) {
  const initial = body.text ?? '';
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editable = body.text !== null && !body.truncated;
  const dirty = editable && text !== initial;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await onApply(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const withEdits = (action: () => Promise<void>) => async () => {
    if (dirty) await onApply(text);
    await action();
  };

  return (
    <div className="editor">
      <div className="editor-head">
        <span className="badge held">⏸ parked before {stage === 'request' ? 'the upstream call' : 'delivery'}</span>
        {!editable && (
          <span className="hint">
            {body.size === 0 ? 'Empty body' : body.text === null ? 'Binary or undecodable body' : 'Body exceeds the capture limit'} ·{' '}
            {formatBytes(body.size)} · not editable
          </span>
        )}
      </div>
      {editable && (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          rows={Math.min(24, Math.max(4, text.split('\n').length + 1))}
        />
      )}
      <div className="editor-actions">
        <DebugControls
          stage={stage}
          labels
          disabled={busy}
          onContinue={withEdits(onContinue)}
          onStepInto={withEdits(onStepInto)}
        />
        {editable && (
          <>
            <button onClick={() => setText(prettyBody(text))} disabled={busy || prettyBody(text) === text}>
              Format JSON
            </button>
            <button onClick={() => void apply()} disabled={busy || !dirty}>
              Apply
            </button>
          </>
        )}
        {dirty && <span className="hint">unsaved edits are applied before moving on</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </div>
  );
}
