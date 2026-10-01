import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  creditLines, creditNoteFromInvoice, fromThousandths, fullyCredited, holdsExactly, invoiceFromQuote, invoiceRemainder,
  issuedLinesOf, lineCopy, matches, overCredit, remainderOf, thousandths, type LineView,
} from '../../lifecycle/flows.ts';
import type { Row } from '../../lifecycle/store.ts';
import { markdown, money } from './helpers/fixtures.ts';

const VAT = 'tax-vat-20';

/** A line's fields, as a snapshot keeps them. */
const fields = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  description: 'Jour', sortOrder: 1, catalogItemId: null, quantity: 4, unit: 'DAY', unitPrice: money(500_000_000),
  discountPercent: null, taxCodeId: VAT, periodStart: null, periodEnd: null, ...over,
});
const view = (id: string, over: Record<string, unknown> = {}): LineView => ({ id, fields: fields(over) });
const credit = (id: string, invoiceLineId: string | null, quantity: number, over: Record<string, unknown> = {}): LineView =>
  view(id, { invoiceLineId, quantity, ...over });

/** An issued document: its snapshot's record holds its fields and its lines. */
const issued = (id: string, lines: LineView[], over: Record<string, unknown> = {}, document: Record<string, unknown> = {}): Row => ({
  id, status: 'ISSUED', total: money(0), ...over,
  snapshot: { printed: {}, record: { document: { id, ...document }, lines: Object.fromEntries(lines.map((line) => [line.id, line.fields])) } },
});

const A = view('line-a', { quantity: 4 });
const B = view('line-b', { quantity: 1, unitPrice: money(1_200_000_000) });
const invoice = issued('invoice-1', [A, B], { total: money(3_840_000_000) });

test('quantities are counted in thousandths, never in floating point', () => {
  assert.equal(thousandths(0.333), 333n);
  assert.equal(thousandths(4), 4000n);
  assert.equal(thousandths(1.2345), null);
  assert.equal(thousandths('2'), null);
  assert.equal(fromThousandths(3500n), 3.5);
  assert.equal(fromThousandths(333n + 333n + 334n), 1);
});

test('the lines a document was issued with come from its snapshot, in print order; a draft has none', () => {
  assert.deepEqual(issuedLinesOf(invoice).map((line) => line.id), ['line-a', 'line-b']);
  assert.deepEqual(issuedLinesOf({ id: 'draft', snapshot: null }), []);
});

/** A document whose snapshot keeps its record's lines under their ids, and optionally the lines as they were printed. */
const snapshotOf = (lines: Record<string, Record<string, unknown>>, printed: Record<string, unknown> = {}): Row => ({
  id: 'doc', snapshot: { printed, record: { document: { id: 'doc' }, lines } },
});

test('the printed lines give the order, whatever order the stored record comes back in', () => {
  // jsonb keeps no key order: the record's keys come back in any order, here a-second first.
  const document = snapshotOf(
    { 'a-second': fields({ sortOrder: 1 }), 'z-first': fields({ sortOrder: 3 }) },
    { lines: [{ key: 'z-first' }, { key: 'a-second' }] },
  );
  assert.deepEqual(issuedLinesOf(document).map((line) => line.id), ['z-first', 'a-second']);
});

test('a line the printed lines do not list comes after them, by sortOrder with none last, then by id', () => {
  const document = snapshotOf(
    { 'a-late': fields({ sortOrder: null }), 'c-late': fields({ sortOrder: null }), 'b-late': fields({ sortOrder: 1 }), 'z-first': fields({ sortOrder: 9 }) },
    { lines: [{ key: 'z-first' }, { key: 'gone' }] },
  );
  assert.deepEqual(issuedLinesOf(document).map((line) => line.id), ['z-first', 'b-late', 'a-late', 'c-late']);
});

test('without printed lines, the lines fall back to sortOrder, then id', () => {
  const stored = { y: fields({ sortOrder: 3 }), z: fields({ sortOrder: 2 }), w: fields({ sortOrder: null }), x: fields({ sortOrder: 1 }), v: fields({ sortOrder: 2 }) };
  assert.deepEqual(issuedLinesOf(snapshotOf(stored)).map((line) => line.id), ['x', 'v', 'z', 'y', 'w']);
  assert.deepEqual(issuedLinesOf(snapshotOf(stored, { lines: 'not a list' })).map((line) => line.id), ['x', 'v', 'z', 'y', 'w']);
});

