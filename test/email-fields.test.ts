import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const byName = new Map(objects.map(({ result }) => [result.config.nameSingular, result.config]));
const field = (object: string, name: string) => byName.get(object)?.fields.find((f: any) => f.name === name);

test('every document records when it was first sent, a date people may change', () => {
  for (const object of ['billingInvoice', 'billingQuote', 'billingCreditNote']) {
    assert.equal(field(object, 'sentAt')?.type, 'DATE_TIME', object);
    assert.equal(field(object, 'sentAt')?.writability, undefined, object);
  }
});
