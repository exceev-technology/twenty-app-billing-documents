import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS } from '../../lifecycle/load.ts';
import type { RecordEvent } from '../../lifecycle/store.ts';
import { EMPTY_MONEY, documentChangeMatters, fillFromCatalog, lineChangeMatters, recomputeTotals, sameMoney } from '../../lifecycle/totals.ts';
import { money, workspace, type Workspace } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const eur = (micros: number) => money(micros, 'EUR');

const totalsOf = (w: Workspace, id: string) => {
  const row = w.db.row('billingInvoices', id)!;
  return { subtotal: row.subtotal, discountTotal: row.discountTotal, taxTotal: row.taxTotal, total: row.total };
};
const lineTotals = (w: Workspace) => w.lines.map((line) => w.db.row('billingInvoiceLines', line.id)!.lineTotal);

const event = (over: Partial<RecordEvent>): RecordEvent => ({ name: 'updated', recordId: 'r', before: null, after: null, updatedFields: [], ...over });

test('a draft’s totals are computed and written: each line, then the document', async () => {
  const w = workspace();
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.deepEqual(lineTotals(w), [eur(3_120_000_000), eur(3_840_000_000), eur(1_200_000_000)]);
  assert.deepEqual(totalsOf(w, w.invoice.id), {
    subtotal: eur(8_160_000_000), discountTotal: eur(0), taxTotal: eur(1_632_000_000), total: eur(9_792_000_000),
  });
});

test('only the values that differ are written, so a second run writes nothing', async () => {
  const w = workspace();
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  const writes = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.equal(w.db.writes.length, writes);
  await w.user.update('billingInvoiceLines', w.lines[2]!.id, { quantity: 2 });
  const before = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  const written = w.db.writes.slice(before).map((write) => `${write.plural}:${Object.keys(write.data ?? {}).sort().join(',')}`);
  assert.deepEqual(written, ['billingInvoiceLines:lineTotal', 'billingInvoices:subtotal,taxTotal,total']);
});

test('a problem empties the totals: a total that ignores an incomplete line would mislead', async () => {
  const w = workspace();
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  await w.user.update('billingInvoiceLines', w.lines[1]!.id, { taxCodeId: null });
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.deepEqual(lineTotals(w), [EMPTY_MONEY, EMPTY_MONEY, EMPTY_MONEY]);
  assert.deepEqual(totalsOf(w, w.invoice.id), { subtotal: EMPTY_MONEY, discountTotal: EMPTY_MONEY, taxTotal: EMPTY_MONEY, total: EMPTY_MONEY });
  const writes = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.equal(w.db.writes.length, writes);
});

test('a draft without a currency yet is totalled in the currency it will carry', async () => {
  const w = workspace();
  const invoice = w.addInvoice({ currencyCode: '' });
  w.addLine(INVOICE, invoice.id, { quantity: 1, unitPrice: eur(100_000_000) });
  await recomputeTotals(w.app, INVOICE, invoice.id);
  assert.deepEqual(w.db.row('billingInvoices', invoice.id)!.total, eur(120_000_000));
  assert.equal(w.db.row('billingInvoices', invoice.id)!.currencyCode, '', 'the currency itself is filled by an action, not here');
});

test('the rounding follows the issuer’s profile', async () => {
  const w = workspace();
  const reduced = w.db.seed('billingTaxCodes', { name: 'TVA 5,5 %', category: 'REDUCED' });
  w.db.seed('billingTaxComponents', { name: 'TVA', taxCodeId: reduced.id, rate: 5.5, compound: false, sortOrder: 0 });
  const invoice = w.addInvoice();
  for (let n = 1; n <= 3; n++) w.addLine(INVOICE, invoice.id, { sortOrder: n, quantity: 1, unitPrice: eur(100_000), taxCodeId: reduced.id });
  await recomputeTotals(w.app, INVOICE, invoice.id);
  assert.deepEqual(w.db.row('billingInvoices', invoice.id)!.taxTotal, eur(20_000), 'on the total: 0.30 × 5.5 % = 0.0165, rounded to 0.02');
  await w.app.update('billingProfiles', w.profile.id, { roundingMode: 'PER_LINE' });
  await recomputeTotals(w.app, INVOICE, invoice.id);
  assert.deepEqual(w.db.row('billingInvoices', invoice.id)!.taxTotal, eur(30_000), 'per line: 3 × 0.01');
});

test('an issued document and a deleted one are left alone', async () => {
  const w = workspace();
  const issued = w.addInvoice({ snapshot: { printed: {}, record: {} } });
  w.addLine(INVOICE, issued.id);
  await recomputeTotals(w.app, INVOICE, issued.id);
  await w.app.softDelete('billingInvoices', w.invoice.id);
  const writes = w.db.writes.length;
  await recomputeTotals(w.app, INVOICE, w.invoice.id);
  assert.equal(w.db.writes.length, writes);
  assert.deepEqual(w.db.row('billingInvoices', issued.id)!.total, EMPTY_MONEY);
});