test('a credit line matches its invoice line at the same price, discount and tax code', () => {
  assert.equal(matches(credit('c1', 'line-a', 1), A), true);
  assert.equal(matches(credit('c1', 'line-a', 1, { discountPercent: 0 }), A), true, 'an empty discount is none');
  assert.equal(matches(credit('c1', 'line-a', 1, { unitPrice: money(450_000_000) }), A), false);
  assert.equal(matches(credit('c1', 'line-a', 1, { unitPrice: money(500_000_000, 'CHF') }), A), false);
  assert.equal(matches(credit('c1', 'line-a', 1, { discountPercent: 10 }), A), false);
  assert.equal(matches(credit('c1', 'line-a', 1, { taxCodeId: 'tax-other' }), A), false);
  assert.equal(matches(credit('c1', 'line-b', 1), A), false);
  assert.equal(matches(credit('c1', null, 1), A), false);
});

test('the remainder is each invoice line less what matching credit lines took', () => {
  assert.deepEqual(remainderOf([A, B], []), { known: true, lines: [{ invoiceLine: A, quantity: 4 }, { invoiceLine: B, quantity: 1 }] });
  assert.deepEqual(remainderOf([A, B], [credit('c1', 'line-a', 1.5)]), { known: true, lines: [{ invoiceLine: A, quantity: 2.5 }, { invoiceLine: B, quantity: 1 }] });
  assert.deepEqual(remainderOf([A, B], [credit('c1', 'line-a', 1.5), credit('c2', 'line-a', 2.5), credit('c3', 'line-b', 1, { unitPrice: money(1_200_000_000) })]), { known: true, lines: [] });
});

test('three thirds credit a whole line exactly', () => {
  const one = view('line-one', { quantity: 1 });
  const thirds = [credit('t1', 'line-one', 0.333), credit('t2', 'line-one', 0.333), credit('t3', 'line-one', 0.334)];
  assert.deepEqual(remainderOf([one], thirds), { known: true, lines: [] });
  assert.deepEqual(remainderOf([one], thirds.slice(0, 2)), { known: true, lines: [{ invoiceLine: one, quantity: 0.334 }] });
});

test('the remainder is unknown once a credit line changed a price, has no link, or came before 4b', () => {
  assert.deepEqual(remainderOf([A, B], [credit('c1', 'line-a', 1, { unitPrice: money(400_000_000) })]), { known: false });
  assert.deepEqual(remainderOf([A, B], [credit('c1', null, 1)]), { known: false });
  const before4b = view('c-old', { quantity: 1 }); // a snapshot line with no invoiceLineId at all
  assert.deepEqual(remainderOf([A, B], [before4b]), { known: false });
});

test('the remainder of an invoice reads its snapshot and its issued credit notes’ snapshots', () => {
  const note = issued('note-1', [credit('c1', 'line-b', 1, { unitPrice: money(1_200_000_000) })]);
  assert.deepEqual(invoiceRemainder(invoice, [note]), { known: true, lines: [{ invoiceLine: A, quantity: 4 }] });
});

test('an invoice is fully credited when nothing remains, or when its credit notes’ totals reach its own', () => {
  const all = issued('note-1', [credit('c1', 'line-a', 4), credit('c2', 'line-b', 1, { unitPrice: money(1_200_000_000) })]);
  assert.equal(fullyCredited(invoice, [all]), true);
  const part = issued('note-2', [credit('c1', 'line-a', 1)], { total: money(600_000_000) });
  assert.equal(fullyCredited(invoice, [part]), false);
  const byHand = issued('note-3', [view('h1', { quantity: 1, unitPrice: money(3_200_000_000) })], { total: money(3_840_000_000) });
  assert.equal(fullyCredited(invoice, [byHand]), true, 'unlinked, but its total reaches the invoice’s');
  const short = issued('note-4', [view('h1', { quantity: 1 })], { total: money(3_839_990_000) });
  assert.equal(fullyCredited(invoice, [short]), false);
  assert.equal(fullyCredited(invoice, []), false);
  assert.equal(fullyCredited(issued('invoice-empty', []), []), false, 'no line and no credit note is not a credited invoice');
});

