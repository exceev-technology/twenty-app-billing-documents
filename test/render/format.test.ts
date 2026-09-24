import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, formatDate, formatMoney, formatPercent, formatQuantity, formatUnitPrice } from '../../render/format.ts';
import { undrawable } from '../../render/glyphs.ts';

test('money is formatted with the currency’s own decimals', () => {
  assert.match(formatMoney(1_234_560_000, 'EUR', 'fr-FR'), /^1 234,56 €$/);
  assert.match(formatMoney(1_099_000_000, 'JPY', 'en-GB'), /^JP¥1,099$/);
  assert.match(formatMoney(1_235_000, 'KWD', 'en-GB'), /^KWD 1\.235$/);
});

test('no narrow space survives, because the font has no glyph for it', () => {
  for (const locale of ['fr-FR', 'fr-CA', 'en-GB']) {
    assert.doesNotMatch(formatMoney(1_234_567_890, 'EUR', locale), /[  ]/);
  }
});

test('quantities and percentages follow the locale', () => {
  assert.equal(formatQuantity(1.5, 'fr-FR'), '1,5');
  assert.equal(formatQuantity(12, 'en-GB'), '12');
  assert.equal(formatPercent(9.975, 'en-GB'), '9.975%');
  assert.equal(formatPercent(20, 'fr-FR').replace(/ /g, ' '), '20 %');
});

test('a date is read from its digits and printed in the locale’s order', () => {
  assert.equal(formatDate('2026-09-24', 'en-GB'), '24/09/2026');
  assert.equal(formatDate('2026-09-24', 'fr-FR'), '24/09/2026');
  assert.equal(formatDate('2026-12-31', 'en-US'), '12/31/2026');
});

test('amounts in words, in English', () => {
  assert.equal(amountInWords(1_234_560_000, 'EUR', 'EN'), 'one thousand two hundred and thirty-four euros and fifty-six cents');
  assert.equal(amountInWords(80_000_000, 'GBP', 'EN'), 'eighty pounds');
  assert.equal(amountInWords(71_000_000, 'USD', 'EN'), 'seventy-one dollars');
  assert.equal(amountInWords(1_001_000_000, 'USD', 'EN'), 'one thousand and one dollars');
  assert.equal(amountInWords(1_099_000_000, 'JPY', 'EN'), 'one thousand and ninety-nine yen');
});

test('amounts in words, in French', () => {
  assert.equal(amountInWords(1_234_560_000, 'EUR', 'FR'), 'mille deux cent trente-quatre euros et cinquante-six centimes');
  assert.equal(amountInWords(80_000_000, 'EUR', 'FR'), 'quatre-vingts euros');
  assert.equal(amountInWords(71_000_000, 'MAD', 'FR'), 'soixante et onze dirhams');
  assert.equal(amountInWords(200_000_000, 'EUR', 'FR'), 'deux cents euros');
  assert.equal(amountInWords(201_000_000, 'EUR', 'FR'), 'deux cent un euros');
  assert.equal(amountInWords(91_000_000, 'EUR', 'FR'), 'quatre-vingt-onze euros');
});

test('French grammar: vingt and cent before mille, de before a currency after million, zero is singular', () => {
  assert.equal(amountInWords(80_000_000_000, 'EUR', 'FR'), 'quatre-vingt mille euros');
  assert.equal(amountInWords(200_000_000_000, 'EUR', 'FR'), 'deux cent mille euros');
  assert.equal(amountInWords(80_000_000_000_000, 'EUR', 'FR'), 'quatre-vingts millions d’euros');
  assert.equal(amountInWords(1_000_000_000_000, 'EUR', 'FR'), 'un million d’euros');
  assert.equal(amountInWords(2_000_000_000_000, 'USD', 'FR'), 'deux millions de dollars');
  assert.equal(amountInWords(1_500_000_000_000, 'EUR', 'FR'), 'un million cinq cent mille euros');
  assert.equal(amountInWords(0, 'EUR', 'FR'), 'zéro euro');
  assert.equal(amountInWords(0, 'EUR', 'EN'), 'zero euros');
});

test('a currency the packs have no words for falls back to its code, and keeps its minor amount', () => {
  assert.equal(amountInWords(5_000_000, 'XTS', 'EN'), 'five XTS');
  assert.equal(amountInWords(1_234_560_000, 'SEK', 'EN'), 'one thousand two hundred and thirty-four SEK and 56/100');
  assert.equal(amountInWords(1_235_000, 'KWD', 'FR'), 'un KWD et 235/1000');
});

test('the francophone currencies have their own words', () => {
  assert.equal(amountInWords(12_345_000, 'TND', 'FR'), 'douze dinars et trois cent quarante-cinq millimes');
  assert.equal(amountInWords(1_234_560_000, 'CHF', 'FR'), 'mille deux cent trente-quatre francs et cinquante-six centimes');
  assert.equal(amountInWords(5_000_000_000, 'XOF', 'FR'), 'cinq mille francs CFA');
});

test('every locale prints Latin digits, Gregorian years and no bidi marks, so the font can draw them', () => {
  const BIDI = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/;
  for (const locale of ['ar-EG', 'ar-SA', 'fa-IR', 'bn-BD', 'mr-IN', 'th-TH']) {
    const printed = [
      formatMoney(1_234_500_000, 'EUR', locale), formatUnitPrice(12_500, 'EUR', locale),
      formatQuantity(1234.5, locale), formatPercent(12.5, locale), formatDate('2026-09-24', locale),
    ];
    for (const text of printed) {
      assert.equal(undrawable(text), '', `${locale}: ${text}`);
      assert.doesNotMatch(text, BIDI, `${locale}: ${JSON.stringify(text)}`);
    }
    assert.match(formatDate('2026-09-24', locale), /2026/, `${locale} left the Gregorian calendar`);
  }
});

test('a currency sign the font lacks prints as its ISO code instead', () => {
  const hryvnia = formatMoney(1_234_500_000, 'UAH', 'uk-UA');
  assert.match(hryvnia, /UAH/);
  assert.equal(undrawable(hryvnia), '');
  assert.match(formatUnitPrice(12_500, 'GEL', 'ka-GE'), /GEL/);
  assert.match(formatMoney(1_000_000, 'EUR', 'fr-FR'), /€/);
});

test('a unit price keeps the decimals it was priced with, and never fewer than the currency’s', () => {
  assert.equal(formatUnitPrice(12_500, 'EUR', 'en-GB'), '€0.0125');
  assert.equal(formatUnitPrice(640_000_000, 'EUR', 'en-GB'), '€640.00');
  assert.equal(formatUnitPrice(1_000_001, 'EUR', 'en-GB'), '€1.000001');
});
