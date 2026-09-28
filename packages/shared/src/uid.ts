/** URL-safe, 1–64 chars. Dots are excluded on purpose so `/:uid` never looks like a file. */
export const SESSION_UID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isSessionUid(value: string): boolean {
  return SESSION_UID_PATTERN.test(value);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 12 random base-36 chars (~62 bits). Works in browsers and Node, secure context or not. */
export function createSessionUid(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}
