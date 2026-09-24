import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountInWords, formatDate, formatMoney, formatPercent, formatQuantity } from '../../render/format.ts';

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

test('a currency the packs have no words for falls back to its code', () => {
  assert.equal(amountInWords(5_000_000, 'XTS', 'EN'), 'five XTS');
});
