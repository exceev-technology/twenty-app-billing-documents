import { PACKS, type Language, type LifecyclePack, type StatusKey, type StatusRule } from './lang/pack.ts';
import { isIssued, KINDS, type Kind } from './load.ts';
import { idOf, textOf } from './map.ts';
import { packForIssuer } from './numbering.ts';
import { leaveMessage, sourceOf, type RecordEvent, type Row, type Store, type TimelineKind } from './store.ts';
import { documentChangeMatters, fillFromCatalog, lineChangeMatters, recomputeTotals } from './totals.ts';

/**
 * The status rules of spec §7 and flows spec §8. Only a person's move is checked:
 * the app's are always allowed. Null when the move is free.
 */
export function statusRuleBroken(kind: Kind, from: string, to: string, state: { numbered: boolean; issued: boolean; invoiced?: boolean }): StatusRule | null {
  if (from === to) return null;
  // A quote returns before the rules below: they are worded for invoices and credit notes only.
  if (kind.kind === 'QUOTE') {
    if (to === 'INVOICED') return 'INVOICED';
    return from === 'INVOICED' && state.invoiced ? 'UNINVOICE' : null;
  }
  if (to === 'ISSUED' && !state.issued) return 'ISSUE';
  // Issued documents only. A numbered draft left by a failed Issue is Draft, and a person's move to Issued, Cancelled,
  // Sent or Paid is put back, so it stays there; if it ever stands elsewhere, going back to Draft is how it is issued.
  if (state.issued && to === 'DRAFT') return 'DRAFT';
  if (state.numbered && to === 'CANCELLED') return 'CANCEL';
  // Only the app cancels a numbered invoice, through its credit notes: a person does not revive it.
  if (kind.kind === 'INVOICE' && state.numbered && from === 'CANCELLED') return 'UNCANCEL';
  if (kind.kind === 'INVOICE' && !state.issued && (to === 'SENT' || to === 'PAID')) return 'NOT_ISSUED';
  return null;
}

const empty = (value: unknown): boolean => value === null || value === undefined || value === '';

/** The dates a person's status move stamps (flows spec §8), into empty fields only; leaving Paid empties the paid date. */
export function stampsFor(kind: Kind, from: string, to: string, document: Row, now: Date): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const today = now.toISOString().slice(0, 10);
  if (kind.kind === 'INVOICE') {
    if (to === 'SENT' && empty(document.sentAt)) patch.sentAt = now.toISOString();
    if (to === 'PAID' && empty(document.paidAt)) patch.paidAt = today;
    if (from === 'PAID' && (to === 'ISSUED' || to === 'SENT') && !empty(document.paidAt)) patch.paidAt = null;
  }
  if (kind.kind === 'QUOTE') {
    if (to === 'SENT' && empty(document.sentAt)) patch.sentAt = now.toISOString();
    if (to === 'ACCEPTED' && empty(document.acceptedAt)) patch.acceptedAt = today;
  }
  return patch;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A value as it survives Twenty's round trip: rich text by its markdown, money by amount and currency, empty as null. */
function canonical(value: unknown): string {
  if (isObject(value) && 'markdown' in value) return JSON.stringify(textOf(value.markdown).trim());
  if (isObject(value) && 'amountMicros' in value) {
    const amount = value.amountMicros === null || value.amountMicros === undefined || value.amountMicros === '' ? null : Number(value.amountMicros);
    return JSON.stringify({ amount, currency: amount === null ? '' : textOf(value.currencyCode) });
  }
  if (value === '' || value === undefined) return 'null';
  return JSON.stringify(value);
}

export const sameField = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

type SnapshotRecord = { document?: Record<string, unknown>; lines?: Record<string, Record<string, unknown>> };

function recordOf(document: Row): SnapshotRecord {
  const record = isObject(document.snapshot) ? document.snapshot.record : undefined;
  return isObject(record) ? (record as SnapshotRecord) : {};
}

/** Messages are in the document's language, else its issuer's profile's. */
export async function packForDocument(store: Store, document: Row): Promise<LifecyclePack> {
  return PACKS[textOf(document.language) as Language] ?? packForIssuer(store, document.issuerId);
}

async function tell(store: Store, kind: Kind, document: Row, text: (pack: LifecyclePack) => string, timeline: TimelineKind = 'CORRECTION'): Promise<void> {
  const pack = await packForDocument(store, document);
  await leaveMessage(store, { object: kind.object, recordId: document.id, kind: timeline, text: text(pack) });
}

const statusName = (pack: LifecyclePack, status: string): string => pack.statuses[status as StatusKey] ?? status;

