import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const tax = (key: string, code: string) => preset(key).taxCodes.find((c) => c.code === code);

test('the UK preset has the three VAT rates and the domestic reverse-charge wording', () => {
  assert.deepEqual(['gb.vat.20', 'gb.vat.5', 'gb.vat.0'].map((c) => tax('gb', c)?.components[0].rate), [20, 5, 0]);
  assert.match(tax('gb', 'gb.reverse-charge')?.printNote ?? '', /customer to account for VAT to HMRC/);
});

test('the US preset ships no sales tax rate, because rates depend on the locality', () => {
  const charged = preset('us').taxCodes.filter((c) => c.components.some((k) => k.rate > 0));
  assert.deepEqual(charged, []);
  assert.equal(preset('us').creditNoteTitle, 'Credit Memo');
});

test('Quebec carries GST and QST as two components, neither compound', () => {
  const qc = tax('ca', 'ca.qc.gst-qst');
  assert.deepEqual(qc?.components.map((k) => [k.name, k.rate, k.compound ?? false]), [['GST', 5, false], ['QST', 9.975, false]]);
});

test('Canada covers every harmonized and provincial combination', () => {
  for (const code of ['ca.gst.5', 'ca.on.hst.13', 'ca.hst.15', 'ca.ns.hst.14', 'ca.bc.gst-pst', 'ca.mb.gst-rst', 'ca.sk.gst-pst']) {
    assert.ok(tax('ca', code), code);
  }
});
