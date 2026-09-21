import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'gb',
  name: 'United Kingdom',
  countryCode: 'GB',
  language: 'EN',
  locale: 'en-GB',
  defaultCurrency: 'GBP',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'No e-invoicing mandate was in force on the verification date. A limited company must also show its registered office and place of registration: add them to the issuer’s footer note.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Record keeping for VAT: VAT invoices (HMRC VAT Notice 700/21)', url: 'https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021' },
    { title: 'VAT rates (GOV.UK)', url: 'https://www.gov.uk/vat-rates' },
    { title: 'Running a limited company: signs, stationery and promotional material (GOV.UK)', url: 'https://www.gov.uk/running-a-limited-company/signs-stationery-and-promotional-material' },
  ],
  identifierTypes: [
    { key: 'gb.vat', name: 'VAT registration number', appliesTo: 'BOTH', requiredForSeller: true, validationPattern: '^GB(\\d{9}|\\d{12}|GD\\d{3}|HA\\d{3})$' },
    { key: 'gb.company-number', name: 'Company number', appliesTo: 'SELLER', validationPattern: '^[A-Z0-9]{8}$' },
  ],
  taxCodes: [
    { code: 'gb.vat.20', name: 'VAT 20%', category: 'STANDARD', components: [{ name: 'VAT', rate: 20 }] },
    { code: 'gb.vat.5', name: 'VAT 5%', category: 'REDUCED', components: [{ name: 'VAT', rate: 5 }] },
    { code: 'gb.vat.0', name: 'Zero-rated', category: 'ZERO', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'gb.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt from VAT.', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'gb.reverse-charge', name: 'Domestic reverse charge', category: 'REVERSE_CHARGE', printNote: 'Reverse charge: customer to account for VAT to HMRC.', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'gb.outside-scope', name: 'Outside the scope of VAT', category: 'OUT_OF_SCOPE', printNote: 'Outside the scope of UK VAT.', components: [{ name: 'VAT', rate: 0 }] },
  ],
};

export default preset;