/** The quote an invoice was made from (flows spec §5): Accepted again when that draft is deleted, Invoiced again when it is restored. */
async function quoteFollows(store: Store, invoice: Row, change: 'deleted' | 'restored'): Promise<void> {
  const quoteId = idOf(invoice.quoteId);
  const quote = quoteId ? await store.get('billingQuotes', quoteId) : null;
  if (!quote) return;
  if (change === 'deleted') {
    if (quote.status !== 'INVOICED') return;
    if ((await store.list('billingInvoices', { quoteId: quote.id }, { limit: 1 })).length > 0) return;
    await store.update('billingQuotes', quote.id, { status: 'ACCEPTED' });
    await tell(store, KINDS.billingQuote, quote, (pack) => pack.messages.quoteReopened);
    return;
  }
  if (quote.status === 'INVOICED') return;
  await store.update('billingQuotes', quote.id, { status: 'INVOICED' });
  await tell(store, KINDS.billingQuote, quote, (pack) => pack.messages.quoteReinvoiced, 'INVOICED');
}

/** The trigger of a document object (spec §7, §8). The clock is the caller's: Lifecycle reads none. */
export async function onDocumentEvent(store: Store, kind: Kind, event: RecordEvent, now: () => Date): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  const document = await store.get(kind.plural, event.recordId, { deleted: true });
  if (!document) return;
  const issued = isIssued(kind, document);
  const numbered = Boolean(document.numberKey);

  if (event.name === 'deleted') {
    if (document.deletedAt && (issued || numbered)) {
      await store.restore(kind.plural, document.id);
      await tell(store, kind, document, (pack) => pack.messages.documentRestored(kind.kind, textOf(document.number)));
      return;
    }
    if (document.deletedAt && kind.kind === 'INVOICE') await quoteFollows(store, document, 'deleted');
    return;
  }
  if (event.name === 'restored') {
    // The handler reads the invoice as it stands: a restore's event that comes after a later deletion must not invoice the quote.
    if (kind.kind === 'INVOICE' && !document.deletedAt) await quoteFollows(store, document, 'restored');
    return;
  }
  // A deleted draft is left alone. A numbered or issued document is about to be restored, and an edit made
  // before its deletion must still be checked when its event comes late: the restore's own event checks nothing.
  if (document.deletedAt && !issued && !numbered) return;

  if (event.name === 'created') {
    const status = textOf(document.status);
    if (sourceOf(event.after) !== 'APPLICATION' && status !== '' && status !== 'DRAFT' && !issued) {
      await store.update(kind.plural, document.id, { status: 'DRAFT' });
      await tell(store, kind, document, (pack) => pack.messages.createdAsDraft(kind.kind, statusName(pack, status)));
    }
    return;
  }

  const patch: Record<string, unknown> = {};
  const messages: ((pack: LifecyclePack) => string)[] = [];

  if (sourceOf(event.after) !== 'APPLICATION' && event.updatedFields.includes('status')) {
    const from = textOf(event.before?.status) || 'DRAFT';
    const to = textOf(document.status);
    const invoiced = kind.kind === 'QUOTE' && from === 'INVOICED'
      ? (await store.list('billingInvoices', { quoteId: document.id }, { limit: 1 })).length > 0
      : false;
    const rule = statusRuleBroken(kind, from, to, { numbered, issued, invoiced });
    if (rule) {
      patch.status = from;
      messages.push((pack) => pack.messages.statusPutBack(rule, kind.kind, statusName(pack, from)));
    } else {
      Object.assign(patch, stampsFor(kind, from, to, document, now()));
    }
  }

  if (issued) {
    const record = recordOf(document).document ?? {};
    const changed = kind.lockedFields.filter((field) => field in record && !sameField(document[field], record[field]));
    for (const field of changed) patch[field] = record[field];
    if (changed.length > 0) messages.push((pack) => pack.messages.fieldsPutBack(kind.kind, changed.map((field) => pack.fields[field])));
  }

  if (Object.keys(patch).length > 0) {
    await store.update(kind.plural, document.id, patch);
    // Worded from the document as put back: a tampered language or issuer does not choose the message's language.
    const putBack = { ...document, ...patch };
    for (const message of messages) await tell(store, kind, putBack, message);
  }
  if (!issued && documentChangeMatters(event)) await recomputeTotals(store, kind, document.id);
}

type LineCorrection = 'changed' | 'added' | 'deleted' | 'moved';

/**
 * Whether a line that came from `origin` may go back there: the document is live, and either a draft
 * or issued with the line in its snapshot. Any other document would be guarded in its turn and send
 * the line back, and the two would bounce it for ever: the line is removed instead.
 */