const draftOf = (lines: Row[], totalMicros = 0, components = 1) => ({ lines, totalMicros, components, currencyCode: 'EUR' });
const liveLine = (id: string, invoiceLineId: string | null, quantity: number, over: Record<string, unknown> = {}): Row => ({ id, ...fields({ invoiceLineId, quantity, ...over }) });
const B_PRICE = { unitPrice: money(1_200_000_000) };

test('a linked credit note may not credit more of a line than it has left, and names the line', () => {
  assert.equal(overCredit(invoice, [], draftOf([liveLine('d1', 'line-a', 4), liveLine('d2', 'line-b', 1, B_PRICE)])), null);
  assert.equal(overCredit(invoice, [], draftOf([liveLine('d1', 'line-b', 1, B_PRICE), liveLine('d2', 'line-a', 5)])), 2);
  const earlier = issued('note-1', [credit('c1', 'line-a', 3)]);
  assert.equal(overCredit(invoice, [earlier], draftOf([liveLine('d1', 'line-a', 1)])), null);
  assert.equal(overCredit(invoice, [earlier], draftOf([liveLine('d1', 'line-a', 1.001)])), 1);
  assert.equal(overCredit(invoice, [], draftOf([liveLine('d1', 'line-a', 2), liveLine('d2', 'line-a', 2.5)])), 2, 'two lines on one invoice line add up');
});

test('otherwise its total may not exceed what remains by more than one minor unit per tax component', () => {
  const byHand = issued('note-1', [view('h1', { quantity: 1 })], { total: money(1_000_000_000) });
  const left = 3_840_000_000 - 1_000_000_000;
  assert.equal(overCredit(invoice, [byHand], draftOf([liveLine('d1', null, 1)], left + 10_000, 1)), null);
  assert.equal(overCredit(invoice, [byHand], draftOf([liveLine('d1', null, 1)], left + 20_000, 1)), 0);
  assert.equal(overCredit(invoice, [byHand], draftOf([liveLine('d1', null, 1)], left + 20_000, 2)), null);
});

const R = view('line-r', { quantity: -1, unitPrice: money(300_000_000) });
const rebate = issued('invoice-r', [A, R], { total: money(1_700_000_000) });
const R_PRICE = { unitPrice: money(300_000_000) };

test('a rebate line is credited by a negative quantity, and stays in the remainder until it is', () => {
  assert.deepEqual(remainderOf([A, R], []), { known: true, lines: [{ invoiceLine: A, quantity: 4 }, { invoiceLine: R, quantity: -1 }] });
  assert.deepEqual(remainderOf([A, R], [credit('c1', 'line-r', -1, R_PRICE)]), { known: true, lines: [{ invoiceLine: A, quantity: 4 }] });
  assert.deepEqual(remainderOf([A, R], [credit('c1', 'line-r', -0.4, R_PRICE)]), { known: true, lines: [{ invoiceLine: A, quantity: 4 }, { invoiceLine: R, quantity: -0.6 }] });
  assert.equal(matches(credit('c1', 'line-r', -1, R_PRICE), R), true);
  assert.equal(matches(credit('c1', 'line-r', 1, R_PRICE), R), false, 'a positive credit does not undo a rebate');
  assert.equal(matches(credit('c1', 'line-a', -1), A), false, 'a negative credit does not undo a charge');
  assert.equal(matches(credit('c1', 'line-a', 0), A), false, 'a credit of nothing credits nothing');
  assert.deepEqual(remainderOf([A, R], [credit('c1', 'line-r', 1, R_PRICE)]), { known: false });
  assert.deepEqual(remainderOf([A, R], [credit('c1', 'line-a', 0)]), { known: false });
});

test('a rebate line may not be credited by more than its own quantity', () => {
  assert.equal(overCredit(rebate, [], draftOf([liveLine('d1', 'line-r', -1, R_PRICE)])), null);
  assert.equal(overCredit(rebate, [], draftOf([liveLine('d1', 'line-r', -2, R_PRICE)])), 1);
  assert.equal(overCredit(rebate, [], draftOf([liveLine('d1', 'line-a', 4), liveLine('d2', 'line-r', -2, R_PRICE)])), 2);
  const earlier = issued('note-1', [credit('c1', 'line-r', -1, R_PRICE)]);
  assert.equal(overCredit(rebate, [earlier], draftOf([liveLine('d1', 'line-r', -1, R_PRICE)])), 1);
});

