import { EngineError, formatNumber, periodKey, validatePattern, type NumberingReset } from '../engine/index.ts';
import { LifecycleError, type DocumentKind } from './lang/pack.ts';
import { KINDS, type Kind } from './load.ts';
import { DuplicateError, type Row, type Store, type Where } from './store.ts';

/**
 * Allocation (spec §5). The unique numberKey is the guarantee that no number is
 * held twice; the ledger only says where to start. A number, once claimed, stays
 * with its document.
 */

const LEDGER = 'billingSequences';
export const MAX_REFUSALS = 50;

/** One issuer, one document type, one period: each has its own sequence. */
export type Scope = { issuerId: string; documentType: DocumentKind; periodKey: string };

export const scopeKeyOf = (scope: Scope): string => `${scope.issuerId}:${scope.documentType}:${scope.periodKey}`;
export const numberKeyOf = (issuerId: string, number: string): string => `${issuerId}:${number}`;

export const scopeOf = (kind: Kind, issuerId: string, reset: NumberingReset, issueDate: string): Scope => ({
  issuerId, documentType: kind.kind, periodKey: periodKey(reset, issueDate),
});

const kindOfType = (type: DocumentKind): Kind => Object.values(KINDS).find((kind) => kind.kind === type)!;

/** The first and last day of a period: '2026' is the year, '2026-09' the month, 'ALL' has no bounds. */
export function periodBounds(key: string): { gte: string; lte: string } | null {
  if (key === 'ALL') return null;
  const year = /^(\d{4})$/.exec(key);
  if (year) return { gte: `${key}-01-01`, lte: `${key}-12-31` };
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!month) throw new Error(`A period is ALL, YYYY or YYYY-MM, not "${key}"`);
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).getUTCDate();
  return { gte: `${key}-01`, lte: `${key}-${String(last).padStart(2, '0')}` };
}

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The sequence a number was formatted from, read back through its pattern; null when the number does not fit it. */
export function sequenceOf(pattern: string, number: string): number | null {
  let group = 0;
  let sequenceGroup = 0;
  const source = pattern.split(/(\{[^{}]*\})/).map((part) => {
    const token = /^\{([^{}]*)\}$/.exec(part)?.[1];
    if (token === undefined) return escape(part);
    group += 1;
    if (token === 'YYYY') return '(\\d{4})';
    if (token === 'YY' || token === 'MM') return '(\\d{2})';
    sequenceGroup = group;
    return '(\\d+)';
  }).join('');
  const match = new RegExp(`^${source}$`).exec(number);
  return match && sequenceGroup > 0 ? Number(match[sequenceGroup]) : null;
}

/** A ledger's last value as a positive integer; anything else (empty, a typo, a negative number) counts as 0. */
export function lastValueOf(ledger: Row | null | undefined): number {
  const value = Number(ledger?.lastValue ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

const scopeFields = (scope: Scope) => ({ issuerId: scope.issuerId, documentType: scope.documentType, periodKey: scope.periodKey });

/** The scope's ledger row, found by its issuer, type and period; the one holding the scope's key first. */
export async function findLedger(store: Store, scope: Scope): Promise<Row | null> {
  const rows = await store.list(LEDGER, scopeFields(scope));
  return rows.find((row) => row.scopeKey === scopeKeyOf(scope)) ?? rows[0] ?? null;
}

/**
 * Twenty keeps a soft-deleted row's values, its unique key included, so a
 * ledger row deleted before its scope gave out a number would block the
 * scope for ever. Frees the key: the row comes back just long enough to
 * lose it. True when a row was freed.
 */
export async function releaseDeletedHolder(store: Store, scopeKey: string): Promise<boolean> {
  const [holder] = await store.list(LEDGER, { scopeKey }, { deleted: 'only', limit: 1 });
  if (!holder) return false;
  await store.restore(LEDGER, holder.id);
  await store.update(LEDGER, holder.id, { scopeKey: null });
  await store.softDelete(LEDGER, holder.id);
  return true;
}

/** The scope's ledger row, created at 0 when it has none (spec §5, step 2). */
export async function ensureLedger(store: Store, scope: Scope): Promise<Row> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const found = await findLedger(store, scope);
    if (found) return found;
    try {
      return await store.create(LEDGER, { ...scopeFields(scope), lastValue: 0, scopeKey: scopeKeyOf(scope) });
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      // Someone created it at the same moment (the next read finds it), or a deleted row still holds the key.
      await releaseDeletedHolder(store, scopeKeyOf(scope));
    }
  }
  throw new Error(`The ledger of ${scopeKeyOf(scope)} could be neither found nor created`);
}

