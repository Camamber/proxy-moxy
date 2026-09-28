import { isSessionUid } from '@proxy-moxy/shared';

export interface ProxyPath {
  uid: string;
  /** Everything after `/<uid>`, percent-encoding untouched; empty for a bare `/<uid>`. */
  rest: string;
}

/** Splits `/<uid>/rest/of/path` into the session uid and the path to forward. */
export function splitProxyPath(pathname: string): ProxyPath | null {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  const uid = match?.[1];
  if (!uid || !isSessionUid(uid)) return null;
  return { uid, rest: match[2] ?? '' };
}

/** The upstream URL: the session base URL, then the forwarded path, then the request's query. */
export function joinTarget(baseUrl: string, rest: string, search: string): URL {
  const target = new URL(baseUrl);
  target.pathname = target.pathname.replace(/\/+$/, '') + rest;
  target.search = search;
  return target;
}
