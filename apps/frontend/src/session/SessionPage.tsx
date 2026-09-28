import { RequestList } from '../requests/RequestList.tsx';
import { CopyButton } from '../ui/CopyButton.tsx';
import { ContinueIcon, PauseIcon } from '../ui/icons.tsx';
import { ProxyUrlPanel } from './ProxyUrlPanel.tsx';
import { useSession, type LiveStatus } from './useSession.ts';

interface Props {
  uid: string;
  onNewSession(): void;
}

const STATUS_LABEL: Record<LiveStatus, string> = { connecting: 'connecting', live: 'live', offline: 'reconnecting' };

export function SessionPage({ uid, onNewSession }: Props) {
  const { session, records, status, error, clear, pause, resume, stepInto, continueRequest, edit } = useSession(uid);
  const heldCount = records.filter((record) => record.held).length;
  const paused = session?.paused ?? false;

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">proxy-moxy</span>
        <span className="session">
          <span className="label">session</span>
          <code>{uid}</code>
          <CopyButton text={window.location.href} label="Copy link" />
        </span>
        <span className="spacer" />
        {paused && (
          <span className="badge paused">
            paused · {heldCount} held
          </span>
        )}
        <button
          className={paused ? 'icon-button primary' : 'icon-button'}
          onClick={paused ? resume : pause}
          disabled={!session}
          title={paused ? 'Resume: release every held request and stop pausing' : 'Pause: stop new requests at breakpoints'}
        >
          {paused ? <ContinueIcon /> : <PauseIcon />}
          {paused ? 'Resume' : 'Pause'}
        </button>
        <span className={`status-dot ${status}`}>{STATUS_LABEL[status]}</span>
        <button onClick={onNewSession}>New session</button>
      </header>

      <ProxyUrlPanel proxyUrl={session?.proxyUrl ?? null} />
      {error && <div className="error">{error}</div>}
      <RequestList records={records} onClear={clear} onContinue={continueRequest} onStepInto={stepInto} onEdit={edit} />
    </div>
  );
}