/** The number the next allocation would give, for the trial render. Reads only. */
export async function nextNumber(store: Store, scope: Scope, pattern: string, issueDate: string): Promise<{ n: number; number: string }> {
  const n = lastValueOf(await findLedger(store, scope)) + 1;
  return { n, number: formatNumber(pattern, n, issueDate) };
}

/** Raises the ledger to n, from a fresh read; never lowers it (spec §5, step 6). */
export async function raiseLedger(store: Store, scope: Scope, n: number): Promise<void> {
  const ledger = await ensureLedger(store, scope);
  if (n > lastValueOf(ledger)) await store.update(LEDGER, ledger.id, { lastValue: n });
}

export type ClaimInput = { kind: Kind; documentId: string; issuerId: string; pattern: string; reset: NumberingReset; issueDate: string };

/** The number the document holds; `n` is its sequence when the pattern still reads it back. */
export type Claim = { number: string; n: number | null; reused: boolean };

/**
 * Spec §5, steps 1 to 6. The ledger is read before the document, so two
 * requests for the same draft converge: whichever reads the document second
 * sees the first one's claim, or claims the same number on the same record.
 */
export async function claimNumber(store: Store, input: ClaimInput): Promise<Claim> {
  const { kind, documentId, issuerId, pattern, reset, issueDate } = input;
  const problems = validatePattern(pattern, reset);
  if (problems.length > 0) throw new EngineError(problems);
  const scope = scopeOf(kind, issuerId, reset, issueDate);
  const ledger = await ensureLedger(store, scope);
  const document = await store.get(kind.plural, documentId);
  if (!document) throw new Error(`${kind.object} ${documentId} no longer exists`);
  if (typeof document.number === 'string' && document.number !== '' && document.numberKey) {
    return { number: document.number, n: sequenceOf(pattern, document.number), reused: true };
  }
  let refusals = 0;
  for (let n = lastValueOf(ledger) + 1; ; n += 1) {
    const number = formatNumber(pattern, n, issueDate);
    try {
      await store.update(kind.plural, documentId, { number, numberKey: numberKeyOf(issuerId, number) });
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      refusals += 1;
      if (refusals >= MAX_REFUSALS) {
        throw new LifecycleError([{ code: 'LEDGER_BEHIND', value: `${scope.documentType} ${scope.periodKey}` }]);
      }
      continue;
    }
    await raiseLedger(store, scope, n);
    return { number, n, reused: false };
  }
}

const numberedIn = (scope: Scope): Where => {
  const bounds = periodBounds(scope.periodKey);
  return { issuerId: scope.issuerId, numberKey: { notNull: true }, ...(bounds ? { issueDate: bounds } : {}) };
};

/** The latest issue date among the scope's numbered documents, deleted ones included, other than `exceptId`. */
export async function latestIssueDate(store: Store, kind: Kind, scope: Scope, exceptId: string): Promise<string | null> {
  const rows = await store.list(kind.plural, numberedIn(scope), {
    deleted: 'include', orderBy: { field: 'issueDate', direction: 'desc' }, limit: 2,
  });
  const latest = rows.find((row) => row.id !== exceptId && typeof row.issueDate === 'string' && row.issueDate !== '');
  return latest ? String(latest.issueDate) : null;
}

/** Whether the scope has given out a number: a document of its issuer and type holds a key dated inside the period. */
export async function scopeHasNumbers(store: Store, scope: Scope): Promise<boolean> {
  const rows = await store.list(kindOfType(scope.documentType).plural, numberedIn(scope), { deleted: 'include', limit: 1 });
  return rows.length > 0;
}
