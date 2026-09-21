import type { Option } from './fields.ts';

export const LANGUAGES: readonly Option[] = [
  ['EN', 'English', 'blue'],
  ['FR', 'French', 'purple'],
];

export const ROUNDING_MODES: readonly Option[] = [
  ['PER_RATE_ON_TOTAL', 'Per rate, on totals', 'blue'],
  ['PER_LINE', 'Per line', 'gray'],
];

export const NUMBERING_RESETS: readonly Option[] = [
  ['NEVER', 'Never', 'gray'],
  ['YEARLY', 'Every year', 'blue'],
  ['MONTHLY', 'Every month', 'sky'],
];

export const QR_MODES: readonly Option[] = [
  ['NONE', 'No QR code', 'gray'],
  ['PAYLOAD', 'Payload only', 'blue'],
  ['URL_WITH_PAYLOAD', 'Link with payload', 'green'],
];

export const APPLIES_TO: readonly Option[] = [
  ['SELLER', 'Seller', 'blue'],
  ['BUYER', 'Buyer', 'orange'],
  ['BOTH', 'Seller and buyer', 'purple'],
];

export const TAX_CATEGORIES: readonly Option[] = [
  ['STANDARD', 'Standard', 'blue'],
  ['REDUCED', 'Reduced', 'sky'],
  ['ZERO', 'Zero-rated', 'turquoise'],
  ['EXEMPT', 'Exempt', 'gray'],
  ['REVERSE_CHARGE', 'Reverse charge', 'orange'],
  ['OUT_OF_SCOPE', 'Out of scope', 'pink'],
];

export const UNITS: readonly Option[] = [
  ['UNIT', 'Unit', 'gray'],
  ['HOUR', 'Hour', 'blue'],
  ['DAY', 'Day', 'blue'],
  ['WEEK', 'Week', 'blue'],
  ['MONTH', 'Month', 'blue'],
  ['YEAR', 'Year', 'blue'],
  ['KG', 'Kilogram', 'orange'],
  ['G', 'Gram', 'orange'],
  ['TONNE', 'Tonne', 'orange'],
  ['M', 'Metre', 'green'],
  ['KM', 'Kilometre', 'green'],
  ['M2', 'Square metre', 'green'],
  ['M3', 'Cubic metre', 'green'],
  ['LITRE', 'Litre', 'turquoise'],
  ['KWH', 'Kilowatt-hour', 'yellow'],
  ['FLAT_FEE', 'Flat fee', 'purple'],
  ['PACKAGE', 'Package', 'pink'],
];

/** UN/ECE Recommendation 20 codes, what structured e-invoices expect. */
export const UNECE_UNIT_CODES: Readonly<Record<string, string>> = {
  UNIT: 'C62', HOUR: 'HUR', DAY: 'DAY', WEEK: 'WEE', MONTH: 'MON', YEAR: 'ANN',
  KG: 'KGM', G: 'GRM', TONNE: 'TNE', M: 'MTR', KM: 'KMT', M2: 'MTK', M3: 'MTQ',
  LITRE: 'LTR', KWH: 'KWH', FLAT_FEE: 'LS', PACKAGE: 'XPK',
};

export const QUOTE_STATUSES: readonly Option[] = [
  ['DRAFT', 'Draft', 'gray'],
  ['SENT', 'Sent', 'blue'],
  ['ACCEPTED', 'Accepted', 'green'],
  ['DECLINED', 'Declined', 'red'],
  ['EXPIRED', 'Expired', 'orange'],
  ['INVOICED', 'Invoiced', 'purple'],
];

export const INVOICE_STATUSES: readonly Option[] = [
  ['DRAFT', 'Draft', 'gray'],
  ['ISSUED', 'Issued', 'blue'],
  ['SENT', 'Sent', 'sky'],
  ['PAID', 'Paid', 'green'],
  ['CANCELLED', 'Cancelled', 'red'],
];

export const CREDIT_NOTE_STATUSES: readonly Option[] = [
  ['DRAFT', 'Draft', 'gray'],
  ['ISSUED', 'Issued', 'blue'],
];

export const DOCUMENT_TYPES: readonly Option[] = [
  ['QUOTE', 'Quote', 'sky'],
  ['INVOICE', 'Invoice', 'blue'],
  ['CREDIT_NOTE', 'Credit note', 'orange'],
];
