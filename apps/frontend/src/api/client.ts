import type { PauseFilter, RequestEdit, RequestRecord, SessionConfig, SessionEvent, SessionInfo } from '@proxy-moxy/shared';

export interface SubscribeHandlers {
  onEvent(event: SessionEvent): void;
  onOpen(): void;
  /** `closed`: the browser gave up (e.g. the server answered 404) and will not reconnect on its own. */
  onError(closed: boolean): void;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const detail = await res.json().then((data: { error?: string }) => data.error, () => null);
    throw new ApiError(detail ?? `${init?.method ?? 'GET'} ${path} → ${res.status}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const send = <T>(method: string, path: string, payload?: unknown) =>
  call<T>(path, {
    method,
    ...(payload === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
  });

export const api = {
  /** Null when no session with this uid exists yet. */
  async session(uid: string): Promise<SessionInfo | null> {
    try {
      return await call<SessionInfo>(`/api/sessions/${uid}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  /** Creates the session, or points an existing one at a new base URL. */
  saveSession: (uid: string, config: SessionConfig) => send<SessionInfo>('PUT', `/api/sessions/${uid}`, config),

  requests: async (uid: string) => (await call<{ requests: RequestRecord[] }>(`/api/sessions/${uid}/requests`)).requests,

  clear: (uid: string) => send<void>('DELETE', `/api/sessions/${uid}/requests`),

  pause: (uid: string) => send<SessionInfo>('POST', `/api/sessions/${uid}/pause`),

  resume: (uid: string) => send<SessionInfo>('POST', `/api/sessions/${uid}/resume`),

  /** Which requests a paused session stops; applies from the next stop. */
  setPauseFilter: (uid: string, filter: PauseFilter) => send<SessionInfo>('PUT', `/api/sessions/${uid}/pause-filter`, filter),

  /** Step into: moves a parked request to its next stop. */
  step: (uid: string, id: string) => send<void>('POST', `/api/sessions/${uid}/requests/${id}/step`),

  /** Continue: runs a parked request to the end, skipping its remaining stops. */
  continue: (uid: string, id: string) => send<void>('POST', `/api/sessions/${uid}/requests/${id}/continue`),

  /** Replaces the body of a parked request at the stage it is held. */
  edit: (uid: string, id: string, edit: RequestEdit) => send<RequestRecord>('PATCH', `/api/sessions/${uid}/requests/${id}`, edit),

  /** Live updates over Server-Sent Events. Returns the unsubscribe function. */
  subscribe(uid: string, handlers: SubscribeHandlers): () => void {
    const source = new EventSource(`/api/sessions/${uid}/events`);
    const relay = (event: Event) => handlers.onEvent(JSON.parse((event as MessageEvent<string>).data) as SessionEvent);
    source.addEventListener('request', relay);
    source.addEventListener('session', relay);
    source.addEventListener('cleared', relay);
    source.onopen = () => handlers.onOpen();
    source.onerror = () => handlers.onError(source.readyState === EventSource.CLOSED);
    return () => source.close();
  },
};
