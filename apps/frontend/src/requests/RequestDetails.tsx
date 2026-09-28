import type { BreakpointStage, RequestRecord } from '@proxy-moxy/shared';
import { heldStage } from '../session/records.ts';
import { BodyEditor } from './BodyEditor.tsx';
import { BodyView } from './BodyView.tsx';
import { HeadersTable } from './HeadersTable.tsx';

interface Props {
  record: RequestRecord;
  onContinue(): Promise<void>;
  onStepInto(): Promise<void>;
  onEdit(stage: BreakpointStage, body: string): Promise<void>;
}

export function RequestDetails({ record, onContinue, onStepInto, onEdit }: Props) {
  const { request, response, error } = record;
  const heldAt = heldStage(record);
  const editor = (stage: BreakpointStage, body: RequestRecord['request']['body']) => (
    <BodyEditor
      key={`${record.id}-${stage}`}
      stage={stage}
      body={body}
      onApply={(text) => onEdit(stage, text)}
      onContinue={onContinue}
      onStepInto={onStepInto}
    />
  );

  return (
    <div className="details">
      <div className="pane">
        <h3>Request</h3>
        <div className="kv">
          <span>URL</span>
          <code className="wrap">{request.url}</code>
        </div>
        <HeadersTable headers={request.headers} />
        {heldAt === 'request' ? editor('request', request.body) : <BodyView body={request.body} />}
      </div>
      <div className="pane">
        <h3>Response</h3>
        {error ? (
          <p className="error">{error}</p>
        ) : response ? (
          <>
            <div className="kv">
              <span>Status</span>
              <code>
                {response.status} {response.statusText}
              </code>
            </div>
            <HeadersTable headers={response.headers} />
            {heldAt === 'response' ? editor('response', response.body) : <BodyView body={response.body} />}
          </>
        ) : (
          <p className="hint">{heldAt === 'request' ? 'Not sent to the upstream yet.' : 'Waiting for the upstream…'}</p>
        )}
      </div>
    </div>
  );
}
