import { minorDigits } from '../engine/index.ts';

/** Roboto has no glyph for a narrow no-break space or a thin space. */
const NARROW = /[  ]/g;
const wide = (text: string): string => text.replace(NARROW, ' ');

export function formatMoney(micros: number, currencyCode: string, locale: string): string {
  const digits = minorDigits(currencyCode);
  const format = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return wide(format.format(micros / 1_000_000));
}

export const formatQuantity = (value: number, locale: string): string =>
  wide(new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value));

export const formatPercent = (value: number, locale: string): string =>
  wide(new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 4 }).format(value / 100));

/** The date is read from its digits: no time zone can move it by a day. */
export function formatDate(isoDate: string, locale: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const stamp = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const format = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  return wide(format.format(stamp));
}

type CurrencyWords = { one: string; many: string; minorOne: string; minorMany: string };

const WORDS: Record<string, Record<'EN' | 'FR', CurrencyWords>> = {
  EUR: { EN: { one: 'euro', many: 'euros', minorOne: 'cent', minorMany: 'cents' }, FR: { one: 'euro', many: 'euros', minorOne: 'centime', minorMany: 'centimes' } },
  USD: { EN: { one: 'dollar', many: 'dollars', minorOne: 'cent', minorMany: 'cents' }, FR: { one: 'dollar', many: 'dollars', minorOne: 'cent', minorMany: 'cents' } },
  CAD: { EN: { one: 'dollar', many: 'dollars', minorOne: 'cent', minorMany: 'cents' }, FR: { one: 'dollar', many: 'dollars', minorOne: 'cent', minorMany: 'cents' } },
  GBP: { EN: { one: 'pound', many: 'pounds', minorOne: 'penny', minorMany: 'pence' }, FR: { one: 'livre', many: 'livres', minorOne: 'penny', minorMany: 'pence' } },
  MAD: { EN: { one: 'dirham', many: 'dirhams', minorOne: 'centime', minorMany: 'centimes' }, FR: { one: 'dirham', many: 'dirhams', minorOne: 'centime', minorMany: 'centimes' } },
  AED: { EN: { one: 'dirham', many: 'dirhams', minorOne: 'fils', minorMany: 'fils' }, FR: { one: 'dirham', many: 'dirhams', minorOne: 'fils', minorMany: 'fils' } },
  INR: { EN: { one: 'rupee', many: 'rupees', minorOne: 'paisa', minorMany: 'paise' }, FR: { one: 'roupie', many: 'roupies', minorOne: 'paisa', minorMany: 'paise' } },
  JPY: { EN: { one: 'yen', many: 'yen', minorOne: '', minorMany: '' }, FR: { one: 'yen', many: 'yens', minorOne: '', minorMany: '' } },
};

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const EN_SCALES: [number, string][] = [[1_000_000_000, 'billion'], [1_000_000, 'million'], [1000, 'thousand']];

function englishWords(value: number): string {
  if (value < 20) return EN_UNITS[value]!;
  if (value < 100) {
    const tens = EN_TENS[Math.floor(value / 10)]!;
    return value % 10 === 0 ? tens : `${tens}-${EN_UNITS[value % 10]}`;
  }
  if (value < 1000) {
    const hundreds = `${EN_UNITS[Math.floor(value / 100)]} hundred`;
    return value % 100 === 0 ? hundreds : `${hundreds} and ${englishWords(value % 100)}`;
  }
  for (const [scale, name] of EN_SCALES) {
    if (value >= scale) {
      const rest = value % scale;
      const head = `${englishWords(Math.floor(value / scale))} ${name}`;
      if (rest === 0) return head;
      return rest < 100 ? `${head} and ${englishWords(rest)}` : `${head} ${englishWords(rest)}`;
    }
  }
  return String(value);
}

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const FR_TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function frenchUnder100(value: number): string {
  if (value < 20) return FR_UNITS[value]!;
  const tensDigit = Math.floor(value / 10);
  const rest = value % 10;
  const tens = FR_TENS[tensDigit]!;
  if (tensDigit === 7 || tensDigit === 9) {
    if (tensDigit === 7 && rest === 1) return 'soixante et onze';
    return `${tens}-${FR_UNITS[10 + rest]}`;
  }
  if (rest === 0) return tensDigit === 8 ? 'quatre-vingts' : tens;
  if (rest === 1 && tensDigit !== 8) return `${tens} et un`;
  return `${tens}-${FR_UNITS[rest]}`;
}

function frenchWords(value: number): string {
  if (value < 100) return frenchUnder100(value);
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    if (rest === 0) return hundreds === 1 ? 'cent' : `${FR_UNITS[hundreds]} cents`;
    return hundreds === 1 ? `cent ${frenchUnder100(rest)}` : `${FR_UNITS[hundreds]} cent ${frenchUnder100(rest)}`;
  }
  const SCALES: [number, string, string][] = [[1_000_000_000, 'milliard', 'milliards'], [1_000_000, 'million', 'millions'], [1000, 'mille', 'mille']];
  for (const [scale, singular, plural] of SCALES) {
    if (value >= scale) {
      const count = Math.floor(value / scale);
      const rest = value % scale;
      const head = scale === 1000 && count === 1 ? 'mille' : `${frenchWords(count)} ${count === 1 ? singular : plural}`;
      return rest === 0 ? head : `${head} ${frenchWords(rest)}`;
    }
  }
  return String(value);
}

/** The total, spelled out, for the countries whose invoices require it. */
export function amountInWords(micros: number, currencyCode: string, language: 'EN' | 'FR'): string {
  const digits = minorDigits(currencyCode);
  const step = 10 ** (6 - digits);
  const units = Math.trunc(Math.abs(micros) / 1_000_000);
  const minor = Math.round((Math.abs(micros) % 1_000_000) / step);
  const spell = language === 'FR' ? frenchWords : englishWords;
  const words = WORDS[currencyCode]?.[language];
  const sign = micros < 0 ? (language === 'FR' ? 'moins ' : 'minus ') : '';
  if (!words) return `${sign}${spell(units)} ${currencyCode}`;
  const main = `${spell(units)} ${units === 1 ? words.one : words.many}`;
  if (minor === 0 || digits === 0) return `${sign}${main}`;
  const joiner = language === 'FR' ? ' et ' : ' and ';
  return `${sign}${main}${joiner}${spell(minor)} ${minor === 1 ? words.minorOne : words.minorMany}`;
}
