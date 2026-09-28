import { isSessionUid } from '@proxy-moxy/shared';

export type ResolvedTarget = { uid: string; target: URL } | { status: 400 | 404; error: string };

/**
 * Resolves `/<session-uid>?url=<target>&…`. The target must be an absolute http(s) URL;
 * every other query parameter is appended to it.
 */
export function resolveTarget(uid: string, params: URLSearchParams): ResolvedTarget {
  if (!isSessionUid(uid)) return { status: 404, error: 'Use /<session-uid>?url=<target-url>' };

  const raw = params.get('url');
  if (!raw) return { status: 400, error: 'Missing ?url=<target-url>' };

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { status: 400, error: `Invalid target URL: ${raw}` };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { status: 400, error: `Target must be http(s), got ${target.protocol}` };
  }

  for (const [name, value] of params) {
    if (name !== 'url') target.searchParams.append(name, value);
  }
  return { uid, target };
}