test('a quote’s totals are kept too, whatever its status', async () => {
  const w = workspace();
  const quote = w.addQuote({ status: 'SENT' });
  w.addLine(KINDS.billingQuote, quote.id, { quantity: 2, unitPrice: eur(50_000_000) });
  await recomputeTotals(w.app, KINDS.billingQuote, quote.id);
  assert.deepEqual(w.db.row('billingQuotes', quote.id)!.total, eur(120_000_000));
});

test('an empty amount equals an empty amount, whatever its currency', () => {
  assert.equal(sameMoney({ amountMicros: null, currencyCode: 'EUR' }, EMPTY_MONEY), true);
  assert.equal(sameMoney(eur(1), eur(1)), true);
  assert.equal(sameMoney(eur(1), money(1, 'USD')), false);
  assert.equal(sameMoney(null, eur(0)), false);
});

test('a line event matters unless it changed lineTotal alone', () => {
  for (const name of ['created', 'deleted', 'restored'] as const) assert.equal(lineChangeMatters(event({ name })), true, name);
  assert.equal(lineChangeMatters(event({ updatedFields: ['lineTotal', 'updatedBy'] })), false);
  assert.equal(lineChangeMatters(event({ updatedFields: ['updatedBy'] })), false);
  assert.equal(lineChangeMatters(event({ updatedFields: ['quantity', 'updatedBy'] })), true);
  assert.equal(lineChangeMatters(event({ updatedFields: ['invoice', 'invoiceId'] })), true);
  assert.equal(lineChangeMatters(event({ name: 'destroyed' })), false);
});

test('a document event matters when its currency, price basis or issuer changed', () => {
  assert.equal(documentChangeMatters(event({ updatedFields: ['currencyCode'] })), true);
  assert.equal(documentChangeMatters(event({ updatedFields: ['pricesIncludeTax', 'updatedBy'] })), true);
  assert.equal(documentChangeMatters(event({ updatedFields: ['issuer', 'issuerId'] })), true);
  assert.equal(documentChangeMatters(event({ updatedFields: ['subject'] })), false);
  assert.equal(documentChangeMatters(event({ name: 'created' })), false);
});

test('a line created with a catalog item takes the item’s values into its empty fields, the default unit included', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { name: 'Atelier', description: 'Atelier d’une journée', unit: 'DAY', unitPrice: eur(900_000_000), taxCodeId: w.vat20.id });
  const invoice = w.addInvoice();
  const line = await w.user.create('billingInvoiceLines', { invoiceId: invoice.id, catalogItemId: item.id, description: '', unit: 'UNIT', unitPrice: money(null, ''), taxCodeId: null, quantity: 1 });
  const created = w.db.takeEvents().find((recorded) => recorded.recordId === line.id)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, created), true);
  const filled = w.db.row('billingInvoiceLines', line.id)!;
  assert.deepEqual([filled.description, filled.unit, filled.unitPrice, filled.taxCodeId], ['Atelier d’une journée', 'DAY', eur(900_000_000), w.vat20.id]);
});

test('what the person typed on a new line is kept', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { description: 'Atelier', unit: 'DAY', unitPrice: eur(900_000_000), taxCodeId: w.vat20.id });
  const line = await w.user.create('billingInvoiceLines', { invoiceId: w.invoice.id, catalogItemId: item.id, description: 'Atelier, tarif négocié', unit: 'HOUR', unitPrice: eur(80_000_000), taxCodeId: w.franchise.id });
  const created = w.db.takeEvents().find((recorded) => recorded.recordId === line.id)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, created), false);
});

test('a changed catalog item replaces the four fields; an emptied one changes nothing', async () => {
  const w = workspace();
  const item = w.db.seed('billingCatalogItems', { description: 'Conseil', unit: 'HOUR', unitPrice: eur(120_000_000), taxCodeId: w.vat20.id });
  const line = w.lines[0]!;
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: item.id });
  const changed = w.db.takeEvents().find((recorded) => recorded.recordId === line.id)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, changed), true);
  const replaced = w.db.row('billingInvoiceLines', line.id)!;
  assert.deepEqual([replaced.description, replaced.unit, replaced.unitPrice], ['Conseil', 'HOUR', eur(120_000_000)]);
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: null });
  const cleared = w.db.takeEvents().find((recorded) => recorded.recordId === line.id && recorded.name === 'updated' && recorded.after?.catalogItemId === null)!;
  assert.equal(await fillFromCatalog(w.app, INVOICE, cleared), false);
});

test('an item changed again before the fill ran is left to its own event', async () => {
  const w = workspace();
  const first = w.db.seed('billingCatalogItems', { description: 'First', unit: 'DAY', unitPrice: eur(1_000_000), taxCodeId: w.vat20.id });
  const second = w.db.seed('billingCatalogItems', { description: 'Second', unit: 'DAY', unitPrice: eur(2_000_000), taxCodeId: w.vat20.id });
  const line = w.lines[0]!;
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: first.id });
  await w.user.update('billingInvoiceLines', line.id, { catalogItemId: second.id });
  const [toFirst] = w.db.takeEvents().filter((recorded) => recorded.recordId === line.id);
  assert.equal(await fillFromCatalog(w.app, INVOICE, toFirst!), false);
});
