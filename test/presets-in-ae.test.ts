import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const tax = (key: string, code: string) => preset(key).taxCodes.find((c) => c.code === code);

test('all thirteen presets are seeded, Generic first', () => {
  assert.deepEqual(PRESETS.map((p) => p.key), ['generic', 'ma', 'fr', 'gb', 'us', 'ca', 'de', 'es', 'be', 'nl', 'it', 'in', 'ae']);
});

test('India splits intra-state GST into CGST and SGST, and charges IGST across states', () => {
  assert.deepEqual(tax('in', 'in.gst.18.intra')?.components.map((k) => [k.name, k.rate]), [['CGST', 9], ['SGST', 9]]);
  assert.deepEqual(tax('in', 'in.gst.18.inter')?.components.map((k) => [k.name, k.rate]), [['IGST', 18]]);
});

test('an Indian invoice number stays within 16 characters', () => {
  const sample = preset('in').numbering.invoice.replace('{YYYY}', '2026').replace(/\{SEQ:(\d)\}/, (_, n) => '9'.repeat(Number(n)));
  assert.ok(sample.length <= 16, sample);
});

test('India and the UAE title their invoices "Tax Invoice"', () => {
  assert.equal(preset('in').invoiceTitle, 'Tax Invoice');
  assert.equal(preset('ae').invoiceTitle, 'Tax Invoice');
  assert.equal(tax('ae', 'ae.vat.5')?.components[0].rate, 5);
});
