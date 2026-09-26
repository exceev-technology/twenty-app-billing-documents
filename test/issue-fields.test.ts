import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataWritability, STANDARD_OBJECT } from 'twenty-sdk/define';
import role from '../src/roles/billing.role.ts';
import { APP_ONLY_FIELDS } from '../src/schema/app-only.ts';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const byName = new Map(objects.map(({ result }) => [result.config.nameSingular, result.config]));
const field = (object: string, name: string) => byName.get(object)?.fields.find((f: any) => f.name === name);
const DOCUMENTS = ['billingQuote', 'billingInvoice', 'billingCreditNote'];
const APPLICATION = MetadataWritability.APPLICATION;

test('every object still validates', () => {
  for (const { file, result } of objects) assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
});

test('a document’s number key is unique text that only the app sets', () => {
  for (const doc of DOCUMENTS) {
    const key = field(doc, 'numberKey');
    assert.deepEqual([key?.type, key?.isUnique, key?.writability], ['TEXT', true, APPLICATION], doc);
  }
});

test('a ledger row’s scope key is unique and the app’s; the rest of the row stays editable', () => {
  const key = field('billingSequence', 'scopeKey');
  assert.deepEqual([key?.type, key?.isUnique, key?.writability], ['TEXT', true, APPLICATION]);
  for (const name of ['issuer', 'documentType', 'periodKey', 'lastValue']) assert.equal(field('billingSequence', name)?.writability, undefined, name);
  assert.doesNotMatch(byName.get('billingSequence')?.description ?? '', /never edit/i);
});

test('a quote counts its PDF versions in a whole number only the app sets', () => {
  const version = field('billingQuote', 'version');
  assert.deepEqual([version?.type, version?.universalSettings?.dataType, version?.writability], ['NUMBER', 'int', APPLICATION]);
});

test('an issuer picks one of the five templates, classic by default', () => {
  const template = field('billingIssuer', 'template');
  assert.equal(template?.type, 'SELECT');
  assert.deepEqual(template?.options.map((o: any) => o.value), ['CLASSIC', 'MODERN', 'COMPACT', 'LETTERHEAD', 'RECEIPT']);
  assert.equal(template?.defaultValue, "'CLASSIC'");
});

test('exactly the fields of spec §3 are app-only, and status is not one of them', () => {
  const expected = Object.entries(APP_ONLY_FIELDS).flatMap(([object, names]) => names.map((name) => `${object}.${name}`)).sort();
  const actual = [...byName.values()]
    .flatMap((config: any) => config.fields.filter((f: any) => f.writability === APPLICATION).map((f: any) => `${config.nameSingular}.${f.name}`))
    .sort();
  assert.deepEqual(actual, expected);
  for (const doc of DOCUMENTS) {
    for (const name of ['number', 'numberKey', 'snapshot', 'documentHash', 'pdf', 'subtotal', 'discountTotal', 'taxTotal', 'total']) {
      assert.ok(expected.includes(`${doc}.${name}`), `${doc}.${name}`);
    }
    assert.equal(field(doc, 'status')?.writability, undefined, doc);
  }
  assert.ok(expected.includes('billingInvoice.issuedAt') && expected.includes('billingCreditNote.issuedAt') && expected.includes('billingQuote.version'));
  for (const line of ['billingQuoteLine', 'billingInvoiceLine', 'billingCreditNoteLine']) assert.ok(expected.includes(`${line}.lineTotal`), line);
});

test('the app writes timeline messages, and never deletes them', () => {
  const permission = role.config.objectPermissions?.find((p) => p.objectUniversalIdentifier === STANDARD_OBJECT.timelineActivity.universalIdentifier);
  assert.deepEqual(
    [permission?.canReadObjectRecords, permission?.canUpdateObjectRecords, permission?.canSoftDeleteObjectRecords, permission?.canDestroyObjectRecords],
    [true, true, false, false],
  );
});