test('a credit note of a rebate line takes it at its negative quantity', () => {
  const [line] = creditLines(rebate, { known: true, lines: [{ invoiceLine: R, quantity: -1 }] });
  assert.equal(line!.quantity, -1);
  assert.equal(line!.invoiceLineId, 'line-r');
});

test('an invoice made from a quote copies its parties, currency, basis, language and notes, and nothing issued', () => {
  const quote: Row = {
    id: 'quote-1', subject: 'Refonte', issuerId: 'issuer-1', companyId: 'company-1', personId: null, opportunityId: 'opp-1',
    currencyCode: 'EUR', pricesIncludeTax: false, language: 'FR', notes: { blocknote: '[{"id":"b"}]', markdown: 'Merci', extra: 1 },
    number: 'D2026-0001', numberKey: 'issuer-1:D2026-0001', status: 'ACCEPTED', issueDate: '2026-09-01', validUntil: '2026-10-01',
    pdf: [{ fileId: 'f', label: 'D2026-0001 v1.pdf' }], total: money(10), version: 1,
  };
  assert.deepEqual(invoiceFromQuote(quote), {
    subject: 'Refonte', issuerId: 'issuer-1', companyId: 'company-1', opportunityId: 'opp-1', currencyCode: 'EUR',
    pricesIncludeTax: false, language: 'FR', notes: { blocknote: '[{"id":"b"}]', markdown: 'Merci' }, status: 'DRAFT', quoteId: 'quote-1',
  });
});

test('a credit note copies its invoice as issued, from the snapshot, and gets a reason only when given one', () => {
  const issuedInvoice = issued('invoice-1', [A], {}, {
    subject: 'Identité', issuerId: 'issuer-1', companyId: 'company-1', personId: 'person-1', currencyCode: 'EUR', pricesIncludeTax: true,
    language: 'FR', notes: markdown('x'), dueDate: '2026-10-26', buyerReference: 'BC-1',
  });
  assert.deepEqual(creditNoteFromInvoice(issuedInvoice, ''), {
    subject: 'Identité', issuerId: 'issuer-1', companyId: 'company-1', personId: 'person-1', currencyCode: 'EUR',
    pricesIncludeTax: true, language: 'FR', status: 'DRAFT', invoiceId: 'invoice-1',
  });
  assert.equal(creditNoteFromInvoice(issuedInvoice, 'Annulation de la facture F2026-0001').reason, 'Annulation de la facture F2026-0001');
});

test('a credit note’s lines are the remainder, each linked, or every issued line in full when the remainder is unknown', () => {
  const known = creditLines(invoice, { known: true, lines: [{ invoiceLine: A, quantity: 2.5 }] });
  assert.deepEqual(known, [{ ...fields({ quantity: 2.5 }), invoiceLineId: 'line-a' }]);
  const unknown = creditLines(invoice, { known: false });
  assert.deepEqual(unknown.map((line) => [line.invoiceLineId, line.quantity]), [['line-a', 4], ['line-b', 1]]);
});

test('a stopped Cancel’s draft is recognised by holding exactly the remainder', () => {
  const remaining = [{ invoiceLine: A, quantity: 4 }, { invoiceLine: B, quantity: 1 }];
  const exact = [liveLine('d1', 'line-a', 4), liveLine('d2', 'line-b', 1, B_PRICE)];
  assert.equal(holdsExactly(exact, remaining), true);
  assert.equal(holdsExactly(exact.slice(0, 1), remaining), false);
  assert.equal(holdsExactly([liveLine('d1', 'line-a', 3), exact[1]!], remaining), false);
  assert.equal(holdsExactly([...exact, liveLine('d3', null, 1)], remaining), false);
});

test('a copied line takes the line fields and its new parent', () => {
  const line: Row = { id: 'q1', quoteId: 'quote-1', lineTotal: money(5), ...fields() };
  assert.deepEqual(lineCopy(line, 'invoiceId', 'invoice-9'), { ...fields(), invoiceId: 'invoice-9' });
});
