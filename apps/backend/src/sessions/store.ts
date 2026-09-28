import { EventEmitter } from 'node:events';
import {
  DEFAULT_PAUSE_FILTER,
  type PauseFilter,
  type RequestRecord,
  type Session,
  type SessionConfig,
  type SessionEvent,
} from '@proxy-moxy/shared';

interface Entry {
  uid: string;
  createdAt: string;
  baseUrl: string;
  paused: boolean;
  pauseFilter: PauseFilter;
  records: RequestRecord[];
}

export interface StoreOptions {
  /** Records kept per session; older ones are dropped. */
  historyLimit: number;
}

export type SessionListener = (event: SessionEvent) => void;

/**
 * In-memory sessions with their request history. Sessions exist only once they have been
 * saved with a base URL. Emits an event per change so SSE clients stay live.
 */
export class SessionStore {
  #entries = new Map<string, Entry>();
  #events = new EventEmitter();
  #historyLimit: number;

  constructor(options: StoreOptions) {
    this.#historyLimit = options.historyLimit;
    this.#events.setMaxListeners(0);
  }

  get(uid: string): Session | null {
    const entry = this.#entries.get(uid);
    return entry ? summarize(entry) : null;
  }

  /** Creates the session or updates its configuration; history and pause state are kept. */
  save(uid: string, config: SessionConfig): { session: Session; created: boolean } {
    let entry = this.#entries.get(uid);
    const created = !entry;
    if (!entry) {
      entry = {
        uid,
        createdAt: new Date().toISOString(),
        baseUrl: config.baseUrl,
        paused: false,
        pauseFilter: DEFAULT_PAUSE_FILTER,
        records: [],
      };
      this.#entries.set(uid, entry);
    } else {
      entry.baseUrl = config.baseUrl;
    }
    const session = summarize(entry);
    this.#events.emit(uid, { type: 'session', session } satisfies SessionEvent);
    return { session, created };
  }

  /** Null when the session does not exist. */
  setPaused(uid: string, paused: boolean): Session | null {
    const entry = this.#entries.get(uid);
    if (!entry) return null;
    entry.paused = paused;
    const session = summarize(entry);
    this.#events.emit(uid, { type: 'session', session } satisfies SessionEvent);
    return session;
  }

  /** Null when the session does not exist. Applies to the next stop; parked requests stay parked. */
  setPauseFilter(uid: string, filter: PauseFilter): Session | null {
    const entry = this.#entries.get(uid);
    if (!entry) return null;
    entry.pauseFilter = filter;
    const session = summarize(entry);
    this.#events.emit(uid, { type: 'session', session } satisfies SessionEvent);
    return session;
  }

  listRequests(uid: string): RequestRecord[] {
    return [...(this.#entries.get(uid)?.records ?? [])];
  }

  getRequest(uid: string, id: string): RequestRecord | null {
    return this.#entries.get(uid)?.records.findLast((record) => record.id === id) ?? null;
  }

  /** Adds a record or replaces the one with the same id, then trims to `historyLimit`. Unknown sessions are ignored. */
  upsertRequest(record: RequestRecord): void {
    const entry = this.#entries.get(record.sessionUid);
    if (!entry) return;
    const index = entry.records.findLastIndex((existing) => existing.id === record.id);
    if (index === -1) entry.records.push(record);
    else entry.records[index] = record;

    const overflow = entry.records.length - this.#historyLimit;
    if (overflow > 0) entry.records.splice(0, overflow);

    this.#events.emit(record.sessionUid, { type: 'request', record } satisfies SessionEvent);
  }

  clearRequests(uid: string): void {
    const entry = this.#entries.get(uid);
    if (!entry) return;
    entry.records = [];
    this.#events.emit(uid, { type: 'cleared' } satisfies SessionEvent);
  }

  /** Returns the unsubscribe function. */
  subscribe(uid: string, listener: SessionListener): () => void {
    this.#events.on(uid, listener);
    return () => this.#events.off(uid, listener);
  }
}

function summarize(entry: Entry): Session {
  return {
    uid: entry.uid,
    createdAt: entry.createdAt,
    baseUrl: entry.baseUrl,
    requestCount: entry.records.length,
    paused: entry.paused,
    pauseFilter: {
      methods: [...entry.pauseFilter.methods],
      paths: [...entry.pauseFilter.paths],
      stages: [...entry.pauseFilter.stages],
    },
  };
}
