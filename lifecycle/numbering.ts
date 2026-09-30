import { EngineError, formatNumber, periodBounds, periodKey, sequenceOf, validatePattern, type NumberingReset } from '../engine/index.ts';
import { LifecycleError, PACKS, type DocumentKind, type Language, type LifecyclePack } from './lang/pack.ts';
import { KINDS, type Kind } from './load.ts';
import { DuplicateError, leaveMessage, sourceOf, type RecordEvent, type Row, type Store, type Where } from './store.ts';

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
    // the row comes back rather than starting over. `holder` was read before
    // this check (itself a read), so another claim may have moved on since:
    // freed its key for a fresh row (the branch below, on another claim),
    // or already restored it. Re-read before restoring, and restore only a
    // holder that is still deleted and still holds the scope's key; a stale
    // `holder` restored blindly could come back live without the key at all.
    const current = await store.get(LEDGER, holder.id, { deleted: true });
    if (current?.deletedAt && current.scopeKey === scopeKey) {
      try {
        await store.restore(LEDGER, holder.id);
      } catch (error) {
        const after = await store.get(LEDGER, holder.id, { deleted: true });
        // Fine only when the holder itself is now live: another claim
        // restored it first, with the same key and lastValue. Anything else
        // is a real failure, not this race, and must not be swallowed.
        if (!after || after.deletedAt) throw error;
      }
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

/** The scope's numbered documents: its issuer and type, and the period's own date bounds when it has any. */
const numberedIn = (scope: Scope): Where => {
  const bounds = periodBounds(scope.periodKey);
  return { issuerId: scope.issuerId, numberKey: { notNull: true }, ...(bounds ? { issueDate: bounds } : {}) };
};

/**
 * Like numberedIn, but always excludes a blank issue date too, even in a
 * scope with no period bounds ('ALL'): left unconstrained there, a DESC
 * order by issueDate could sort a blank first (Postgres does, with NULLs
 * before values by default) and starve a limited read of the dated rows it
 * needs. Only latestIssueDate reads an order and a limited slice; scopeHasNumbers
 * just asks whether any row matches, so a document with no issue date still
 * counts for it in an 'ALL' scope.
 */
const datedIn = (scope: Scope): Where => ({
  ...numberedIn(scope),
  issueDate: periodBounds(scope.periodKey) ?? { gte: '0001-01-01' },
});

/** The latest issue date among the scope's numbered documents, deleted ones included, other than `exceptId`. */
export async function latestIssueDate(store: Store, scope: Scope, exceptId: string): Promise<string | null> {
  const rows = await store.list(kindOfType(scope.documentType).plural, datedIn(scope), {
    deleted: 'include', orderBy: { field: 'issueDate', direction: 'desc' }, limit: 2,
  });
  const latest = rows.find((row) => row.id !== exceptId && typeof row.issueDate === 'string' && row.issueDate !== '');
  return latest ? String(latest.issueDate) : null;
}

/** Whether the scope has given out a number: a document of its issuer and type holds a key, dated inside the period when it has one. */
export async function scopeHasNumbers(store: Store, scope: Scope): Promise<boolean> {
  const rows = await store.list(kindOfType(scope.documentType).plural, numberedIn(scope), { deleted: 'include', limit: 1 });
  return rows.length > 0;
}

const TYPES: readonly DocumentKind[] = ['QUOTE', 'INVOICE', 'CREDIT_NOTE'];
const PERIOD = /^(?:ALL|\d{4}|\d{4}-(?:0[1-9]|1[0-2]))$/;

/** The scope a ledger row names; null while one of its three fields is empty or malformed. */
export function scopeOfRow(row: Row): Scope | null {
  const { issuerId, documentType, periodKey: period } = row;
  if (typeof issuerId !== 'string' || issuerId === '') return null;
  if (!TYPES.includes(documentType as DocumentKind)) return null;
  if (typeof period !== 'string' || !PERIOD.test(period)) return null;
  return { issuerId, documentType: documentType as DocumentKind, periodKey: period };
}

/** The pack of an issuer's profile language: a ledger row has no language of its own. */
export async function packForIssuer(store: Store, issuerId: unknown): Promise<LifecyclePack> {
  const issuer = typeof issuerId === 'string' && issuerId !== '' ? await store.get('billingIssuers', issuerId) : null;
  const profileId = issuer?.profileId;
  const profile = typeof profileId === 'string' && profileId !== '' ? await store.get('billingProfiles', profileId) : null;
  return PACKS[profile?.language as Language] ?? PACKS.EN;
}

async function tellLedger(store: Store, row: Row, text: (pack: LifecyclePack) => string): Promise<void> {
  const pack = await packForIssuer(store, row.issuerId);
  await leaveMessage(store, { object: 'billingSequence', recordId: row.id, kind: 'CORRECTION', text: text(pack) });
}

/**
 * Frees the scope's key from a deleted row whose scope never gave out a
 * number: the key is cleared on the row while it stays deleted, as
 * resolveDuplicateLedger does, so its stale lastValue never comes back.
 * True when it did. A live holder, or a deleted one whose scope has numbers
 * (its own guard restores it), keeps the key.
 */
async function freeDeletedKey(store: Store, scope: Scope): Promise<boolean> {
  const [holder] = await store.list(LEDGER, { scopeKey: scopeKeyOf(scope) }, { deleted: 'include', limit: 1 });
  if (!holder?.deletedAt || (await scopeHasNumbers(store, scope))) return false;
  await store.update(LEDGER, holder.id, { scopeKey: null });
  return true;
}

/** Gives a live row its scope's key; a live holder makes this row the duplicate, a deleted numberless one gives way. */
async function keyRow(store: Store, row: Row, scope: Scope): Promise<void> {
  const key = scopeKeyOf(scope);
  if (row.scopeKey === key) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await store.update(LEDGER, row.id, { scopeKey: key });
      return;
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
      if (attempt === 0 && (await freeDeletedKey(store, scope))) continue;
      await store.softDelete(LEDGER, row.id);
      await tellLedger(store, row, (pack) => pack.messages.ledgerDuplicateRemoved);
      return;
    }
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The ledger's trigger (spec §5): see the table above. It reads the row afresh: events may arrive late or twice. */
export async function guardSequence(store: Store, event: RecordEvent): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  if ((event.name === 'created' || event.name === 'updated') && sourceOf(event.after) === 'APPLICATION') return;
  const row = await store.get(LEDGER, event.recordId, { deleted: true });
  if (!row) return;
  const scope = scopeOfRow(row);

  if (event.name === 'created' || event.name === 'restored') {
    if (!row.deletedAt && scope) await keyRow(store, row, scope);
    return;
  }

  if (event.name === 'deleted') {
    if (row.deletedAt && scope && row.scopeKey === scopeKeyOf(scope) && (await scopeHasNumbers(store, scope))) {
      await store.restore(LEDGER, row.id);
      await tellLedger(store, row, (pack) => pack.messages.ledgerRestored);
    }
    return;
  }

  // updated
  if (row.deletedAt) return;
  const before = event.before;
  const was = before ? scopeOfRow(before) : null;
  if (before && was && before.scopeKey === scopeKeyOf(was) && (await scopeHasNumbers(store, was))) {
    const patch: Record<string, unknown> = {};
    for (const field of ['issuerId', 'documentType', 'periodKey'] as const) if (!same(row[field], before[field])) patch[field] = before[field];
    if (lastValueOf(row) < lastValueOf(before)) patch.lastValue = before.lastValue;
    const fields = Object.keys(patch);
    if (fields.length === 0) return;
    await store.update(LEDGER, row.id, patch);
    await tellLedger(store, row, (pack) => pack.messages.ledgerChangePutBack(fields.map((name) => pack.fields[name as keyof LifecyclePack['fields']])));
    return;
  }
  if (scope) await keyRow(store, row, scope);
}
