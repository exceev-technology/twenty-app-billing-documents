import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const standardRate = (key: string) => preset(key).taxCodes.find((c) => c.category === 'STANDARD')?.components[0].rate;

test('standard VAT rates', () => {
  assert.deepEqual(['de', 'es', 'be', 'nl', 'it'].map(standardRate), [19, 21, 21, 21, 22]);
});

test('every EU preset has a reverse-charge code with printed wording', () => {
  for (const key of ['de', 'es', 'be', 'nl', 'it']) {
    const rc = preset(key).taxCodes.find((c) => c.category === 'REVERSE_CHARGE');
    assert.ok(rc?.printNote, key);
  }
});

test('Belgium and Italy say the PDF is not the legal invoice for domestic B2B', () => {
  assert.match(preset('be').complianceNote ?? '', /Peppol/);
  assert.match(preset('it').complianceNote ?? '', /courtesy copy/);
});

test('Germany covers the small-business exemption of § 19 UStG', () => {
  assert.match(preset('de').taxCodes.find((c) => c.code === 'de.kleinunternehmer')?.printNote ?? '', /§ 19 UStG/);
});
