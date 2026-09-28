import type { BreakpointStage, RequestRecord, SessionInfo } from '@proxy-moxy/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import { mergeRecords, upsertRecord } from './records.ts';

export type LiveStatus = 'connecting' | 'live' | 'offline';

export interface SessionActions {
  clear(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  /** Moves a parked request to its next stop. */
  stepInto(id: string): Promise<void>;
  /** Runs a parked request to the end, skipping its remaining stops. */
  continueRequest(id: string): Promise<void>;
  edit(id: string, stage: BreakpointStage, body: string): Promise<void>;
}

export interface SessionState extends SessionActions {
  session: SessionInfo | null;
  records: RequestRecord[];
  status: LiveStatus;
  error: string | null;
}

/** Loads the session, subscribes to its events, and re-syncs the list on every (re)connect. */
export function useSession(uid: string): SessionState {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fail = (err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    };

    api.session(uid).then((info) => active && setSession(info), fail);

    const unsubscribe = api.subscribe(uid, {
      onOpen: () => {
        setStatus('live');
        setError(null);
        api.session(uid).then((info) => active && setSession(info), fail);
        api.requests(uid).then((list) => active && setRecords((prev) => mergeRecords(prev, list)), fail);
      },
      onEvent: (event) => {
        if (event.type === 'request') setRecords((prev) => upsertRecord(prev, event.record));
        else if (event.type === 'session') setSession((prev) => (prev ? { ...prev, ...event.session } : prev));
        else setRecords([]);
      },
      onError: () => setStatus('offline'),
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid]);

  const clear = useCallback(async () => {
    await api.clear(uid);
    setRecords([]);
  }, [uid]);
  const pause = useCallback(async () => setSession(await api.pause(uid)), [uid]);
  const resume = useCallback(async () => setSession(await api.resume(uid)), [uid]);
  const stepInto = useCallback((id: string) => api.step(uid, id), [uid]);
  const continueRequest = useCallback((id: string) => api.continue(uid, id), [uid]);
  const edit = useCallback(
    async (id: string, stage: BreakpointStage, body: string) => {
      const updated = await api.edit(uid, id, { [stage]: { body } });
      setRecords((prev) => upsertRecord(prev, updated));
    },
    [uid],
  );

  return { session, records, status, error, clear, pause, resume, stepInto, continueRequest, edit };
}
