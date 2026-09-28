/** Header names are lower-cased; multi-value headers (e.g. set-cookie) are arrays. */
export type HeaderRecord = Record<string, string | string[]>;

export interface CapturedBody {
  /** UTF-8 text of the body when it was text-like and could be decoded. */
  text: string | null;
  /** Bytes on the wire. */
  size: number;
  /** `text` was cut at the capture limit. */
  truncated: boolean;
  /** Why `text` is null although `size` > 0. */
  omitted: 'binary' | 'undecodable' | null;
}

export interface CapturedRequest {
  method: string;
  /** The target URL the proxy forwarded to. */
  url: string;
  headers: HeaderRecord;
  body: CapturedBody;
}

export interface CapturedResponse {
  status: number;
  statusText: string;
  headers: HeaderRecord;
  body: CapturedBody;
}

/**
 * Where a request is in its journey through the proxy:
 * `request` (arrived, not forwarded yet) → `upstream` (waiting for the real server)
 * → `response` (arrived, not delivered yet) → `done`.
 */
export type RequestStage = 'request' | 'upstream' | 'response' | 'done';

/** Stages where a paused session parks a request until the user steps it. */
export type BreakpointStage = 'request' | 'response';

/** One request that went through the proxy. Emitted on every stage change. */
export interface RequestRecord {
  id: string;
  sessionUid: string;
  /** ISO timestamp. */
  startedAt: string;
  /** Null until `done`. */
  durationMs: number | null;
  stage: RequestStage;
  /** True while parked at a breakpoint, waiting for the user. */
  held: boolean;
  request: CapturedRequest;
  /** Null until the upstream answered, or forever when the upstream call failed. */
  response: CapturedResponse | null;
  /** Set when the request could not be completed. */
  error: string | null;
}

/**
 * Which requests a paused session stops. Everything else passes straight through.
 * Empty `methods` or `paths` match everything.
 */
export interface PauseFilter {
  /** Upper-case HTTP methods. */
  methods: string[];
  /** Globs matched against the path after `/<uid>`, without the query; `*` matches any characters. */
  paths: string[];
  /** Stops that apply; at least one. */
  stages: BreakpointStage[];
}

export interface Session {
  uid: string;
  createdAt: string;
  /** Real server this session forwards to; the path after `/<uid>` is appended to it. */
  baseUrl: string;
  pauseFilter: PauseFilter;
  requestCount: number;
  /** While paused, new requests and responses stop at breakpoints. */
  paused: boolean;
}

/** Body of `PUT /api/sessions/:uid`, which creates or reconfigures a session. */
export interface SessionConfig {
  baseUrl: string;
}

/** What the UI receives: the session plus the proxy URL to hand out. */
export interface SessionInfo extends Session {
  proxyUrl: string;
}

/** PATCH payload for a held request: exactly one side, matching the stage it is held at. */
export interface RequestEdit {
  request?: { body: string };
  response?: { body: string };
}

export type SessionEvent =
  | { type: 'request'; record: RequestRecord }
  | { type: 'session'; session: Session }
  | { type: 'cleared' };
