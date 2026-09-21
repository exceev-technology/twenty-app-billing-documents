import { test } from 'node:test';
import assert from 'node:assert/strict';

// No object exists yet, so the builders run in collect mode: each key gets a
// stand-in identifier derived from the key.
process.env.BILLING_IDS_COLLECT = '1';

const { defineField, OnDeleteAction, STANDARD_OBJECT } = await import('twenty-sdk/define');
const { id } = await import('../src/lib/id.ts');
const f = await import('../src/schema/fields.ts');

const O = 'billingDemo';

test('select gives every option its registry identifier and position, and quotes the default', () => {
  const field = f.select(O, 'state', { label: 'State' }, [['ON', 'On', 'green'], ['OFF', 'Off', 'gray']], 'OFF') as any;
  assert.deepEqual(
    field.options.map((o: any) => [o.value, o.position, o.id]),
    [['ON', 0, id('option.billingDemo.state.ON')], ['OFF', 1, id('option.billingDemo.state.OFF')]],
  );
  assert.equal(field.defaultValue, "'OFF'");
});

test('select refuses a default that is not one of its options', () => {
  assert.throws(() => f.select(O, 'state', { label: 'State' }, [['ON', 'On', 'green']], 'MAYBE'), /not one of its options/);
});

test('manyToOne holds the join column and points at the other side', () => {
  const field = f.manyToOne(O, 'owner', { label: 'Owner' }, {
    object: 'billingOther', inverse: 'demos', onDelete: OnDeleteAction.CASCADE,
  }) as any;
  assert.equal(field.type, 'RELATION');
  assert.equal(field.relationTargetObjectMetadataUniversalIdentifier, id('object.billingOther'));
  assert.equal(field.relationTargetFieldMetadataUniversalIdentifier, id('field.billingOther.demos'));
  assert.deepEqual(field.universalSettings, { relationType: 'MANY_TO_ONE', onDelete: 'CASCADE', joinColumnName: 'ownerId' });
});

test("a relation to a standard object uses Twenty's own identifier for it", () => {
  const field = f.manyToOne(O, 'company', { label: 'Company' }, {
    object: 'company', inverse: 'billingDemos', onDelete: OnDeleteAction.SET_NULL,
  }) as any;
  assert.equal(field.relationTargetObjectMetadataUniversalIdentifier, STANDARD_OBJECT.company.universalIdentifier);
  assert.equal(field.relationTargetFieldMetadataUniversalIdentifier, id('field.company.billingDemos'));
});

test('oneToMany is the collection side, with no join column', () => {
  const field = f.oneToMany(O, 'demos', { label: 'Demos' }, { object: 'billingOther', inverse: 'owner' }) as any;
  assert.deepEqual(field.universalSettings, { relationType: 'ONE_TO_MANY' });
});

test('booleans have a default and are never null; numbers and files carry their settings', () => {
  const flag = f.boolean(O, 'on', { label: 'On' }, true) as any;
  assert.deepEqual([flag.isNullable, flag.defaultValue], [false, true]);
  assert.deepEqual((f.integer(O, 'count', { label: 'Count' }) as any).universalSettings, { dataType: 'int', decimals: 0 });
  assert.deepEqual((f.decimal(O, 'rate', { label: 'Rate' }, 4) as any).universalSettings, { dataType: 'float', decimals: 4 });
  assert.deepEqual((f.files(O, 'pdf', { label: 'PDF' }, 10) as any).universalSettings, { maxNumberOfValues: 10 });
});

test('every builder produces a field Twenty accepts', () => {
  const meta = { label: 'X' };
  const fields = [
    f.text(O, 'a', meta), f.richText(O, 'b', meta), f.date(O, 'c', meta), f.dateTime(O, 'd', meta),
    f.currency(O, 'e', meta), f.rawJson(O, 'g', meta), f.address(O, 'h', meta), f.emails(O, 'i', meta),
    f.phones(O, 'j', meta), f.links(O, 'k', meta), f.boolean(O, 'l', meta, false), f.integer(O, 'm', meta),
    f.decimal(O, 'n', meta, 2), f.files(O, 'p', meta, 1), f.select(O, 'q', meta, [['A', 'A', 'blue']], 'A'),
    f.manyToOne(O, 'r', meta, { object: 'billingOther', inverse: 's', onDelete: OnDeleteAction.SET_NULL }),
    f.oneToMany(O, 't', meta, { object: 'billingOther', inverse: 'u' }),
  ];
  for (const field of fields) {
    const result = defineField({ ...(field as any), objectUniversalIdentifier: f.objectId(O) });
    assert.equal(result.success, true, `${(field as any).name}: ${result.errors.join('; ')}`);
  }
});

test('onStandard attaches a field to the standard object it extends', () => {
  const field = f.onStandard('person', f.oneToMany('person', 'billingDemos', { label: 'Demos' }, { object: O, inverse: 'person' })) as any;
  assert.equal(field.objectUniversalIdentifier, STANDARD_OBJECT.person.universalIdentifier);
});
