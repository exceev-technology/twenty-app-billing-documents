import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANGES, undrawable } from '../../render/glyphs.ts';
import { PACKS } from '../../render/lang/pack.ts';
import { amountInWords } from '../../render/format.ts';

const GENERATOR = new URL('../../scripts/glyphs.mjs', import.meta.url).href;

test('the drawable list is read from the fonts: run npm run glyphs after upgrading pdfmake', async () => {
  const { robotoRanges } = await import(GENERATOR);
  assert.deepEqual(RANGES.map((range) => [...range]), robotoRanges());
});

test('what Roboto lacks is refused, and what it draws is not', () => {
  assert.equal(undrawable('→ ₴ ₸ ₵ ₾ ǅ ☕'), '→₴₸₵₾ǅ☕');
  assert.equal(undrawable('Société Générale\nООО «Ромашка» Ωmega Nguyễn € − … №'), '');
});

test('every word the packs print can be drawn', () => {
  for (const pack of Object.values(PACKS)) {
    for (const text of [pack.draft, ...Object.values(pack.titles), ...Object.values(pack.labels)]) {
      assert.equal(undrawable(text), '', `${pack.code}: ${text}`);
    }
    for (const currency of ['EUR', 'USD', 'GBP', 'MAD', 'AED', 'INR', 'JPY', 'CHF', 'TND', 'XOF']) {
      assert.equal(undrawable(amountInWords(1_234_560_000, currency, pack.code)), '', `${pack.code} ${currency}`);
    }
  }
});
