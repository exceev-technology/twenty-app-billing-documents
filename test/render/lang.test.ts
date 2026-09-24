import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, describeProblem } from '../../render/lang/pack.ts';
import { definitionFor } from '../../render/document.ts';
import { mockInvoice } from '../../render/samples/mock.ts';
import { printed } from './helpers/printed.ts';

const CODES = ['NO_LINES', 'INVALID_CURRENCY', 'CURRENCY_MISMATCH', 'MISSING_TAX_CODE', 'INVALID_QUANTITY',
  'INVALID_RATE', 'INVALID_DISCOUNT', 'INVALID_AMOUNT', 'AMOUNT_TOO_LARGE', 'MISSING_TAX_RATE',
  'TAX_CODE_CONFLICT', 'INVALID_PATTERN', 'PATTERN_REPEATS_NUMBERS'];

test('both packs carry the same labels, and none is empty', () => {
  const [en, fr] = [PACKS.EN, PACKS.FR];
  assert.deepEqual(Object.keys(en.labels).sort(), Object.keys(fr.labels).sort());
  for (const pack of [en, fr]) {
    for (const [key, value] of Object.entries(pack.labels)) assert.ok(value.trim().length > 0, `${pack.code} ${key}`);
    for (const kind of ['QUOTE', 'INVOICE', 'CREDIT_NOTE']) assert.ok(pack.titles[kind as 'QUOTE'].trim().length > 0, kind);
    assert.ok(pack.draft.trim().length > 0);
  }
});

test('both packs word every problem the engine can report', () => {
  for (const pack of [PACKS.EN, PACKS.FR]) {
    assert.deepEqual(Object.keys(pack.problems).sort(), [...CODES].sort(), pack.code);
    for (const code of CODES) assert.ok(pack.problems[code as 'NO_LINES'].trim().length > 0, `${pack.code} ${code}`);
  }
});

test('the two packs are actually different languages', () => {
  assert.notEqual(PACKS.EN.titles.INVOICE, PACKS.FR.titles.INVOICE);
  assert.equal(PACKS.FR.titles.INVOICE, 'Facture');
});

test('a problem is worded with the line and the value that caused it', () => {
  const english = describeProblem({ code: 'MISSING_TAX_CODE', line: 'line-3' }, 'EN');
  assert.match(english, /tax code/i);
  assert.match(english, /line-3/);
  const french = describeProblem({ code: 'INVALID_RATE', line: 'line-1', value: 9.12345 }, 'FR');
  assert.match(french, /taux/i);
  assert.match(french, /9\.12345/);
});

test('French sets a no-break space before a colon, English does not', () => {
  const french = printed(definitionFor({ ...mockInvoice(), language: 'FR', locale: 'fr-FR' }));
  assert.ok(french.includes('Numéro\u00a0: INV-2026-0042'), 'no space before the French colon');
  assert.ok(french.includes('VAT number\u00a0: FR00000000000'), 'an identifier label kept the English colon');
  for (const key of ['number', 'issueDate', 'dueDate', 'subject', 'reference', 'paymentDetails', 'amountInWords'] as const) {
    const label = PACKS.FR.labels[key];
    assert.ok(french.includes(`${label}\u00a0: `) && !french.includes(`${label}: `), `${label} lacks its space before the colon`);
  }
  assert.ok(printed(definitionFor(mockInvoice())).includes('Number: INV-2026-0042'));
});

test('the French labels name no particular tax: TVA is one country\u2019s', () => {
  for (const [key, value] of Object.entries(PACKS.FR.labels)) assert.doesNotMatch(value, /\bTVA\b/, key);
});
