export interface WildcardOptions {
  /** Match the whole value (default) or any part of it. */
  anchored?: boolean;
  ignoreCase?: boolean;
}

/** `*` matches any run of characters, slashes included; everything else is literal. */
export function wildcardToRegExp(pattern: string, { anchored = true, ignoreCase = false }: WildcardOptions = {}): RegExp {
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(anchored ? `^${source}$` : source, ignoreCase ? 'i' : '');
}

/** Splits user input such as `/users/*, orders` into distinct patterns. */
export function splitPatterns(text: string): string[] {
  return [...new Set(text.split(/[\s,]+/).filter(Boolean))];
}

/**
 * History search: a pattern may match anywhere in the URL, case-insensitively, so `users`
 * works like "contains" and a `*` can span path segments. No patterns match everything.
 */
export function matchesUrlFilter(url: string, patterns: string[]): boolean {
  return patterns.length === 0 || patterns.some((pattern) => wildcardToRegExp(pattern, { anchored: false, ignoreCase: true }).test(url));
}
