import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDocument, computeDocument, type DocumentInput, type LineInput, type TaxCodeInput } from '../../engine/document.ts';
import { EngineError } from '../../engine/problems.ts';

const units = (amount: number): number => Math.round(amount * 1_000_000);

const tax = (code: string, ...components: [string, number, boolean?][]): TaxCodeInput => ({
  code,
  name: code,
  category: components.length === 0 ? 'EXEMPT' : 'STANDARD',
  components: components.map(([name, rate, compound = false], sortOrder) => ({ name, rate, compound, sortOrder })),
});

const VAT20 = tax('fr.vat.20', ['TVA', 20]);
const GST_QST = tax('ca.qc.gst-qst', ['GST', 5], ['QST', 9.975]);
const GST_IN = tax('in.gst.18', ['CGST', 9], ['SGST', 9]);
const EXEMPT = tax('fr.exempt');

const at = (key: string, quantity: number, price: number, taxCode: TaxCodeInput | null, over: Partial<LineInput> = {}, currencyCode = 'EUR'): LineInput => ({
  key,
  quantity,
  unitPrice: { amountMicros: units(price), currencyCode },
  discountPercent: null,
  tax: taxCode,
  ...over,
});

const doc = (lines: LineInput[], over: Partial<DocumentInput> = {}): DocumentInput => ({
  currencyCode: 'EUR',
  pricesIncludeTax: false,
  roundingMode: 'PER_RATE_ON_TOTAL',
  lines,
  ...over,
});

// Problems

test('a valid document has no problem', () => {
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, VAT20)])), []);
});

test('a document needs a currency code and lines', () => {
  assert.deepEqual(checkDocument(doc([], { currencyCode: 'eur' })), [
    { code: 'INVALID_CURRENCY', value: 'eur' },
    { code: 'NO_LINES' },
  ]);
});

test('every line uses the document’s currency', () => {
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, VAT20, {}, 'USD')])), [{ code: 'CURRENCY_MISMATCH', line: 'a', value: 'USD' }]);
});

test('a line without a tax code is refused, never read as 0 %', () => {
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, null)])), [{ code: 'MISSING_TAX_CODE', line: 'a' }]);
});

test('quantities, discounts and rates are refused when they cannot be read exactly', () => {
  assert.deepEqual(checkDocument(doc([at('a', 1.0005, 10, VAT20)])), [{ code: 'INVALID_QUANTITY', line: 'a', value: 1.0005 }]);
  assert.equal(checkDocument(doc([at('a', Number.NaN, 10, VAT20)]))[0]?.code, 'INVALID_QUANTITY');
  for (const discount of [-1, 100.5, 12.345]) {
    assert.deepEqual(checkDocument(doc([at('a', 1, 10, VAT20, { discountPercent: discount })])), [{ code: 'INVALID_DISCOUNT', line: 'a', value: discount }]);
  }
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, tax('x', ['X', 9.12345]))])), [{ code: 'INVALID_RATE', line: 'a', value: 9.12345 }]);
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, tax('x', ['X', -5]))])), [{ code: 'INVALID_RATE', line: 'a', value: -5 }]);
});

test('a discount of 0 or 100 % is allowed', () => {
  for (const discount of [0, 100]) assert.deepEqual(checkDocument(doc([at('a', 1, 10, VAT20, { discountPercent: discount })])), []);
});

test('a document whose figures pass the largest safe integer is refused', () => {
  const huge = at('a', 1000, 0, VAT20, { unitPrice: { amountMicros: Number.MAX_SAFE_INTEGER - 1, currencyCode: 'EUR' } });
  assert.deepEqual(checkDocument(doc([huge])), [{ code: 'AMOUNT_TOO_LARGE' }]);
});

test('computing a document with problems throws them', () => {
  assert.throws(() => computeDocument(doc([])), (error: unknown) => error instanceof EngineError && error.problems[0]?.code === 'NO_LINES');
});