function canTakeBack(kind: Kind, origin: Row, lineId: string): boolean {
  return !origin.deletedAt && (!isIssued(kind, origin) || lineId in (recordOf(origin).lines ?? {}));
}

/**
 * What an event says about a line arriving in an issued document: that it was added there ('added',
 * which includes one restored there and one moved in from no document), that it came from another
 * document (`from`: it goes back there only when canTakeBack holds, otherwise it is removed as an
 * added line), or nothing. A line created elsewhere and moved in before the creation was handled is
 * told by its creation, which names the document it began in.
 */
function arrivalOf(event: RecordEvent, key: string, documentId: string): 'added' | { from: string } | null {
  const before = idOf(event.before?.[key]);
  const after = idOf(event.after?.[key]);
  if (event.name === 'created') return after === documentId ? 'added' : after !== null ? { from: after } : null;
  if (event.name === 'restored') return after === documentId ? 'added' : null;
  if (event.name === 'updated' && after === documentId && before !== documentId) return before !== null ? { from: before } : 'added';
  return null;
}

/** An issued document's lines, put back to its snapshot (spec §7). */
async function reconcileIssuedLines(store: Store, kind: Kind, document: Row, event: RecordEvent, line: Row | null): Promise<void> {
  const key = kind.parentKey;
  const snapshotLines = recordOf(document).lines ?? {};
  const corrections = new Set<LineCorrection>();
  const held = new Map((await store.list(kind.linePlural, { [key]: document.id }, { deleted: 'include' })).map((row) => [row.id, row]));

  for (const [id, fields] of Object.entries(snapshotLines)) {
    let current = held.get(id) ?? (await store.get(kind.linePlural, id, { deleted: true }));
    // Destroyed: nothing can bring it back.
    if (!current) continue;
    if (current.deletedAt) {
      await store.restore(kind.linePlural, id);
      corrections.add('deleted');
      current = { ...current, deletedAt: null };
    }
    const patch = Object.fromEntries(Object.entries(fields).filter(([field, value]) => !sameField(current![field], value)));
    if (Object.keys(patch).length > 0) {
      await store.update(kind.linePlural, id, patch);
      corrections.add(key in patch ? 'moved' : 'changed');
    }
  }

  // A line on the document that the snapshot does not know, as it stands now. Only the event that shows
  // it arriving acts on it: any other event (an edit, say) cannot tell where the line came from.
  if (line && line.id === event.recordId && !line.deletedAt && idOf(line[key]) === document.id && !(line.id in snapshotLines)) {
    const arrival = arrivalOf(event, key, document.id);
    if (arrival) {
      const origin = arrival === 'added' ? null : await store.get(kind.plural, arrival.from, { deleted: true });
      if (arrival !== 'added' && origin && canTakeBack(kind, origin, line.id)) {
        await store.update(kind.linePlural, line.id, { [key]: arrival.from });
        corrections.add('moved');
      } else {
        await store.softDelete(kind.linePlural, line.id);
        corrections.add('added');
      }
    }
  }

  for (const correction of corrections) {
    await tell(store, kind, document, (pack) => {
      const words = { changed: pack.messages.lineChangePutBack, added: pack.messages.lineAddedRemoved, deleted: pack.messages.lineDeletedRestored, moved: pack.messages.lineMoveReverted };
      return words[correction](kind.kind);
    });
  }
}

/** The trigger of a line object: guards for issued documents, the catalog and totals for drafts. */
export async function onLineEvent(store: Store, kind: Kind, event: RecordEvent): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  const key = kind.parentKey;
  const line = await store.get(kind.linePlural, event.recordId, { deleted: true });
  const parentIds = [...new Set([event.before?.[key], event.after?.[key], line?.[key]].map(idOf).filter((id): id is string => id !== null))];
  const parents: Row[] = [];
  for (const id of parentIds) {
    const parent = await store.get(kind.plural, id, { deleted: true });
    if (parent) parents.push(parent);
  }

  for (const parent of parents) if (isIssued(kind, parent)) await reconcileIssuedLines(store, kind, parent, event, line);

  const drafts = parents.filter((parent) => !isIssued(kind, parent) && !parent.deletedAt);
  if (drafts.length === 0) return;
  const home = line && !line.deletedAt ? idOf(line[key]) : null;
  // The fill's own write brings the next event, which recomputes the totals.
  if (home !== null && drafts.some((draft) => draft.id === home) && (await fillFromCatalog(store, kind, event))) return;
  if (!lineChangeMatters(event)) return;
  for (const draft of drafts) await recomputeTotals(store, kind, draft.id);
}
