import { minorDigits, toScaled } from '../engine/money.ts';
import { LINE_FIELDS } from './load.ts';
import { currencyOf, idOf, microsOf } from './map.ts';
import type { Row } from './store.ts';

/**
 * The flows between documents (flows spec §5, §6): what each copy takes, what
 * remains of an invoice, and whether a credit note fits it. Quantities are
 * counted in thousandths, the Engine's scale, never in floating point.
 */

/** A line as a snapshot keeps it, or a live line read the same way: its id and its fields. */
export type LineView = { id: string; fields: Readonly<Record<string, unknown>> };

/** What an invoice made from a quote copies from it (spec §5). */
export const FROM_QUOTE = ['subject', 'issuerId', 'companyId', 'personId', 'opportunityId', 'currencyCode', 'pricesIncludeTax', 'language', 'notes'] as const;

/** What a credit note copies from its invoice's snapshot (spec §6). */
export const FROM_INVOICE = ['subject', 'issuerId', 'companyId', 'personId', 'currencyCode', 'pricesIncludeTax', 'language'] as const;

/** The quotes that may become an invoice (spec §5). */
export const OPEN_QUOTE: readonly string[] = ['DRAFT', 'SENT', 'ACCEPTED'];

/** A quantity in thousandths; null when it is not a number with at most three decimals. */
export const thousandths = (value: unknown): bigint | null => (typeof value === 'number' ? toScaled(value, 3) : null);

/** Thousandths back to the number a NUMBER field holds: 3500n is 3.5. */
export const fromThousandths = (value: bigint): number => Number(value) / 1000;

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The given fields that hold a value; rich text as Twenty takes it back, by its markdown and blocks. */
function copyOf(row: Readonly<Record<string, unknown>>, fields: readonly string[]): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const field of fields) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    copy[field] = isObject(value) && 'markdown' in value ? { blocknote: value.blocknote ?? null, markdown: value.markdown ?? null } : value;
  }
  return copy;
}

const pick = (row: Readonly<Record<string, unknown>>, fields: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));

export const lineView = (row: Row): LineView => ({ id: row.id, fields: row });

/** The lines a document was issued with, from its snapshot, in the order they were printed. */
export function issuedLinesOf(document: Row): LineView[] {
  const record = isObject(document.snapshot) ? document.snapshot.record : undefined;
  const lines = isObject(record) ? record.lines : undefined;
  if (!isObject(lines)) return [];
  return Object.entries(lines).flatMap(([id, fields]) => (isObject(fields) ? [{ id, fields }] : []));
}

const samePrice = (a: unknown, b: unknown): boolean => {
  const micros = microsOf(a);
  return !Number.isNaN(micros) && micros === microsOf(b) && currencyOf(a) === currencyOf(b);
};

/** A discount in hundredths of a percent, an empty one as none; null when it is not a number. */
const discountOf = (value: unknown): bigint | null =>
  value === null || value === undefined || value === '' ? 0n : typeof value === 'number' ? toScaled(value, 2) : null;

/** Whether a credit-note line credits this invoice line, at its own price, discount and tax code (spec §6). */
export function matches(line: LineView, invoiceLine: LineView): boolean {
  const [credit, invoiced] = [line.fields, invoiceLine.fields];
  const discount = discountOf(credit.discountPercent);
  return (
    idOf(credit.invoiceLineId) === invoiceLine.id &&
    samePrice(credit.unitPrice, invoiced.unitPrice) &&
    discount !== null &&
    discount === discountOf(invoiced.discountPercent) &&
    idOf(credit.taxCodeId) === idOf(invoiced.taxCodeId)
  );
}

/** The quantity credited against each invoice line, in thousandths; null as soon as one line does not match. */
function creditedBy(invoiceLines: readonly LineView[], lines: readonly LineView[]): Map<string, bigint> | null {
  const credited = new Map<string, bigint>();
  for (const line of lines) {
    const target = invoiceLines.find((candidate) => candidate.id === idOf(line.fields.invoiceLineId));
    const quantity = thousandths(line.fields.quantity);
    if (!target || quantity === null || !matches(line, target)) return null;
    credited.set(target.id, (credited.get(target.id) ?? 0n) + quantity);
  }
  return credited;
}

export type RemainingLine = { invoiceLine: LineView; quantity: number };
export type Remainder = { known: true; lines: RemainingLine[] } | { known: false };

/** What remains to credit of each invoice line; unknown when one credited line does not match (spec §6). */
export function remainderOf(invoiceLines: readonly LineView[], credited: readonly LineView[]): Remainder {
  const totals = creditedBy(invoiceLines, credited);
  if (!totals) return { known: false };
  const lines: RemainingLine[] = [];
  for (const invoiceLine of invoiceLines) {
    const left = (thousandths(invoiceLine.fields.quantity) ?? 0n) - (totals.get(invoiceLine.id) ?? 0n);
    if (left > 0n) lines.push({ invoiceLine, quantity: fromThousandths(left) });
  }
  return { known: true, lines };
}

