import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataWritability } from 'twenty-sdk/define';
import { loadEntities } from './helpers/entities.ts';
import { fieldId } from '../src/schema/fields.ts';
import { CREDIT_LINE_FIELDS, KINDS, LINE_FIELDS } from '../lifecycle/load.ts';

const objects = await loadEntities('objects');
const byName = new Map(objects.map(({ result }) => [result.config.nameSingular, result.config]));
const field = (object: string, name: string) => byName.get(object)?.fields.find((f: any) => f.name === name);

test('a credit-note line links the invoice line it credits, a link only the app sets', () => {
  const link = field('billingCreditNoteLine', 'invoiceLine');
  assert.equal(link?.type, 'RELATION');
  assert.equal(link?.writability, MetadataWritability.APPLICATION);
  assert.deepEqual(link?.universalSettings, { relationType: 'MANY_TO_ONE', onDelete: 'SET_NULL', joinColumnName: 'invoiceLineId' });
  assert.equal(link?.relationTargetFieldMetadataUniversalIdentifier, fieldId('billingInvoiceLine', 'creditNoteLines'));
  const reverse = field('billingInvoiceLine', 'creditNoteLines');
  assert.equal(reverse?.universalSettings.relationType, 'ONE_TO_MANY');
  assert.equal(reverse?.relationTargetFieldMetadataUniversalIdentifier, fieldId('billingCreditNoteLine', 'invoiceLine'));
});

test('a quote records when it was first sent, a date people may change', () => {
  assert.equal(field('billingQuote', 'sentAt')?.type, 'DATE_TIME');
  assert.equal(field('billingQuote', 'sentAt')?.writability, undefined);
});

test('an issued credit note locks the invoice line each of its lines credits', () => {
  assert.deepEqual(CREDIT_LINE_FIELDS, [...LINE_FIELDS, 'invoiceLineId']);
  assert.deepEqual(KINDS.billingCreditNote.lineFields, CREDIT_LINE_FIELDS);
  assert.deepEqual(KINDS.billingInvoice.lineFields, LINE_FIELDS);
  assert.deepEqual(KINDS.billingQuote.lineFields, LINE_FIELDS);
});