test('two tax codes that share a code but not their rates are refused', () => {
  assert.deepEqual(
    checkDocument(doc([at('a', 1, 100, tax('', ['VAT', 20])), at('b', 1, 100, tax('', ['VAT', 10]))])),
    [{ code: 'TAX_CODE_CONFLICT', line: 'b', value: '' }],
  );
});

test('a unit price that is missing, text or fractional micros is refused as invalid, not too large', () => {
  for (const value of [null, '19990000', 19990000.5]) {
    assert.deepEqual(
      checkDocument(doc([at('a', 1, 10, VAT20, { unitPrice: { amountMicros: value as never, currencyCode: 'EUR' } })])),
      [{ code: 'INVALID_AMOUNT', line: 'a', value }],
    );
  }
});

test('a standard or reduced tax code without a rate is refused, never read as 0 %', () => {
  const noRate: TaxCodeInput = { code: 'x', name: 'x', category: 'STANDARD', components: [] };
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, noRate)])), [{ code: 'MISSING_TAX_RATE', line: 'a', value: 'x' }]);
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, { ...noRate, category: 'REDUCED' })])), [{ code: 'MISSING_TAX_RATE', line: 'a', value: 'x' }]);
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, EXEMPT)])), []);
});

test('problems from different lines are all reported', () => {
  assert.deepEqual(checkDocument(doc([at('a', 1, 10, VAT20, {}, 'USD'), at('b', 1, 10, null)])), [
    { code: 'CURRENCY_MISMATCH', line: 'a', value: 'USD' },
    { code: 'MISSING_TAX_CODE', line: 'b' },
  ]);
});

// Worked cases

test('France, 20 % on net prices', () => {
  assert.deepEqual(computeDocument(doc([at('a', 2, 150, VAT20), at('b', 1, 99.99, VAT20)])), {
    lines: [
      { key: 'a', amountMicros: 300_000_000, discountMicros: 0, lineTotalMicros: 300_000_000 },
      { key: 'b', amountMicros: 99_990_000, discountMicros: 0, lineTotalMicros: 99_990_000 },
    ],
    recap: [{ taxCode: 'fr.vat.20', component: 'TVA', rate: 20, baseMicros: 399_990_000, taxMicros: 80_000_000 }],
    taxCodesUsed: ['fr.vat.20'],
    subtotalMicros: 399_990_000,
    discountTotalMicros: 0,
    taxTotalMicros: 80_000_000,
    totalMicros: 479_990_000,
  });
});

test('the rounding mode changes the tax: three lines of 0.33 at 20 %', () => {
  const lines = ['a', 'b', 'c'].map((key) => at(key, 1, 0.33, VAT20));
  assert.equal(computeDocument(doc(lines, { roundingMode: 'PER_LINE' })).taxTotalMicros, 210_000);
  assert.equal(computeDocument(doc(lines, { roundingMode: 'PER_RATE_ON_TOTAL' })).taxTotalMicros, 200_000);
});

test('Quebec: GST 5 % and QST 9.975 %, each on the net', () => {
  const result = computeDocument(doc([at('a', 1, 100, GST_QST, {}, 'CAD')], { currencyCode: 'CAD' }));
  assert.deepEqual(result.recap, [
    { taxCode: 'ca.qc.gst-qst', component: 'GST', rate: 5, baseMicros: 100_000_000, taxMicros: 5_000_000 },
    { taxCode: 'ca.qc.gst-qst', component: 'QST', rate: 9.975, baseMicros: 100_000_000, taxMicros: 9_980_000 },
  ]);
  assert.equal(result.totalMicros, 114_980_000);
});

test('a compound component is computed on the net plus the components before it', () => {
  const result = computeDocument(doc([at('a', 1, 100, tax('test.compound', ['A', 10], ['B', 5, true]))]));
  assert.deepEqual(result.recap.map((row) => [row.component, row.baseMicros, row.taxMicros]), [
    ['A', 100_000_000, 10_000_000],
    ['B', 110_000_000, 5_500_000],
  ]);
  assert.equal(result.totalMicros, 115_500_000);
});

