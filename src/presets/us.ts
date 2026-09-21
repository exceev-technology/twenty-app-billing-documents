import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'us',
  name: 'United States',
  countryCode: 'US',
  language: 'EN',
  locale: 'en-US',
  defaultCurrency: 'USD',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  creditNoteTitle: 'Credit Memo',
  numbering: { quote: 'Q-{SEQ:5}', invoice: 'INV-{SEQ:5}', creditNote: 'CM-{SEQ:5}', reset: 'NEVER' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Sales tax depends on the state, county and city of the sale, and on whether you have nexus there. The preset ships no rates: add a tax code for each rate you charge.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Employer ID Numbers (IRS)', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers' },
    { title: 'State sales tax rates and vendor discounts (Federation of Tax Administrators)', url: 'https://taxadmin.org/wp-content/uploads/resources/tax_rates/vendors.pdf' },
  ],
  identifierTypes: [
    { key: 'us.ein', name: 'EIN', appliesTo: 'SELLER', validationPattern: '^\\d{2}-\\d{7}$' },
    { key: 'us.sales-tax-permit', name: 'Sales tax permit', appliesTo: 'SELLER' },
    { key: 'us.resale-certificate', name: 'Resale certificate', appliesTo: 'BUYER' },
  ],
  taxCodes: [
    { code: 'us.no-tax', name: 'No sales tax', category: 'OUT_OF_SCOPE', components: [{ name: 'Sales tax', rate: 0 }] },
    { code: 'us.resale', name: 'Sale for resale', category: 'EXEMPT', printNote: 'Exempt from sales tax: sale for resale, certificate on file.', components: [{ name: 'Sales tax', rate: 0 }] },
  ],
};

export default preset;
