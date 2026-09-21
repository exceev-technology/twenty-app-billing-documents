import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/presets/index.ts';

const preset = (key: string) => {
  const p = PRESETS.find((x) => x.key === key);
  assert.ok(p, `preset ${key} is missing`);
  return p;
};
const type = (key: string, typeKey: string) => preset(key).identifierTypes.find((t) => t.key === typeKey);
const tax = (key: string, code: string) => preset(key).taxCodes.find((c) => c.code === code);

test('Morocco requires the ICE from the seller and from a domestic business buyer, 15 digits, in the QR', () => {
  const ice = type('ma', 'ma.ice');
  assert.ok(ice?.requiredForSeller && ice.requiredForBusinessBuyer && ice.includeInQr);
  assert.match('001234567000089', new RegExp(ice.validationPattern!));
  for (const key of ['ma.if', 'ma.rc', 'ma.tp']) assert.equal(type('ma', key)?.requiredForSeller, true, key);
});

test('Morocco prints in French, in dirhams, with the total in words', () => {
  const ma = preset('ma');
  assert.deepEqual([ma.language, ma.defaultCurrency, ma.amountInWords], ['FR', 'MAD', true]);
  assert.equal(tax('ma', 'ma.tva.20')?.components[0].rate, 20);
});

test('France requires the seller SIREN and carries the late-payment mentions', () => {
  assert.equal(type('fr', 'fr.siren')?.requiredForSeller, true);
  assert.match(preset('fr').mentions.invoice ?? '', /40 €/);
  assert.match(preset('fr').mentions.invoice ?? '', /L441-10/);
});

test('France covers the franchise en base and reverse charge with their printed wording', () => {
  assert.match(tax('fr', 'fr.franchise')?.printNote ?? '', /293 B/);
  assert.equal(tax('fr', 'fr.autoliquidation')?.category, 'REVERSE_CHARGE');
  assert.equal(tax('fr', 'fr.tva.5-5')?.components[0].rate, 5.5);
});
