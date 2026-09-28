import { matchesUrlFilter, splitPatterns, type BreakpointStage, type RequestRecord } from '@proxy-moxy/shared';
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
  const [query, setQuery] = useState('');
  const patterns = useMemo(() => splitPatterns(query), [query]);
  const visible = useMemo(
    () => records.filter((record) => matchesUrlFilter(record.request.url, patterns)).reverse(),
    [records, patterns],
  );
  const filtering = patterns.length > 0;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          Requests<span className="count">{filtering ? `${visible.length} of ${records.length}` : records.length}</span>
        </h2>
        <div className="list-tools">
          <input
            className="url-filter"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by URL: users, */orders/*"
            aria-label="Filter requests by URL"
            title="Wildcard search over the full URL: * matches anything, several patterns separated by commas, case-insensitive"
            spellCheck={false}
          />
          <button onClick={onClear} disabled={records.length === 0} title="Delete every recorded request in this session">
            Clear history
          </button>
        </div>
      </div>
      {records.length === 0 ? (
        <p className="empty">No requests yet. Send one through the proxy endpoint above.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No requests match {patterns.join(', ')}.</p>
      ) : (
        <div className="list">
          {visible.map((record) => (
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
