import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';
import { seedPresets, type SeedRow, type SeedStore } from '../src/seed/seed.ts';

const total = {
  profiles: PRESETS.length,
  identifierTypes: PRESETS.reduce((n, p) => n + p.identifierTypes.length, 0),
  taxCodes: PRESETS.reduce((n, p) => n + p.taxCodes.length, 0),
  taxComponents: PRESETS.reduce((n, p) => n + p.taxCodes.reduce((m, c) => m + c.components.length, 0), 0),
};
const NOTHING = { profiles: 0, identifierTypes: 0, taxCodes: 0, taxComponents: 0 };

/** An in-memory store. `interruptAfter(n)` lets n more creates succeed, then throws, as an interrupted run would. */
function memoryStore(initial: Record<string, SeedRow[]> = {}) {
  const tables = new Map<string, SeedRow[]>(Object.entries(initial).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))]));
  let next = 0;
  let remaining = Infinity;
  const store: SeedStore = {
    async list(plural) {
      return (tables.get(plural) ?? []).map((r) => ({ ...r }));
    },
    async create(plural, _singular, data) {
      if (remaining <= 0) throw new Error('interrupted');
      remaining -= 1;
      const row: SeedRow = { id: `row-${++next}`, deletedAt: null, ...data };
      tables.set(plural, [...(tables.get(plural) ?? []), row]);
      return { ...row };
    },
  };
  return { store, tables, interruptAfter: (n: number) => { remaining = n; } };
}

test('on an empty workspace, one run creates every preset record', async () => {
  const { store } = memoryStore();
  assert.deepEqual(await seedPresets(store, PRESETS), total);
});

test('a second run creates nothing', async () => {
  const { store } = memoryStore();
  await seedPresets(store, PRESETS);
  assert.deepEqual(await seedPresets(store, PRESETS), NOTHING);
});

test('identifier types hang off their profile, components off their tax code', async () => {
  const { store, tables } = memoryStore();
  await seedPresets(store, PRESETS);
  const ma = tables.get('billingProfiles')!.find((r) => r.presetKey === 'ma')!;
  const ice = tables.get('billingIdentifierTypes')!.find((r) => r.key === 'ma.ice')!;
  assert.equal(ice.profileId, ma.id);
  const qc = tables.get('billingTaxCodes')!.find((r) => r.code === 'ca.qc.gst-qst')!;
  const parts = tables.get('billingTaxComponents')!.filter((r) => r.taxCodeId === qc.id);
  assert.deepEqual(parts.map((r) => [r.name, r.rate, r.sortOrder]), [['GST', 5, 0], ['QST', 9.975, 1]]);
});

test('a record the user edited is never touched', async () => {
  const { store, tables } = memoryStore();
  await seedPresets(store, PRESETS);
  const code = tables.get('billingTaxCodes')!.find((r) => r.code === 'gb.vat.20')!;
  code.name = 'VAT 20% (edited)';
  await seedPresets(store, PRESETS);
  assert.equal(tables.get('billingTaxCodes')!.find((r) => r.code === 'gb.vat.20')!.name, 'VAT 20% (edited)');
});

test('a preset the user deleted stays deleted, and gets no new identifier type', async () => {
  const { store, tables } = memoryStore({
    billingProfiles: [{ id: 'p-nl', presetKey: 'nl', deletedAt: '2026-09-21T10:00:00Z' }],
  });
  const report = await seedPresets(store, PRESETS);
  assert.equal(report.profiles, total.profiles - 1);
  assert.equal(tables.get('billingProfiles')!.filter((r) => r.presetKey === 'nl').length, 1);
  assert.equal(tables.get('billingIdentifierTypes')!.filter((r) => String(r.key).startsWith('nl.')).length, 0);
});

test('an interrupted run is completed by the next one, without duplicates', async () => {
  const { store, tables, interruptAfter } = memoryStore();
  interruptAfter(40);
  await assert.rejects(seedPresets(store, PRESETS), /interrupted/);
  interruptAfter(Infinity);
  await seedPresets(store, PRESETS);
  assert.equal(tables.get('billingProfiles')!.length, total.profiles);
  assert.equal(tables.get('billingIdentifierTypes')!.length, total.identifierTypes);
  assert.equal(tables.get('billingTaxCodes')!.length, total.taxCodes);
  assert.equal(tables.get('billingTaxComponents')!.length, total.taxComponents);
});

test('a tax code left without any component gets its components; one with components is left alone', async () => {
  const { store, tables } = memoryStore({
    billingTaxCodes: [
      { id: 'c-empty', code: 'gb.vat.5', deletedAt: null },
      { id: 'c-edited', code: 'gb.vat.20', deletedAt: null },
    ],
    billingTaxComponents: [{ id: 'k-1', taxCodeId: 'c-edited', name: 'VAT', rate: 17.5, deletedAt: null }],
  });
  await seedPresets(store, PRESETS);
  const components = tables.get('billingTaxComponents')!;
  assert.deepEqual(components.filter((r) => r.taxCodeId === 'c-empty').map((r) => r.rate), [5]);
  assert.deepEqual(components.filter((r) => r.taxCodeId === 'c-edited').map((r) => r.rate), [17.5]);
});

test('rich text mentions are written as markdown, empty ones not at all', async () => {
  const { store, tables } = memoryStore();
  await seedPresets(store, PRESETS);
  const fr = tables.get('billingProfiles')!.find((r) => r.presetKey === 'fr')!;
  assert.match((fr.invoiceMentions as { markdown: string }).markdown, /L441-10/);
  assert.equal('quoteMentions' in fr, false);
});