test('India: CGST 9 % and SGST 9 %', () => {
  const result = computeDocument(doc([at('a', 1, 1000, GST_IN, {}, 'INR')], { currencyCode: 'INR' }));
  assert.deepEqual(result.recap.map((row) => row.taxMicros), [90_000_000, 90_000_000]);
  assert.equal(result.totalMicros, 1_180_000_000);
});

test('gross prices: 19.99 including 20 % is 16.66 net and 3.33 tax', () => {
  const result = computeDocument(doc([at('a', 1, 19.99, VAT20)], { pricesIncludeTax: true }));
  assert.deepEqual(
    [result.lines[0]?.lineTotalMicros, result.subtotalMicros, result.taxTotalMicros, result.totalMicros],
    [19_990_000, 16_660_000, 3_330_000, 19_990_000],
  );
  assert.deepEqual(result.recap, [{ taxCode: 'fr.vat.20', component: 'TVA', rate: 20, baseMicros: 16_660_000, taxMicros: 3_330_000 }]);
});

test('yen have no minor unit: ¥499.5 rounds to ¥500, and 10 % of ¥999 to ¥100', () => {
  const ct = tax('jp.ct.10', ['CT', 10]);
  const half = computeDocument(doc([at('a', 1.5, 333, ct, {}, 'JPY')], { currencyCode: 'JPY' }));
  assert.equal(half.lines[0]?.amountMicros, 500_000_000);
  const whole = computeDocument(doc([at('a', 3, 333, ct, {}, 'JPY')], { currencyCode: 'JPY' }));
  assert.deepEqual([whole.taxTotalMicros, whole.totalMicros], [100_000_000, 1_099_000_000]);
});

test('Kuwaiti dinars have three decimals', () => {
  const result = computeDocument(doc([at('a', 1, 1.2345, tax('test.5', ['T', 5]), {}, 'KWD')], { currencyCode: 'KWD' }));
  assert.deepEqual([result.lines[0]?.amountMicros, result.taxTotalMicros, result.totalMicros], [1_235_000, 62_000, 1_297_000]);
});

test('a 12.5 % discount is rounded, deducted, and totalled for information', () => {
  const result = computeDocument(doc([at('a', 1, 33.33, VAT20, { discountPercent: 12.5 })]));
  assert.deepEqual(result.lines[0], { key: 'a', amountMicros: 33_330_000, discountMicros: 4_170_000, lineTotalMicros: 29_160_000 });
  assert.deepEqual([result.discountTotalMicros, result.taxTotalMicros, result.totalMicros], [4_170_000, 5_830_000, 34_990_000]);
});

test('a negative rebate line rounds away from zero, like a positive one', () => {
  const result = computeDocument(doc([at('a', 1, 100, VAT20), at('b', 1, -0.025, VAT20)], { roundingMode: 'PER_LINE' }));
  assert.equal(result.lines[1]?.lineTotalMicros, -30_000);
  assert.deepEqual([result.subtotalMicros, result.taxTotalMicros, result.totalMicros], [99_970_000, 19_990_000, 119_960_000]);
});

test('an exempt code still shows its base at 0 %, and codes appear in line order', () => {
  const result = computeDocument(doc([at('a', 1, 50, EXEMPT), at('b', 1, 100, VAT20)]));
  assert.deepEqual(result.recap, [
    { taxCode: 'fr.exempt', component: null, rate: 0, baseMicros: 50_000_000, taxMicros: 0 },
    { taxCode: 'fr.vat.20', component: 'TVA', rate: 20, baseMicros: 100_000_000, taxMicros: 20_000_000 },
  ]);
  assert.deepEqual(result.taxCodesUsed, ['fr.exempt', 'fr.vat.20']);
});

test('components print in sortOrder, whatever order they arrive in', () => {
  const reversed: TaxCodeInput = { ...GST_QST, components: [...GST_QST.components].reverse() };
  const result = computeDocument(doc([at('a', 1, 100, reversed, {}, 'CAD')], { currencyCode: 'CAD' }));
  assert.deepEqual(result.recap.map((row) => row.component), ['GST', 'QST']);
});
