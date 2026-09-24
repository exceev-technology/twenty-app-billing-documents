import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDocument, type DocumentInput, type LineInput, type TaxCodeInput } from '../../engine/index.ts';

/** mulberry32: a small seeded generator, so a failing document always comes back. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CODES: TaxCodeInput[] = [
  { code: 'vat.20', name: 'VAT 20 %', category: 'STANDARD', components: [{ name: 'VAT', rate: 20, compound: false, sortOrder: 0 }] },
  {
    code: 'gst.qst', name: 'GST + QST', category: 'STANDARD',
    components: [{ name: 'GST', rate: 5, compound: false, sortOrder: 0 }, { name: 'QST', rate: 9.975, compound: false, sortOrder: 1 }],
  },
  {
    code: 'compound', name: 'A, then B on A', category: 'STANDARD',
    components: [{ name: 'A', rate: 8.5, compound: false, sortOrder: 0 }, { name: 'B', rate: 7.25, compound: true, sortOrder: 1 }],
  },
  { code: 'exempt', name: 'Exempt', category: 'EXEMPT', components: [] },
];

/** Currency, and micros in its minor unit. */
const CURRENCIES: [string, number][] = [['EUR', 10_000], ['JPY', 1_000_000], ['KWD', 1_000], ['USD', 10_000]];
const step = (currencyCode: string): number => CURRENCIES.find(([code]) => code === currencyCode)![1];

function generate(next: () => number): DocumentInput {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const int = (max: number): number => Math.floor(next() * (max + 1));
  const [currencyCode, minor] = pick(CURRENCIES);
  const lines: LineInput[] = Array.from({ length: 1 + int(7) }, (_, i) => ({
    key: `line-${i}`,
    quantity: (1 + int(99_999)) / 1000,
    unitPrice: { amountMicros: (int(2_000_000) - 100_000) * minor, currencyCode },
    discountPercent: next() < 0.3 ? int(10_000) / 100 : null,
    tax: pick(CODES),
  }));
  return { currencyCode, pricesIncludeTax: next() < 0.5, roundingMode: next() < 0.5 ? 'PER_LINE' : 'PER_RATE_ON_TOTAL', lines };
}

test('every generated document balances, in safe whole minor units', () => {
  const next = random(20260922);
  for (let n = 0; n < 500; n++) {
    const input = generate(next);
    const result = computeDocument(input);
    const lineTotals = result.lines.reduce((total, line) => total + line.lineTotalMicros, 0);
    assert.equal(result.totalMicros, result.subtotalMicros + result.taxTotalMicros, `document ${n}`);
    assert.equal(result.taxTotalMicros, result.recap.reduce((total, row) => total + row.taxMicros, 0), `document ${n}`);
    assert.equal(input.pricesIncludeTax ? result.totalMicros : result.subtotalMicros, lineTotals, `document ${n}`);
    const figures = [
      result.subtotalMicros, result.discountTotalMicros, result.taxTotalMicros, result.totalMicros,
      ...result.lines.flatMap((line) => [line.amountMicros, line.discountMicros, line.lineTotalMicros]),
      ...result.recap.flatMap((row) => [row.baseMicros, row.taxMicros]),
    ];
    for (const figure of figures) {
      assert.ok(Number.isSafeInteger(figure), `document ${n}: ${figure} is not a safe integer`);
      assert.ok(figure % step(input.currencyCode) === 0, `document ${n}: ${figure} is not a whole number of minor units`);
    }
  }
});

test('the two rounding modes agree on a document of one line', () => {
  const next = random(7);
  for (let n = 0; n < 200; n++) {
    const input = generate(next);
    const one = { ...input, lines: input.lines.slice(0, 1) };
    assert.deepEqual(
      computeDocument({ ...one, roundingMode: 'PER_LINE' }),
      computeDocument({ ...one, roundingMode: 'PER_RATE_ON_TOTAL' }),
      `document ${n}`,
    );
  }
});

/** Never turns 0 into -0: strict equality treats them as different. */
const negate = (x: number): number => (x === 0 ? 0 : -x);

test('negating every unit price negates every figure', () => {
  const next = random(31415926);
  for (let n = 0; n < 300; n++) {
    const input = generate(next);
    const negated: DocumentInput = {
      ...input,
      lines: input.lines.map((line) => ({ ...line, unitPrice: { ...line.unitPrice, amountMicros: negate(line.unitPrice.amountMicros) } })),
    };
    const result = computeDocument(input);
    const flipped = computeDocument(negated);

    assert.equal(flipped.subtotalMicros, negate(result.subtotalMicros), `document ${n}`);
    assert.equal(flipped.discountTotalMicros, negate(result.discountTotalMicros), `document ${n}`);
    assert.equal(flipped.taxTotalMicros, negate(result.taxTotalMicros), `document ${n}`);
    assert.equal(flipped.totalMicros, negate(result.totalMicros), `document ${n}`);

    result.lines.forEach((line, i) => {
      const other = flipped.lines[i]!;
      assert.equal(other.key, line.key, `document ${n}`);
      assert.equal(other.amountMicros, negate(line.amountMicros), `document ${n}`);
      assert.equal(other.discountMicros, negate(line.discountMicros), `document ${n}`);
      assert.equal(other.lineTotalMicros, negate(line.lineTotalMicros), `document ${n}`);
    });

    result.recap.forEach((row, i) => {
      const other = flipped.recap[i]!;
      assert.equal(other.taxCode, row.taxCode, `document ${n}`);
      assert.equal(other.component, row.component, `document ${n}`);
      assert.equal(other.rate, row.rate, `document ${n}`);
      assert.equal(other.baseMicros, negate(row.baseMicros), `document ${n}`);
      assert.equal(other.taxMicros, negate(row.taxMicros), `document ${n}`);
    });

    assert.deepEqual(flipped.taxCodesUsed, result.taxCodesUsed, `document ${n}`);
  }
});

test('each tax code’s net and taxes add up to its lines', () => {
  const next = random(2718281828);
  for (let n = 0; n < 300; n++) {
    const input = generate(next);
    const result = computeDocument(input);
    for (const code of result.taxCodesUsed) {
      const lines = input.lines.reduce(
        (total, line, i) => (line.tax?.code === code ? total + result.lines[i]!.lineTotalMicros : total),
        0,
      );
      const rows = result.recap.filter((row) => row.taxCode === code);
      const first = rows[0]!.baseMicros;
      const taxes = rows.reduce((total, row) => total + row.taxMicros, 0);
      if (input.pricesIncludeTax) {
        assert.equal(first + taxes, lines, `document ${n}, code ${code}`);
      } else {
        assert.equal(first, lines, `document ${n}, code ${code}`);
      }
    }
  }
});
