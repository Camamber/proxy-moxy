import type { BreakpointStage, RequestRecord } from '@proxy-moxy/shared';
import { useMemo, useState } from 'react';
import { RequestRow } from './RequestRow.tsx';

interface Props {
  records: RequestRecord[];
  onClear(): void;
  onContinue(id: string): Promise<void>;
  onStepInto(id: string): Promise<void>;
  onEdit(id: string, stage: BreakpointStage, body: string): Promise<void>;
}

export function RequestList({ records, onClear, onContinue, onStepInto, onEdit }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const newestFirst = useMemo(() => [...records].reverse(), [records]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Requests<span className="count">{records.length}</span>
        </h2>
        <button onClick={onClear} disabled={records.length === 0}>
          Clear
        </button>
      </div>
      {records.length === 0 ? (
        <p className="empty">No requests yet. Send one through the proxy endpoint above.</p>
      ) : (
        <div className="list">
          {newestFirst.map((record) => (
            <RequestRow
              key={record.id}
              record={record}
              open={openId === record.id}
              onToggle={() => setOpenId(openId === record.id ? null : record.id)}
              onContinue={() => onContinue(record.id)}
              onStepInto={() => onStepInto(record.id)}
              onEdit={(stage, body) => onEdit(record.id, stage, body)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
