/**
 * Integer money. Amounts are micros (1 unit = 1 000 000 micros), as Twenty's
 * CURRENCY fields store them. Products and divisions use BigInt, so no float
 * ever enters a computation.
 */

// ISO 4217 minor units that are not 2. Not taken from Intl, which disagrees
// between browsers and Node for a few currencies.
const MINOR_DIGITS: Readonly<Record<string, number>> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0,
  RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const isCurrencyCode = (code: string): boolean => /^[A-Z]{3}$/.test(code);

export const minorDigits = (currencyCode: string): number => MINOR_DIGITS[currencyCode] ?? 2;

/** Micros in one minor unit: 10 000 for EUR, 1 000 000 for JPY, 1 000 for KWD. */
export const quantum = (currencyCode: string): bigint => 10n ** BigInt(6 - minorDigits(currencyCode));

/** numerator ÷ denominator, rounded half away from zero. The denominator is positive. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator; // BigInt division truncates toward zero,
  const remainder = numerator % denominator; // and the remainder takes the numerator's sign
  const twice = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twice < denominator) return quotient;
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

/** numerator ÷ denominator micros, rounded half away from zero to the currency's minor unit. */
export function roundToMinor(numerator: bigint, denominator: bigint, currencyCode: string): bigint {
  const step = quantum(currencyCode);
  return divRound(numerator, denominator * step) * step;
}

/**
 * A decimal as a count of 10^-places, read from its digits, never by
 * multiplying a float: toScaled(9.975, 4) is 99750n. Null when the value is
 * not finite or has more decimals than `places`.
 */
export function toScaled(value: number, places: number): bigint | null {
  if (!Number.isFinite(value)) return null;
  // String() gives the shortest decimal that reads back as the same number.
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match) return null; // exponent notation: below 1e-6 or from 1e21
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > places) return null;
  const scaled = BigInt(whole + fraction.padEnd(places, '0'));
  return sign === '-' ? -scaled : scaled;
}

export const isSafe = (micros: bigint): boolean => micros <= MAX_SAFE && micros >= -MAX_SAFE;
