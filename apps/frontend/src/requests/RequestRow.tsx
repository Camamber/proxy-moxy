import type { BreakpointStage, RequestRecord } from '@proxy-moxy/shared';
import { formatBytes, formatTime, shortUrl } from '../lib/format.ts';
import { heldStage } from '../session/records.ts';
import { DebugControls } from './DebugControls.tsx';
import { RequestDetails } from './RequestDetails.tsx';

interface Props {
  record: RequestRecord;
  open: boolean;
  onToggle(): void;
  onContinue(): Promise<void>;
  onStepInto(): Promise<void>;
  onEdit(stage: BreakpointStage, body: string): Promise<void>;
}

export function RequestRow({ record, open, onToggle, onContinue, onStepInto, onEdit }: Props) {
  const { request, response } = record;
  const heldAt = heldStage(record);
  return (
    <div className={open ? 'row open' : 'row'}>
      <div className="row-line">
        <button className="row-main" onClick={onToggle} aria-expanded={open}>
          <span className="time">{formatTime(record.startedAt)}</span>
          <span className={`method m-${request.method.toLowerCase()}`}>{request.method}</span>
          <StatusCell record={record} />
          <span className="url" title={request.url}>
            {shortUrl(request.url)}
          </span>
          <span className="meta">{record.durationMs === null ? '…' : `${record.durationMs} ms`}</span>
          <span className="meta">{response ? formatBytes(response.body.size) : ''}</span>
        </button>
        {/* When open, the editor below has the same controls and applies pending edits first. */}
        {heldAt && !open && <DebugControls stage={heldAt} onContinue={onContinue} onStepInto={onStepInto} />}
      </div>
      {open && <RequestDetails record={record} onContinue={onContinue} onStepInto={onStepInto} onEdit={onEdit} />}
    </div>
  );
}

function StatusCell({ record }: { record: RequestRecord }) {
  if (record.error) {
    return (
      <span className="status s-err" title={record.error}>
        ERR
      </span>
    );
  }
  const heldAt = heldStage(record);
  if (heldAt) {
    return (
      <span className="status s-held" title={`Parked before the ${heldAt === 'request' ? 'upstream call' : 'delivery'}`}>
        ⏸ {heldAt === 'request' ? 'req' : 'res'}
      </span>
    );
  }
  if (record.stage !== 'done' || !record.response) return <span className="status s-pending">…</span>;
  const { status } = record.response;
  return <span className={`status s-${Math.floor(status / 100)}xx`}>{status}</span>;
}
