import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'ae',
  name: 'United Arab Emirates',
  countryCode: 'AE',
  language: 'EN',
  locale: 'en-AE',
  defaultCurrency: 'AED',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  invoiceTitle: 'Tax Invoice',
  creditNoteTitle: 'Tax Credit Note',
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Mandatory e-invoicing through accredited service providers is being phased in from 2026 to 2027. Until it applies to your business, a PDF tax invoice is valid. When the invoice is in another currency, the tax amount must also be shown in AED, which is not supported yet.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Federal Decree-Law No. (8) of 2017 on Value Added Tax (Federal Tax Authority, unofficial translation)', url: 'https://tax.gov.ae/DataFolder/Files/Pdf/VAT-Decree-Law-No-8-of-2017.pdf' },
    { title: 'Tax invoices — VAT public guide (Federal Tax Authority)', url: 'https://tax.gov.ae/Datafolder/Files/Pdf/2023/Knowledge%20Center%20Page/VAT11%20-%20Tax%20invoices%20En.pdf' },
    { title: 'UAE Electronic Invoicing (Ministry of Finance)', url: 'https://mof.gov.ae/en/about-ministry/mof-initiatives/einvoicing/' },
  ],
  identifierTypes: [
    { key: 'ae.trn', name: 'TRN', appliesTo: 'BOTH', requiredForSeller: true, validationPattern: '^\\d{15}$' },
  ],
  taxCodes: [
    { code: 'ae.vat.5', name: 'VAT 5%', category: 'STANDARD', components: [{ name: 'VAT', rate: 5 }] },
    { code: 'ae.vat.0', name: 'Zero-rated', category: 'ZERO', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'ae.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt from VAT.', components: [{ name: 'VAT', rate: 0 }] },
    { code: 'ae.reverse-charge', name: 'Reverse charge', category: 'REVERSE_CHARGE', printNote: 'Reverse charge: the recipient accounts for VAT (Article 48, Federal Decree-Law No. 8 of 2017).', components: [{ name: 'VAT', rate: 0 }] },
  ],
};

export default preset;
