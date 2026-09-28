import type { BreakpointStage, PauseFilter, RequestRecord, SessionInfo } from '@proxy-moxy/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import { mergeRecords, upsertRecord } from './records.ts';

export type LiveStatus = 'connecting' | 'live' | 'offline';

/** `missing`: no session with this uid exists, so the page asks for a base URL to create it. */
export type SessionPhase = 'loading' | 'missing' | 'ready';

const RECHECK_MS = 2000;

export interface SessionActions {
  /** Creates the session, or points an existing one at a new base URL. */
  configure(baseUrl: string): Promise<void>;
  clear(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  setPauseFilter(filter: PauseFilter): Promise<void>;
  /** Moves a parked request to its next stop. */
  stepInto(id: string): Promise<void>;
  /** Runs a parked request to the end, skipping its remaining stops. */
  continueRequest(id: string): Promise<void>;
  edit(id: string, stage: BreakpointStage, body: string): Promise<void>;
}

export interface SessionState extends SessionActions {
  phase: SessionPhase;
  session: SessionInfo | null;
  records: RequestRecord[];
  status: LiveStatus;
  error: string | null;
}

/** Loads the session, streams its events while it exists, and re-syncs the list on every (re)connect. */
export function useSession(uid: string): SessionState {
  const [phase, setPhase] = useState<SessionPhase>('loading');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  /** Bumped to open a fresh event stream after the browser gave up on the previous one. */
  const [attempt, setAttempt] = useState(0);

  const showMissing = useCallback(() => {
    setSession(null);
    setRecords([]);
    setPhase('missing');
  }, []);

  useEffect(() => {
    let active = true;
    api.session(uid).then(
      (info) => {
        if (!active) return;
        if (!info) return showMissing();
        setSession(info);
        setPhase('ready');
      },
      (err: unknown) => {
        if (active) setError(message(err));
      },
    );
    return () => {
      active = false;
    };
  }, [uid, showMissing]);

  const ready = phase === 'ready';
  useEffect(() => {
    if (!ready) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = (err: unknown) => {
      if (active) setError(message(err));
    };

    // After an HTTP error (a 404 once a restart wiped the session, a 502 during a redeploy)
    // the browser stops reconnecting, so check what happened and act on it.
    const recheck = () => {
      api.session(uid).then(
        (info) => {
          if (!active) return;
          if (info) setAttempt((n) => n + 1);
          else showMissing();
        },
        () => {
          if (active) timer = setTimeout(recheck, RECHECK_MS);
        },
      );
    };

    setStatus('connecting');
    const unsubscribe = api.subscribe(uid, {
      onOpen: () => {
        setStatus('live');
        setError(null);
        api.session(uid).then((info) => {
          if (active && info) setSession(info);
        }, fail);
        api.requests(uid).then((list) => active && setRecords((prev) => mergeRecords(prev, list)), fail);
      },
      onEvent: (event) => {
        if (event.type === 'request') setRecords((prev) => upsertRecord(prev, event.record));
        else if (event.type === 'session') setSession((prev) => (prev ? { ...prev, ...event.session } : prev));
        else setRecords([]);
      },
      onError: (closed) => {
        setStatus('offline');
        if (closed) timer = setTimeout(recheck, RECHECK_MS);
      },
    });

    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [uid, ready, attempt, showMissing]);

  const configure = useCallback(
    async (baseUrl: string) => {
      const info = await api.saveSession(uid, { baseUrl });
      setSession(info);
      setError(null);
      setPhase('ready');
    },
    [uid],
  );
  const clear = useCallback(async () => {
    await api.clear(uid);
    setRecords([]);
  }, [uid]);
  const pause = useCallback(async () => setSession(await api.pause(uid)), [uid]);
  const resume = useCallback(async () => setSession(await api.resume(uid)), [uid]);
  const setPauseFilter = useCallback(async (filter: PauseFilter) => setSession(await api.setPauseFilter(uid, filter)), [uid]);
  const stepInto = useCallback((id: string) => api.step(uid, id), [uid]);
  const continueRequest = useCallback((id: string) => api.continue(uid, id), [uid]);
  const edit = useCallback(
    async (id: string, stage: BreakpointStage, body: string) => {
      const updated = await api.edit(uid, id, { [stage]: { body } });
      setRecords((prev) => upsertRecord(prev, updated));
    },
    [uid],
  );

  return { phase, session, records, status, error, configure, clear, pause, resume, setPauseFilter, stepInto, continueRequest, edit };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
