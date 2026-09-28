import { EventEmitter } from 'node:events';
import type { RequestRecord, Session, SessionEvent } from '@proxy-moxy/shared';

interface Entry {
  uid: string;
  createdAt: string;
  paused: boolean;
  records: RequestRecord[];
}

export interface StoreOptions {
  /** Records kept per session; older ones are dropped. */
  historyLimit: number;
}

export type SessionListener = (event: SessionEvent) => void;

/** In-memory sessions with their request history. Emits an event per change so SSE clients stay live. */
export class SessionStore {
  #entries = new Map<string, Entry>();
  #events = new EventEmitter();
  #historyLimit: number;

  constructor(options: StoreOptions) {
    this.#historyLimit = options.historyLimit;
    this.#events.setMaxListeners(0);
  }

  /** Sessions are addressed by uid and come into existence on first touch. */
  getOrCreate(uid: string): Session {
    return summarize(this.#entry(uid));
  }

  get(uid: string): Session | null {
    const entry = this.#entries.get(uid);
    return entry ? summarize(entry) : null;
  }

  setPaused(uid: string, paused: boolean): Session {
    const entry = this.#entry(uid);
    entry.paused = paused;
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

  /** Adds a record or replaces the one with the same id, then trims to `historyLimit`. */
  upsertRequest(record: RequestRecord): void {
    const entry = this.#entry(record.sessionUid);
    const index = entry.records.findLastIndex((existing) => existing.id === record.id);
    if (index === -1) entry.records.push(record);
    else entry.records[index] = record;

    const overflow = entry.records.length - this.#historyLimit;
    if (overflow > 0) entry.records.splice(0, overflow);

    this.#events.emit(record.sessionUid, { type: 'request', record } satisfies SessionEvent);
  }

  clearRequests(uid: string): void {
    const entry = this.#entries.get(uid);
    if (entry) entry.records = [];
    this.#events.emit(uid, { type: 'cleared' } satisfies SessionEvent);
  }

  /** Returns the unsubscribe function. */
  subscribe(uid: string, listener: SessionListener): () => void {
    this.#events.on(uid, listener);
    return () => this.#events.off(uid, listener);
  }

  #entry(uid: string): Entry {
    let entry = this.#entries.get(uid);
    if (!entry) {
      entry = { uid, createdAt: new Date().toISOString(), paused: false, records: [] };
      this.#entries.set(uid, entry);
    }
    return entry;
  }
}

function summarize(entry: Entry): Session {
  return { uid: entry.uid, createdAt: entry.createdAt, requestCount: entry.records.length, paused: entry.paused };
}
