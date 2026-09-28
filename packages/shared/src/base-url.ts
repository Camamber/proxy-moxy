export type BaseUrlResult = { ok: true; baseUrl: string } | { ok: false; error: string };

/**
 * Validates and normalizes a session's base URL: an http(s) origin with an optional
 * path prefix, no query, fragment or credentials, trailing slashes removed.
 * `https://api.example.com/v1/` → `https://api.example.com/v1`.
 */
export function parseBaseUrl(input: string): BaseUrlResult {
  const value = input.trim();
  if (!value) return { ok: false, error: 'Enter the base URL of the real server' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, error: 'Not a valid URL; include the scheme, e.g. https://api.example.com' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https base URLs are supported' };
  }
  if (url.username || url.password) {
    return { ok: false, error: 'Leave credentials out of the URL; send an Authorization header instead' };
  }
  if (url.search || url.hash) {
    return { ok: false, error: 'Leave out the query string and fragment; requests bring their own' };
  }
  return { ok: true, baseUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}` };
}
