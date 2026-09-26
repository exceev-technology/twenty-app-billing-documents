import { EngineError, formatNumber, periodBounds, periodKey, sequenceOf, validatePattern, type NumberingReset } from '../engine/index.ts';
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
 * ledger row deleted before it ever gave out a number would otherwise block
 * the scope for ever, and one deleted after numbers went out must not lose
 * its lastValue. Twenty also accepts an update to a soft-deleted row and
 * leaves it deleted, which is what lets a stale key be freed without ever
 * bringing its lastValue back to life.
 *
 * Called when creating the scope's ledger row was refused as a duplicate:
 * another row already holds the scope's key, live or deleted. Resolves to
 * the row to use, or null when the key is held by neither (someone else's
 * attempt raced past it; the caller tries again).
 */
async function resolveDuplicateLedger(store: Store, scope: Scope): Promise<Row | null> {
  const scopeKey = scopeKeyOf(scope);
  const [holder] = await store.list(LEDGER, { scopeKey }, { deleted: 'include', limit: 1 });
  if (!holder) return null;
  if (!holder.deletedAt) return holder; // Someone created it at the same moment.
  if (await scopeHasNumbers(store, scope)) {
    // Numbers already went out under this key: its lastValue must survive, so
    // the row comes back rather than starting over.
    try {
      await store.restore(LEDGER, holder.id);
    } catch {
      // Another claim restored it first; it is live now, with the same key and lastValue.
    }
    const [live] = await store.list(LEDGER, { scopeKey }, { limit: 1 });
    return live ?? null;
  }
  // No number has ever come out of this scope: the deleted row's lastValue is
  // stale and must never come back, so its key is freed without restoring it.
  await store.update(LEDGER, holder.id, { scopeKey: null });
  try {
    return await store.create(LEDGER, { ...scopeFields(scope), lastValue: 0, scopeKey });
  } catch (error) {
    if (!(error instanceof DuplicateError)) throw error;
    // Another claim's fresh row won the race; use it.
    const [live] = await store.list(LEDGER, { scopeKey }, { limit: 1 });
    return live ?? null;
  }
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
      const resolved = await resolveDuplicateLedger(store, scope);
      if (resolved) return resolved;
      // Nothing currently holds the key: another attempt raced past it; try again.
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
        const issuer = await store.get('billingIssuers', issuerId);
        const issuerLabel = typeof issuer?.name === 'string' && issuer.name !== '' ? issuer.name : issuerId;
        throw new LifecycleError([{ code: 'LEDGER_BEHIND', value: `${issuerLabel}, ${scope.periodKey}`, documentType: scope.documentType }]);
      }
      continue;
    }
    await raiseLedger(store, scope, n);
    return { number, n, reused: false };
  }
}

/**
 * Always constrains issueDate to a non-blank value, even in a scope with no
 * period bounds ('ALL'): left unconstrained, a DESC order by issueDate could
 * sort a blank first (Postgres does, with NULLs before values by default)
 * and starve a limited read of the dated rows it needs.
 */
const numberedIn = (scope: Scope): Where => {
  const bounds = periodBounds(scope.periodKey) ?? { gte: '0001-01-01' };
  return { issuerId: scope.issuerId, numberKey: { notNull: true }, issueDate: bounds };
};

/** The latest issue date among the scope's numbered documents, deleted ones included, other than `exceptId`. */
export async function latestIssueDate(store: Store, scope: Scope, exceptId: string): Promise<string | null> {
  const rows = await store.list(kindOfType(scope.documentType).plural, numberedIn(scope), {
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
