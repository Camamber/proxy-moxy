import type { RequestEdit, RequestRecord, SessionEvent, SessionInfo } from '@proxy-moxy/shared';

export interface SubscribeHandlers {
  onEvent(event: SessionEvent): void;
  onOpen(): void;
  onError(): void;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const detail = await res.json().then((data: { error?: string }) => data.error, () => null);
    throw new Error(detail ?? `${init?.method ?? 'GET'} ${path} → ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const post = <T>(path: string, payload?: unknown) =>
  call<T>(path, {
    method: 'POST',
    ...(payload === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
  });

export const api = {
  session: (uid: string) => call<SessionInfo>(`/api/sessions/${uid}`),

  requests: async (uid: string) => (await call<{ requests: RequestRecord[] }>(`/api/sessions/${uid}/requests`)).requests,

  clear: (uid: string) => call<void>(`/api/sessions/${uid}/requests`, { method: 'DELETE' }),

  pause: (uid: string) => post<SessionInfo>(`/api/sessions/${uid}/pause`),

  resume: (uid: string) => post<SessionInfo>(`/api/sessions/${uid}/resume`),

  /** Step into: moves a parked request to its next stop. */
  step: (uid: string, id: string) => post<void>(`/api/sessions/${uid}/requests/${id}/step`),

  /** Continue: runs a parked request to the end, skipping its remaining stops. */
  continue: (uid: string, id: string) => post<void>(`/api/sessions/${uid}/requests/${id}/continue`),

  /** Replaces the body of a parked request at the stage it is held. */
  edit: (uid: string, id: string, edit: RequestEdit) =>
    call<RequestRecord>(`/api/sessions/${uid}/requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(edit),
    }),

  /** Live updates over Server-Sent Events. Returns the unsubscribe function. */
  subscribe(uid: string, handlers: SubscribeHandlers): () => void {
    const source = new EventSource(`/api/sessions/${uid}/events`);
    const relay = (event: Event) => handlers.onEvent(JSON.parse((event as MessageEvent<string>).data) as SessionEvent);
    source.addEventListener('request', relay);
    source.addEventListener('session', relay);
    source.addEventListener('cleared', relay);
    source.onopen = () => handlers.onOpen();
    source.onerror = () => handlers.onError();
    return () => source.close();
  },
};
