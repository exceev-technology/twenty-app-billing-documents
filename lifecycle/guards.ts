import { PACKS, type Language, type LifecyclePack, type StatusKey, type StatusRule } from './lang/pack.ts';
import { isIssued, type Kind } from './load.ts';
import { idOf, textOf } from './map.ts';
import { packForIssuer } from './numbering.ts';
import { leaveMessage, sourceOf, type RecordEvent, type Row, type Store } from './store.ts';
import { documentChangeMatters, fillFromCatalog, lineChangeMatters, recomputeTotals } from './totals.ts';

/**
 * The three status rules of spec §7. Only a person's move is checked: the app's
 * are always allowed. Null when the move is free.
 */
export function statusRuleBroken(kind: Kind, from: string, to: string, state: { numbered: boolean; issued: boolean }): StatusRule | null {
  if (from === to) return null;
  // A quote returns before the three rules below: they are worded for invoices and credit notes only.
  if (kind.kind === 'QUOTE') return to === 'INVOICED' ? 'INVOICED' : null;
  if (to === 'ISSUED' && !state.issued) return 'ISSUE';
  if (state.numbered && to === 'DRAFT') return 'DRAFT';
  if (state.numbered && to === 'CANCELLED') return 'CANCEL';
  return null;
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
async function packForDocument(store: Store, document: Row): Promise<LifecyclePack> {
  return PACKS[textOf(document.language) as Language] ?? packForIssuer(store, document.issuerId);
}

async function tell(store: Store, kind: Kind, document: Row, text: (pack: LifecyclePack) => string): Promise<void> {
  const pack = await packForDocument(store, document);
  await leaveMessage(store, { object: kind.object, recordId: document.id, kind: 'CORRECTION', text: text(pack) });
}

const statusName = (pack: LifecyclePack, status: string): string => pack.statuses[status as StatusKey] ?? status;

/** The trigger of a document object (spec §7, §8). */
export async function onDocumentEvent(store: Store, kind: Kind, event: RecordEvent): Promise<void> {
  if (event.name === 'destroyed' || event.name === 'upserted') return;
  const document = await store.get(kind.plural, event.recordId, { deleted: true });
  if (!document) return;
  const issued = isIssued(kind, document);
  const numbered = Boolean(document.numberKey);

  if (event.name === 'deleted') {
    if (document.deletedAt && (issued || numbered)) {
      await store.restore(kind.plural, document.id);
      await tell(store, kind, document, (pack) => pack.messages.documentRestored(kind.kind, textOf(document.number)));
    }
    return;
  }
  if (event.name === 'restored') return;
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
    const rule = statusRuleBroken(kind, from, textOf(document.status), { numbered, issued });
    if (rule) {
      patch.status = from;
      messages.push((pack) => pack.messages.statusPutBack(rule, kind.kind, statusName(pack, from)));
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
    for (const message of messages) await tell(store, kind, document, message);
  }
  if (!issued && documentChangeMatters(event)) await recomputeTotals(store, kind, document.id);
}

type LineCorrection = 'changed' | 'added' | 'deleted' | 'moved';

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

  // A line on the document that the snapshot does not know. Only its own event acts on it:
  // another event cannot tell where it came from.
  if (line && line.id === event.recordId && !line.deletedAt && idOf(line[key]) === document.id && !(line.id in snapshotLines)) {
    const from = idOf(event.before?.[key]);
    if (event.name === 'updated' && from !== null && from !== document.id) {
      await store.update(kind.linePlural, line.id, { [key]: from });
      corrections.add('moved');
    } else {
      await store.softDelete(kind.linePlural, line.id);
      corrections.add('added');
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
