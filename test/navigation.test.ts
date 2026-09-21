import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavigationMenuItemType } from 'twenty-sdk/define';
import { loadEntities } from './helpers/entities.ts';
import { objectId } from '../src/schema/fields.ts';

const items = await loadEntities('navigation-menu-items');
const configs = items.map(({ result }) => result.config);
const folders = configs.filter((c) => c.type === NavigationMenuItemType.FOLDER);
const entries = configs.filter((c) => c.type === NavigationMenuItemType.OBJECT).sort((a, b) => a.position - b.position);

test('every sidebar item validates', () => {
  for (const { file, result } of items) assert.equal(result.success, true, `${file}: ${result.errors.join('; ')}`);
});

test('the app adds one sidebar folder, named Billing', () => {
  assert.equal(folders.length, 1);
  assert.equal(folders[0].name, 'Billing');
});

test('the folder holds quotes, invoices, credit notes, the catalog, tax codes and profiles, in that order', () => {
  const targets = ['billingQuote', 'billingInvoice', 'billingCreditNote', 'billingCatalogItem', 'billingTaxCode', 'billingProfile'];
  assert.deepEqual(entries.map((e) => e.targetObjectUniversalIdentifier), targets.map(objectId));
  for (const entry of entries) assert.equal(entry.folderUniversalIdentifier, folders[0].universalIdentifier);
});
