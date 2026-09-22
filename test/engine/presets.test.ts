import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDocument, validatePattern, type TaxCodeInput } from '../../engine/index.ts';
import { PRESETS } from '../../src/presets/index.ts';

test('every preset tax code computes without a problem', () => {
  for (const preset of PRESETS) {
    const currencyCode = preset.defaultCurrency ?? 'EUR';
    for (const code of preset.taxCodes) {
      const tax: TaxCodeInput = {
        code: code.code,
        name: code.name,
        category: code.category,
        components: code.components.map((c, sortOrder) => ({ name: c.name, rate: c.rate, compound: c.compound ?? false, sortOrder })),
      };
      const problems = checkDocument({
        currencyCode,
        pricesIncludeTax: false,
        roundingMode: preset.roundingMode,
        lines: [{ key: code.code, quantity: 1, unitPrice: { amountMicros: 100_000_000, currencyCode }, discountPercent: null, tax }],
      });
      assert.deepEqual(problems, [], `${preset.key} ${code.code}`);
    }
  }
});

test('every preset numbering pattern is valid for its reset', () => {
  for (const preset of PRESETS) {
    const { quote, invoice, creditNote, reset } = preset.numbering;
    for (const pattern of [quote, invoice, creditNote]) {
      assert.deepEqual(validatePattern(pattern, reset), [], `${preset.key} ${pattern}`);
    }
  }
});
