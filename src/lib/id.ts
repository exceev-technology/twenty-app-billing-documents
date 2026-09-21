import { createHash } from 'node:crypto';
import { IDS } from '../ids.ts';

/**
 * Universal identifiers are permanent once released. Twenty keys every upgrade
 * on them, and a changed identifier is a delete plus a create, which drops the
 * data. So nobody writes one by hand: code asks for an identifier by a stable
 * key, and `npm run ids:sync` registers the keys it has not seen yet.
 */

const KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;

/** Every key asked for since the process started. `ids:sync` reads it. */
export const requestedKeys = new Set<string>();

/**
 * While `ids:sync` collects keys, a missing key gets a stand-in derived from
 * the key, so distinct keys still get distinct values. Never deployed.
 */
function standIn(key: string): string {
  const h = createHash('sha256').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function id(key: string): string {
  if (!KEY.test(key)) throw new Error(`Invalid identifier key "${key}"`);
  requestedKeys.add(key);
  const value = IDS[key];
  if (value !== undefined) return value;
  if (process.env.BILLING_IDS_COLLECT === '1') return standIn(key);
  throw new Error(`No universal identifier for "${key}". Run: npm run ids:sync`);
}
