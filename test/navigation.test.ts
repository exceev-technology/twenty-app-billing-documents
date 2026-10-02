import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavigationMenuItemType } from 'twenty-sdk/define';
import { loadEntities } from './helpers/entities.ts';
import { objectId } from '../src/schema/fields.ts';
import { IDS } from '../src/ids.ts';

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

test('the folder holds quotes, invoices, credit notes, the catalog, tax codes, profiles and issuers, in that order', () => {
  const targets = ['billingQuote', 'billingInvoice', 'billingCreditNote', 'billingCatalogItem', 'billingTaxCode', 'billingProfile', 'billingIssuer'];
  assert.deepEqual(entries.map((e) => e.targetObjectUniversalIdentifier), targets.map(objectId));
  for (const entry of entries) assert.equal(entry.folderUniversalIdentifier, folders[0].universalIdentifier);
});

test('Overdue invoices opens the Overdue view, from the Billing folder, right after Invoices', () => {
  const view = configs.find((c) => c.type === NavigationMenuItemType.VIEW);
  assert.ok(view);
  assert.deepEqual([view.name, view.viewUniversalIdentifier, view.folderUniversalIdentifier], ['Overdue invoices', IDS['view.invoicesOverdue'], folders[0].universalIdentifier]);
  const invoices = entries.find((e) => e.targetObjectUniversalIdentifier === objectId('billingInvoice'));
  const creditNotes = entries.find((e) => e.targetObjectUniversalIdentifier === objectId('billingCreditNote'));
  assert.ok(invoices.position < view.position && view.position < creditNotes.position);
});
