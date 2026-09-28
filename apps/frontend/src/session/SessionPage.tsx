import { RequestList } from '../requests/RequestList.tsx';
import { CopyButton } from '../ui/CopyButton.tsx';
import { ContinueIcon, PauseIcon } from '../ui/icons.tsx';
import { isDefaultPauseFilter } from '@proxy-moxy/shared';
import { CreateSession } from './CreateSession.tsx';
import { PauseFilterPanel } from './PauseFilterPanel.tsx';
import { ProxyUrlPanel } from './ProxyUrlPanel.tsx';
import { useSession, type LiveStatus } from './useSession.ts';

interface Props {
  uid: string;
  onNewSession(): void;
}

const STATUS_LABEL: Record<LiveStatus, string> = { connecting: 'connecting', live: 'live', offline: 'reconnecting' };

export function SessionPage({ uid, onNewSession }: Props) {
  const {
    phase,
    session,
    records,
    status,
    error,
    configure,
    clear,
    pause,
    resume,
    setPauseFilter,
    stepInto,
    continueRequest,
    edit,
  } = useSession(uid);
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
        {session && paused && (
          <span className="badge paused">
            paused · {heldCount} held{isDefaultPauseFilter(session.pauseFilter) ? '' : ' · filtered'}
          </span>
        )}
        {session && (
          <button
            className={paused ? 'icon-button primary' : 'icon-button'}
            onClick={paused ? resume : pause}
            title={paused ? 'Resume: release every held request and stop pausing' : 'Pause: stop new requests at breakpoints'}
          >
            {paused ? <ContinueIcon /> : <PauseIcon />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        {session && <span className={`status-dot ${status}`}>{STATUS_LABEL[status]}</span>}
        <button onClick={onNewSession}>New session</button>
      </header>

      {error && <div className="error">{error}</div>}
      {phase === 'loading' && <p className="hint">Loading session…</p>}
      {phase === 'missing' && <CreateSession uid={uid} onCreate={configure} />}
      {phase === 'ready' && session && (
        <>
          <ProxyUrlPanel proxyUrl={session.proxyUrl} baseUrl={session.baseUrl} onChangeBaseUrl={configure} />
          <PauseFilterPanel filter={session.pauseFilter} onSave={setPauseFilter} />
          <RequestList records={records} onClear={clear} onContinue={continueRequest} onStepInto={stepInto} onEdit={edit} />
        </>
      )}
    </div>
  );
}
