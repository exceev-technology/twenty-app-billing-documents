import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'generic',
  name: 'Generic',
  countryCode: null,
  language: 'EN',
  locale: 'en',
  defaultCurrency: null,
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'No country rules. Add the identifiers, tax codes and mentions your country requires.',
  verifiedOn: '2026-09-21',
  sources: [],
  identifierTypes: [
    { key: 'generic.tax-id', name: 'Tax ID', appliesTo: 'BOTH' },
    { key: 'generic.registration', name: 'Company registration', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'generic.no-tax', name: 'No tax', category: 'OUT_OF_SCOPE', components: [{ name: 'Tax', rate: 0 }] },
  ],
};

export default preset;
