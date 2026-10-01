import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEntities } from './helpers/entities.ts';
import { objectId } from '../src/schema/fields.ts';
import { IDS } from '../src/ids.ts';

const views = await loadEntities('views');
const objects = await loadEntities('objects');
const objectsById = new Map(objects.map(({ result }) => [result.config.universalIdentifier, result.config]));

const EXPECTED = [
  ['invoices-drafts', 'Drafts', 'billingInvoice', 'TABLE'],
  ['invoices-unpaid', 'Unpaid', 'billingInvoice', 'TABLE'],
  ['invoices-overdue', 'Overdue', 'billingInvoice', 'TABLE'],
  ['invoices-paid', 'Paid', 'billingInvoice', 'TABLE'],
  ['quotes-open', 'Open', 'billingQuote', 'TABLE'],
  ['quotes-to-invoice', 'To invoice', 'billingQuote', 'TABLE'],
  ['quotes-pipeline', 'Pipeline', 'billingQuote', 'KANBAN'],
  ['credit-notes-drafts', 'Drafts', 'billingCreditNote', 'TABLE'],
] as const;

test('the eight views validate, each on its object', () => {
  assert.deepEqual(views.map((view) => view.file).sort(), EXPECTED.map(([file]) => `${file}.view.ts`).sort());
  for (const [file, name, object, type] of EXPECTED) {
    const { result } = views.find((view) => view.file === `${file}.view.ts`)!;
    assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
    assert.deepEqual([result.config.name, result.config.objectUniversalIdentifier, result.config.type], [name, objectId(object), type], file);
  }
});

test('every field and filter names a field of the view’s object, the label first, and each view has one sort', () => {
  for (const { file, result } of views) {
    const object = objectsById.get(result.config.objectUniversalIdentifier);
    const own = new Set(object.fields.map((field: any) => field.universalIdentifier));
    const named = [
      ...result.config.fields.map((field: any) => field.fieldMetadataUniversalIdentifier),
      ...(result.config.filters ?? []).map((filter: any) => filter.fieldMetadataUniversalIdentifier),
    ];
    for (const id of named) assert.ok(own.has(id), `${file}: ${id}`);
    assert.equal(result.config.fields[0].fieldMetadataUniversalIdentifier, object.labelIdentifierFieldMetadataUniversalIdentifier, `${file}: the label first`);
    assert.equal(result.config.sorts.length, 1, file);
  }
});

test('a status filter names options the status field has', () => {
  for (const { file, result } of views) {
    const object = objectsById.get(result.config.objectUniversalIdentifier);
    const status = object.fields.find((field: any) => field.name === 'status');
    for (const filter of result.config.filters ?? []) {
      if (filter.fieldMetadataUniversalIdentifier !== status.universalIdentifier) continue;
      const values = JSON.parse(filter.value) as string[];
      for (const value of values) assert.ok(status.options.some((option: any) => option.value === value), `${file}: ${value}`);
    }
  }
});

test('Overdue is the unpaid invoices whose due date is past', () => {
  const { result } = views.find((view) => view.file === 'invoices-overdue.view.ts')!;
  assert.deepEqual(result.config.filters.map((filter: any) => [filter.operand, filter.value]), [['IS', '["ISSUED","SENT"]'], ['IS_IN_PAST', '']]);
  assert.equal(result.config.universalIdentifier, IDS['view.invoicesOverdue']);
});

test('the Pipeline groups quotes by status', () => {
  const { result } = views.find((view) => view.file === 'quotes-pipeline.view.ts')!;
  const status = objectsById.get(objectId('billingQuote')).fields.find((field: any) => field.name === 'status');
  assert.equal(result.config.mainGroupByFieldMetadataUniversalIdentifier, status.universalIdentifier);
});
