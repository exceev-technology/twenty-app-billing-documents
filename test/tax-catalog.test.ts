import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEntities } from './helpers/entities.ts';

const objects = await loadEntities('objects');
const config = (name: string) => objects.find(({ result }) => result.config.nameSingular === name)?.result.config;
const field = (object: string, name: string) => config(object)?.fields.find((f: any) => f.name === name);

test('a tax code has a category, standard by default, and a printed note', () => {
  assert.equal(field('billingTaxCode', 'category')?.defaultValue, "'STANDARD'");
  assert.equal(field('billingTaxCode', 'printNote')?.type, 'TEXT');
  assert.equal(field('billingTaxCode', 'isActive')?.defaultValue, true);
});

test('a tax component rate keeps four decimals, enough for 9.975 %', () => {
  assert.deepEqual(field('billingTaxComponent', 'rate')?.universalSettings, { dataType: 'float', decimals: 4 });
});

test('deleting a tax code deletes its components', () => {
  assert.equal(field('billingTaxComponent', 'taxCode')?.universalSettings.onDelete, 'CASCADE');
});

test('a catalog item has a price in any currency and a unit, one unit by default', () => {
  assert.equal(field('billingCatalogItem', 'unitPrice')?.type, 'CURRENCY');
  assert.equal(field('billingCatalogItem', 'unit')?.defaultValue, "'UNIT'");
});
