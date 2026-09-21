import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restSeedStore } from '../src/seed/rest-store.ts';
import { fakeTwentyRest } from './helpers/fake-twenty.ts';

test('list follows the cursor across pages', async () => {
  const twenty = fakeTwentyRest(2);
  const store = restSeedStore(twenty);
  for (let i = 0; i < 5; i++) await store.create('billingTaxCodes', 'billingTaxCode', { code: `x.${i}` });
  assert.equal((await store.list('billingTaxCodes')).length, 5);
  assert.ok(twenty.requests.some((r) => r.includes('"starting_after"')));
});

test('list includes soft-deleted rows, asked for separately', async () => {
  const twenty = fakeTwentyRest();
  twenty.tables.set('billingProfiles', [
    { id: 'a', presetKey: 'ma', deletedAt: null },
    { id: 'b', presetKey: 'nl', deletedAt: '2026-09-21T10:00:00Z' },
  ]);
  const rows = await restSeedStore(twenty).list('billingProfiles');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['a', 'b']);
  assert.ok(twenty.requests.some((r) => r.includes('deletedAt[is]:NOT_NULL')));
});

test("create returns the created row from Twenty's envelope", async () => {
  const row = await restSeedStore(fakeTwentyRest()).create('billingProfiles', 'billingProfile', { name: 'Generic' });
  assert.equal(row.name, 'Generic');
  assert.ok(row.id);
});

test('create fails loudly when Twenty answers with something else', async () => {
  const client = { get: async () => ({}), post: async () => ({ data: {} }) } as any;
  await assert.rejects(restSeedStore(client).create('billingProfiles', 'billingProfile', {}), /did not return the created billingProfile/);
});

test('list fails loudly when Twenty answers with something else', async () => {
  const client = { get: async () => ({ error: 'unauthorised' }), post: async () => ({}) } as any;
  await assert.rejects(restSeedStore(client).list('billingProfiles'), /did not return a billingProfiles list/);
});
