import { test } from 'node:test';
import assert from 'node:assert/strict';
import { divRound, isCurrencyCode, isSafe, minorDigits, quantum, roundToMinor, toScaled } from '../../engine/money.ts';

test('a currency has the minor digits of ISO 4217, two unless listed', () => {
  assert.equal(minorDigits('EUR'), 2);
  assert.equal(minorDigits('JPY'), 0);
  assert.equal(minorDigits('KWD'), 3);
  assert.equal(minorDigits('CLF'), 4);
  assert.equal(quantum('EUR'), 10_000n);
  assert.equal(quantum('JPY'), 1_000_000n);
  assert.equal(quantum('KWD'), 1_000n);
});

test('a currency code is three capital letters', () => {
  assert.equal(isCurrencyCode('EUR'), true);
  for (const bad of ['eur', 'EU', 'EURO', '', '€']) assert.equal(isCurrencyCode(bad), false, bad);
});

test('division rounds half away from zero, the same on both sides of zero', () => {
  assert.equal(divRound(5n, 10n), 1n);
  assert.equal(divRound(-5n, 10n), -1n);
  assert.equal(divRound(14n, 10n), 1n);
  assert.equal(divRound(-14n, 10n), -1n);
  assert.equal(divRound(15n, 10n), 2n);
  assert.equal(divRound(-15n, 10n), -2n);
  assert.equal(divRound(0n, 10n), 0n);
});

test('an amount rounds to the currency’s minor unit', () => {
  assert.equal(roundToMinor(9_975_000n, 1n, 'EUR'), 9_980_000n); // 9.975 → 9.98
  assert.equal(roundToMinor(-25_000n, 1n, 'EUR'), -30_000n); // −0.025 → −0.03
  assert.equal(roundToMinor(499_500_000n, 1n, 'JPY'), 500_000_000n); // ¥499.5 → ¥500
  assert.equal(roundToMinor(1_234_500n, 1n, 'KWD'), 1_235_000n); // 1.2345 → 1.235
});

test('a decimal is read from its digits, never multiplied as a float', () => {
  assert.equal(toScaled(1.5, 3), 1500n);
  assert.equal(toScaled(9.975, 4), 99750n);
  assert.equal(toScaled(12.5, 2), 1250n);
  assert.equal(toScaled(1.005, 3), 1005n);
  assert.equal(toScaled(-2, 3), -2000n);
  assert.equal(toScaled(0.1 + 0.2, 3), null); // 0.30000000000000004
  assert.equal(toScaled(1.0005, 3), null);
  assert.equal(toScaled(Number.NaN, 3), null);
  assert.equal(toScaled(Number.POSITIVE_INFINITY, 3), null);
  assert.equal(toScaled(1e-7, 3), null);
});

test('only amounts within the largest safe integer are safe', () => {
  assert.equal(isSafe(BigInt(Number.MAX_SAFE_INTEGER)), true);
  assert.equal(isSafe(BigInt(Number.MAX_SAFE_INTEGER) + 1n), false);
  assert.equal(isSafe(-BigInt(Number.MAX_SAFE_INTEGER) - 1n), false);
});
