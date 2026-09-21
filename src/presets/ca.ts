import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'ca',
  name: 'Canada',
  countryCode: 'CA',
  language: 'EN',
  locale: 'en-CA',
  defaultCurrency: 'CAD',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'In Quebec, the Charter of the French language requires invoices to be available in French. Provincial sales taxes (PST in British Columbia and Saskatchewan, RST in Manitoba) are charged only by businesses registered for them.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'GST/HST calculator and rates (Canada Revenue Agency)', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate/calculator.html' },
    { title: 'Input tax credits: information required on invoices (Canada Revenue Agency)', url: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html' },
    { title: 'Basic Rules for Applying the GST/HST and QST (Revenu Québec)', url: 'https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/basic-rules-for-applying-the-gsthst-and-qst/' },
  ],
  identifierTypes: [
    { key: 'ca.gst-hst', name: 'GST/HST number', appliesTo: 'SELLER', validationPattern: '^\\d{9}RT\\d{4}$' },
    { key: 'ca.qst', name: 'QST number', appliesTo: 'SELLER', validationPattern: '^\\d{10}TQ\\d{4}$' },
  ],
  taxCodes: [
    { code: 'ca.gst.5', name: 'GST 5%', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }] },
    { code: 'ca.on.hst.13', name: 'HST 13% (Ontario)', category: 'STANDARD', components: [{ name: 'HST', rate: 13 }] },
    { code: 'ca.hst.15', name: 'HST 15% (New Brunswick, Newfoundland and Labrador, Prince Edward Island)', category: 'STANDARD', components: [{ name: 'HST', rate: 15 }] },
    { code: 'ca.ns.hst.14', name: 'HST 14% (Nova Scotia)', category: 'STANDARD', components: [{ name: 'HST', rate: 14 }] },
    { code: 'ca.qc.gst-qst', name: 'GST 5% + QST 9.975% (Quebec)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'QST', rate: 9.975 }] },
    { code: 'ca.bc.gst-pst', name: 'GST 5% + PST 7% (British Columbia)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'PST', rate: 7 }] },
    { code: 'ca.mb.gst-rst', name: 'GST 5% + RST 7% (Manitoba)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'RST', rate: 7 }] },
    { code: 'ca.sk.gst-pst', name: 'GST 5% + PST 6% (Saskatchewan)', category: 'STANDARD', components: [{ name: 'GST', rate: 5 }, { name: 'PST', rate: 6 }] },
    { code: 'ca.zero', name: 'Zero-rated', category: 'ZERO', components: [{ name: 'GST/HST', rate: 0 }] },
    { code: 'ca.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt supply: no GST/HST charged.', components: [{ name: 'GST/HST', rate: 0 }] },
  ],
};

export default preset;
