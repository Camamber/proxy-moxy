import type { HeaderRecord } from '@proxy-moxy/shared';

/** Snapshot of a `Headers` object for the history. Names are lower-cased; set-cookie keeps every value. */
export function headersToRecord(headers: Headers): HeaderRecord {
  const out: HeaderRecord = {};
  for (const [name, value] of headers) out[name] = value;
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) out['set-cookie'] = cookies;
  return out;
}
