import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFieldUniversalIdentifier } from 'twenty-sdk/define';
import { loadEntities } from './helpers/entities.ts';
import { fieldId, objectId } from '../src/schema/fields.ts';
import { id } from '../src/lib/id.ts';
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

/** Twenty declares createdAt and updatedAt on every object, under identifiers the SDK derives. */
const SYSTEM_FIELDS = ['createdAt', 'updatedAt'];
const systemFieldId = (object: string, name: string): string =>
  getFieldUniversalIdentifier({ applicationUniversalIdentifier: id('app'), objectUniversalIdentifier: objectId(object), name });
/** A field of an object of the app, system fields included. */
const fieldOf = (object: string, name: string): string => (SYSTEM_FIELDS.includes(name) ? systemFieldId(object, name) : fieldId(object, name));

test('the eight views validate, each on its object', () => {
  assert.deepEqual(views.map((view) => view.file).sort(), EXPECTED.map(([file]) => `${file}.view.ts`).sort());
  for (const [file, name, object, type] of EXPECTED) {
    const { result } = views.find((view) => view.file === `${file}.view.ts`)!;
    assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
    assert.deepEqual([result.config.name, result.config.objectUniversalIdentifier, result.config.type], [name, objectId(object), type], file);
  }
});

test('every field, filter and sort names a field of the view’s object, the label first, and each view has one sort', () => {
  for (const { file, result } of views) {
    const object = objectsById.get(result.config.objectUniversalIdentifier);
    const own = new Set([
      ...object.fields.map((field: any) => field.universalIdentifier),
      ...SYSTEM_FIELDS.map((name) => getFieldUniversalIdentifier({ applicationUniversalIdentifier: id('app'), objectUniversalIdentifier: object.universalIdentifier, name })),
    ]);
    const named = [
      ...result.config.fields.map((field: any) => field.fieldMetadataUniversalIdentifier),
      ...(result.config.filters ?? []).map((filter: any) => filter.fieldMetadataUniversalIdentifier),
      ...result.config.sorts.map((sort: any) => sort.fieldMetadataUniversalIdentifier),
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

/** Flows spec §9, row by row: the label first, then these fields; these filters; this one sort. */
const SPEC: Record<string, { object: string; fields: string[]; filters: [field: string, operand: string, value: string][]; sort: [field: string, direction: string] }> = {
  'invoices-drafts': {
    object: 'billingInvoice',
    fields: ['subject', 'issuer', 'company', 'person', 'total', 'updatedAt'],
    filters: [['status', 'IS', '["DRAFT"]']],
    sort: ['updatedAt', 'DESC'],
  },
  'invoices-unpaid': {
    object: 'billingInvoice',
    fields: ['subject', 'number', 'company', 'person', 'issueDate', 'dueDate', 'total', 'status'],
    filters: [['status', 'IS', '["ISSUED","SENT"]']],
    sort: ['dueDate', 'ASC'],
  },
  'invoices-overdue': {
    object: 'billingInvoice',
    fields: ['subject', 'number', 'company', 'person', 'dueDate', 'total', 'sentAt'],
    filters: [['status', 'IS', '["ISSUED","SENT"]'], ['dueDate', 'IS_IN_PAST', '']],
    sort: ['dueDate', 'ASC'],
  },
  'invoices-paid': {
    object: 'billingInvoice',
    fields: ['subject', 'number', 'company', 'person', 'total', 'paidAt'],
    filters: [['status', 'IS', '["PAID"]']],
    sort: ['paidAt', 'DESC'],
  },
  'quotes-open': {
    object: 'billingQuote',
    fields: ['subject', 'number', 'company', 'person', 'total', 'validUntil', 'status'],
    filters: [['status', 'IS', '["DRAFT","SENT"]']],
    sort: ['validUntil', 'ASC'],
  },
  'quotes-to-invoice': {
    object: 'billingQuote',
    fields: ['subject', 'number', 'company', 'person', 'total', 'acceptedAt'],
    filters: [['status', 'IS', '["ACCEPTED"]']],
    sort: ['acceptedAt', 'ASC'],
  },
  'quotes-pipeline': {
    object: 'billingQuote',
    fields: ['subject', 'number', 'company', 'total', 'validUntil'],
    filters: [],
    sort: ['updatedAt', 'DESC'],
  },
  'credit-notes-drafts': {
    object: 'billingCreditNote',
    fields: ['subject', 'invoice', 'company', 'total'],
    filters: [['status', 'IS', '["DRAFT"]']],
    sort: ['updatedAt', 'DESC'],
  },
};

test('each view shows, filters and sorts as the spec’s table says', () => {
  assert.deepEqual(Object.keys(SPEC).sort(), EXPECTED.map(([file]) => file).sort());
  for (const [file, spec] of Object.entries(SPEC)) {
    const { result } = views.find((view) => view.file === `${file}.view.ts`)!;
    const { config } = result;
    assert.deepEqual(config.fields.map((field: any) => field.fieldMetadataUniversalIdentifier), spec.fields.map((name) => fieldOf(spec.object, name)), `${file}: fields`);
    assert.deepEqual(config.fields.map((field: any) => field.position), spec.fields.map((_, position) => position), `${file}: field order`);
    assert.ok(config.fields.every((field: any) => field.isVisible), `${file}: every field shown`);
    assert.deepEqual(
      (config.filters ?? []).map((filter: any) => [filter.fieldMetadataUniversalIdentifier, filter.operand, filter.value]),
      spec.filters.map(([name, operand, value]) => [fieldOf(spec.object, name), operand, value]),
      `${file}: filters`,
    );
    assert.deepEqual(
      config.sorts.map((sort: any) => [sort.fieldMetadataUniversalIdentifier, sort.direction]),
      [[fieldOf(spec.object, spec.sort[0]), spec.sort[1]]],
      `${file}: sort`,
    );
  }
});

test('the Pipeline has a column per quote status, in the status field’s order, and the tables have none', () => {
  const { result } = views.find((view) => view.file === 'quotes-pipeline.view.ts')!;
  const status = objectsById.get(objectId('billingQuote')).fields.find((field: any) => field.name === 'status');
  const options = [...status.options].sort((a: any, b: any) => a.position - b.position);
  assert.deepEqual(
    result.config.groups.map((group: any) => [group.fieldValue, group.position, group.isVisible, group.universalIdentifier]),
    options.map((option: any, position: number) => [option.value, position, true, IDS[`viewGroup.quotesPipeline.${option.value}`]]),
  );
  for (const { file, result: other } of views) {
    if (file !== 'quotes-pipeline.view.ts') assert.deepEqual(other.config.groups ?? [], [], file);
  }
});
