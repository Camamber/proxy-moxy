import type { BreakpointStage } from '@proxy-moxy/shared';
import { useState } from 'react';
import { ContinueIcon, StepIntoIcon } from '../ui/icons.tsx';

interface Props {
  stage: BreakpointStage;
  onContinue(): Promise<void>;
  onStepInto(): Promise<void>;
  /** Show text next to the icons. */
  labels?: boolean;
  disabled?: boolean;
}

const STEP_INTO_TITLE: Record<BreakpointStage, string> = {
  request: 'Step into: send to the upstream and stop again at the response',
  response: 'Step into: deliver the response to the client',
};

/** VS Code-style controls for a request parked at a breakpoint. */
export function DebugControls({ stage, onContinue, onStepInto, labels = false, disabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="debug-controls">
      <button
        className="debug continue"
        onClick={() => void run(onContinue)}
        disabled={disabled || busy}
        title="Continue: run to the end, skipping the remaining stops"
        aria-label="Continue"
      >
        <ContinueIcon />
        {labels && <span>Continue</span>}
      </button>
      <button
        className="debug step-into"
        onClick={() => void run(onStepInto)}
        disabled={disabled || busy}
        title={STEP_INTO_TITLE[stage]}
        aria-label="Step into"
      >
        <StepIntoIcon />
        {labels && <span>Step into</span>}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
