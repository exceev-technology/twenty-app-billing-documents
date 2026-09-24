import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grossFactor, taxOn, type RateComponent } from '../../engine/tax.ts';

const pct = (rate: bigint, compound = false): RateComponent => ({ rate, compound });
const VAT20 = [pct(200_000n)];
const GST_QST = [pct(50_000n), pct(99_750n)];

test('each component is rounded on its base: QST 9.975 % of 100.00 is 9.98', () => {
  assert.deepEqual(taxOn(100_000_000n, GST_QST, false, 'CAD'), {
    net: 100_000_000n,
    parts: [
      { base: 100_000_000n, tax: 5_000_000n },
      { base: 100_000_000n, tax: 9_980_000n },
    ],
  });
});

test('a compound component is computed on the base plus the taxes before it', () => {
  assert.deepEqual(taxOn(100_000_000n, [pct(100_000n), pct(50_000n, true)], false, 'EUR').parts, [
    { base: 100_000_000n, tax: 10_000_000n },
    { base: 110_000_000n, tax: 5_500_000n },
  ]);
});

test('the gross factor is exact: 20 % is 6/5, GST and QST 1.14975, compounding multiplies', () => {
  const vat = grossFactor(VAT20);
  assert.equal(vat.n * 5n, vat.d * 6n);
  const quebec = grossFactor(GST_QST);
  assert.equal(quebec.n * 100_000n, quebec.d * 114_975n);
  const compound = grossFactor([pct(100_000n), pct(50_000n, true)]); // 1.1 × 1.05 = 1.155
  assert.equal(compound.n * 1000n, compound.d * 1155n);
});

test('tax is taken out of gross prices: 19.99 including 20 % is 16.66 and 3.33', () => {
  assert.deepEqual(taxOn(19_990_000n, VAT20, true, 'EUR'), {
    net: 16_660_000n,
    parts: [{ base: 16_660_000n, tax: 3_330_000n }],
  });
});

test('on gross prices each component takes its exact share and the net takes the remainder', () => {
  assert.deepEqual(taxOn(10_000_000n, GST_QST, true, 'CAD'), {
    net: 8_700_000n,
    parts: [
      { base: 8_700_000n, tax: 430_000n },
      { base: 8_700_000n, tax: 870_000n },
    ],
  });
});

test('on gross prices, components at equal rates get equal taxes and a 0 % component gets nothing', () => {
  assert.deepEqual(taxOn(1_000_000n, [pct(90_000n), pct(90_000n)], true, 'INR'), {
    net: 840_000n,
    parts: [
      { base: 840_000n, tax: 80_000n },
      { base: 840_000n, tax: 80_000n },
    ],
  });
  assert.deepEqual(taxOn(1_000_000n, [pct(200_000n), pct(0n)], true, 'EUR'), {
    net: 830_000n,
    parts: [
      { base: 830_000n, tax: 170_000n },
      { base: 830_000n, tax: 0n },
    ],
  });
});

test('a code without components has no tax, on net or gross prices', () => {
  assert.deepEqual(taxOn(50_000_000n, [], false, 'EUR'), { net: 50_000_000n, parts: [] });
  assert.deepEqual(taxOn(50_000_000n, [], true, 'EUR'), { net: 50_000_000n, parts: [] });
});