/** The remainder of an issued invoice, from its snapshot and those of its issued credit notes. */
export const invoiceRemainder = (invoice: Row, credits: readonly Row[]): Remainder =>
  remainderOf(issuedLinesOf(invoice), credits.flatMap(issuedLinesOf));

const totalOf = (credits: readonly Row[]): number =>
  credits.reduce((sum, note) => {
    const micros = microsOf(note.total);
    return Number.isNaN(micros) ? sum : sum + micros;
  }, 0);

/** Fully credited (spec §6): nothing remains, or its issued credit notes' totals reach the invoice's. */
export function fullyCredited(invoice: Row, credits: readonly Row[]): boolean {
  const remainder = invoiceRemainder(invoice, credits);
  if (remainder.known && remainder.lines.length === 0) return true;
  const total = microsOf(invoice.total);
  return credits.length > 0 && !Number.isNaN(total) && totalOf(credits) >= total;
}

/** A credit note as the gate weighs it: its live lines in print order, and the Engine's figures. */
export type DraftCredit = { lines: readonly Row[]; totalMicros: number; components: number; currencyCode: string };

/**
 * OVER_CREDIT (spec §6): null when the credit note fits what remains of its
 * invoice; else the position (from 1) of the first line that takes more than its
 * invoice line has left, or 0 when its total does. The margin of one minor unit
 * per tax component absorbs two documents rounding each component on their own.
 */
export function overCredit(invoice: Row, credits: readonly Row[], draft: DraftCredit): number | null {
  const invoiceLines = issuedLinesOf(invoice);
  const before = creditedBy(invoiceLines, credits.flatMap(issuedLinesOf));
  const views = draft.lines.map(lineView);
  if (before && creditedBy(invoiceLines, views)) {
    const running = new Map(before);
    for (const [index, line] of views.entries()) {
      // creditedBy found every target and every quantity.
      const target = invoiceLines.find((candidate) => candidate.id === idOf(line.fields.invoiceLineId))!;
      const sum = (running.get(target.id) ?? 0n) + thousandths(line.fields.quantity)!;
      running.set(target.id, sum);
      if (sum > (thousandths(target.fields.quantity) ?? 0n)) return index + 1;
    }
    return null;
  }
  const total = microsOf(invoice.total);
  if (Number.isNaN(total)) return null;
  const margin = draft.components * 10 ** (6 - minorDigits(draft.currencyCode));
  return draft.totalMicros > total - totalOf(credits) + margin ? 0 : null;
}

/** The draft invoice a quote becomes (spec §5). */
export function invoiceFromQuote(quote: Row): Record<string, unknown> {
  return { ...copyOf(quote, FROM_QUOTE), status: 'DRAFT', quoteId: quote.id };
}

/** The draft credit note of an issued invoice, from what was issued (spec §6). An empty reason is the person's to fill. */
export function creditNoteFromInvoice(invoice: Row, reason: string): Record<string, unknown> {
  const record = isObject(invoice.snapshot) && isObject(invoice.snapshot.record) ? invoice.snapshot.record.document : undefined;
  return { ...copyOf(isObject(record) ? record : {}, FROM_INVOICE), status: 'DRAFT', invoiceId: invoice.id, ...(reason === '' ? {} : { reason }) };
}

/** A line copied onto another document, under its parent key. */
export const lineCopy = (line: Row, parentKey: string, parentId: string): Record<string, unknown> => ({ ...pick(line, LINE_FIELDS), [parentKey]: parentId });

/** A credit note's lines, each linked to the line it credits: the remainder when known, else every issued line in full. */
export function creditLines(invoice: Row, remainder: Remainder): Record<string, unknown>[] {
  const lines: { invoiceLine: LineView; quantity: unknown }[] = remainder.known
    ? remainder.lines
    : issuedLinesOf(invoice).map((invoiceLine) => ({ invoiceLine, quantity: invoiceLine.fields.quantity }));
  return lines.map(({ invoiceLine, quantity }) => ({ ...pick(invoiceLine.fields, LINE_FIELDS), quantity, invoiceLineId: invoiceLine.id }));
}

/** Whether a draft credit note holds exactly the remainder, as a Cancel stopped at the gate left it. */
export function holdsExactly(lines: readonly Row[], remaining: readonly RemainingLine[]): boolean {
  if (lines.length !== remaining.length) return false;
  return remaining.every(({ invoiceLine, quantity }) => {
    const found = lines.filter((row) => idOf(row.invoiceLineId) === invoiceLine.id);
    return found.length === 1 && matches(lineView(found[0]!), invoiceLine) && thousandths(found[0]!.quantity) === thousandths(quantity);
  });
}
