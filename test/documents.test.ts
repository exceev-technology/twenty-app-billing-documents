import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APP_OBJECTS } from '../src/schema/names.ts';
import { fieldId } from '../src/schema/fields.ts';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const byName = new Map(objects.map(({ result }) => [result.config.nameSingular, result.config]));
const field = (object: string, name: string) => byName.get(object)?.fields.find((f: any) => f.name === name);
const values = (object: string, name: string) => field(object, name)?.options.map((o: any) => o.value);

test('the app declares exactly the fourteen objects of the spec', () => {
  assert.deepEqual([...byName.keys()].sort(), [...APP_OBJECTS].sort());
});

test('each document type has its own statuses, and starts as a draft', () => {
  assert.deepEqual(values('billingQuote', 'status'), ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'INVOICED']);
  assert.deepEqual(values('billingInvoice', 'status'), ['DRAFT', 'ISSUED', 'SENT', 'PAID', 'CANCELLED']);
  assert.deepEqual(values('billingCreditNote', 'status'), ['DRAFT', 'ISSUED']);
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    assert.equal(field(doc, 'status')?.defaultValue, "'DRAFT'", doc);
  }
});

test('a document is named by its subject, never by its number', () => {
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    assert.equal(byName.get(doc)?.labelIdentifierFieldMetadataUniversalIdentifier, fieldId(doc, 'subject'), doc);
  }
});

test('deleting a document deletes its lines', () => {
  assert.equal(field('billingQuoteLine', 'quote')?.universalSettings.onDelete, 'CASCADE');
  assert.equal(field('billingInvoiceLine', 'invoice')?.universalSettings.onDelete, 'CASCADE');
  assert.equal(field('billingCreditNoteLine', 'creditNote')?.universalSettings.onDelete, 'CASCADE');
});

test('an invoice links back to its quote and forward to its credit notes', () => {
  assert.equal(field('billingInvoice', 'quote')?.type, 'RELATION');
  assert.equal(field('billingQuote', 'invoices')?.universalSettings.relationType, 'ONE_TO_MANY');
  assert.equal(field('billingCreditNote', 'invoice')?.type, 'RELATION');
  assert.equal(field('billingInvoice', 'creditNotes')?.universalSettings.relationType, 'ONE_TO_MANY');
});

test('amounts are currency fields, and quantities keep three decimals', () => {
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    for (const name of ['subtotal', 'discountTotal', 'taxTotal', 'total']) assert.equal(field(doc, name)?.type, 'CURRENCY', `${doc}.${name}`);
  }
  for (const line of ['billingQuoteLine', 'billingInvoiceLine', 'billingCreditNoteLine']) {
    for (const name of ['unitPrice', 'lineTotal']) assert.equal(field(line, name)?.type, 'CURRENCY', `${line}.${name}`);
    assert.deepEqual(field(line, 'quantity')?.universalSettings, { dataType: 'float', decimals: 3 }, line);
  }
});

test('a document keeps up to ten PDFs and a frozen snapshot', () => {
  for (const doc of ['billingQuote', 'billingInvoice', 'billingCreditNote']) {
    assert.deepEqual(field(doc, 'pdf')?.universalSettings, { maxNumberOfValues: 10 }, doc);
    assert.equal(field(doc, 'snapshot')?.type, 'RAW_JSON', doc);
  }
});

test('the numbering ledger is keyed by issuer, document type and period', () => {
  for (const name of ['issuer', 'documentType', 'periodKey', 'lastValue']) assert.ok(field('billingSequence', name), name);
});
