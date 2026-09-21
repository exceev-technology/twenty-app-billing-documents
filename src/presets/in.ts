import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'in',
  name: 'India',
  countryCode: 'IN',
  language: 'EN',
  locale: 'en-IN',
  defaultCurrency: 'INR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  invoiceTitle: 'Tax Invoice',
  creditNoteTitle: 'Credit Note',
  numbering: { quote: 'Q-{YYYY}-{SEQ:5}', invoice: 'INV-{YYYY}-{SEQ:5}', creditNote: 'CN-{YYYY}-{SEQ:5}', reset: 'NEVER' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Businesses above the e-invoicing turnover threshold must obtain an IRN from the Invoice Registration Portal; this PDF does not. A tax invoice must show the place of supply (state and code), which is not supported yet. Invoice numbers must be unique within a financial year and at most 16 characters. Rates follow the GST rate rationalisation in force from 22 September 2025; union territories use UTGST in place of SGST.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Tax Invoice, Credit and Debit Notes (CBIC)', url: 'https://cbic-gst.gov.in/gst-invoice-rules.html' },
    { title: 'Section 31 (Tax Invoice), CGST Act, 2017 (CBIC)', url: 'https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_CGST_act/active/chapter7/section31_v1.00.html' },
    { title: 'Recommendations of the 56th GST Council Meeting (Ministry of Finance / PIB)', url: 'https://gstcouncil.gov.in/sites/default/files/2025-09/press_release_press_information_bureau_0.pdf' },
    { title: 'e-Invoice System (GSTN)', url: 'https://einvoice1.gst.gov.in' },
  ],
  identifierTypes: [
    { key: 'in.gstin', name: 'GSTIN', appliesTo: 'BOTH', requiredForSeller: true, validationPattern: '^\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' },
    { key: 'in.pan', name: 'PAN', appliesTo: 'SELLER', validationPattern: '^[A-Z]{5}\\d{4}[A-Z]$' },
  ],
  taxCodes: [
    { code: 'in.gst.5.intra', name: 'GST 5% (intra-state)', category: 'REDUCED', components: [{ name: 'CGST', rate: 2.5 }, { name: 'SGST', rate: 2.5 }] },
    { code: 'in.gst.5.inter', name: 'GST 5% (inter-state)', category: 'REDUCED', components: [{ name: 'IGST', rate: 5 }] },
    { code: 'in.gst.18.intra', name: 'GST 18% (intra-state)', category: 'STANDARD', components: [{ name: 'CGST', rate: 9 }, { name: 'SGST', rate: 9 }] },
    { code: 'in.gst.18.inter', name: 'GST 18% (inter-state)', category: 'STANDARD', components: [{ name: 'IGST', rate: 18 }] },
    { code: 'in.gst.40.intra', name: 'GST 40% (intra-state)', category: 'STANDARD', components: [{ name: 'CGST', rate: 20 }, { name: 'SGST', rate: 20 }] },
    { code: 'in.gst.40.inter', name: 'GST 40% (inter-state)', category: 'STANDARD', components: [{ name: 'IGST', rate: 40 }] },
    { code: 'in.nil', name: 'Nil-rated', category: 'ZERO', components: [{ name: 'GST', rate: 0 }] },
    { code: 'in.exempt', name: 'Exempt', category: 'EXEMPT', printNote: 'Exempt supply under GST.', components: [{ name: 'GST', rate: 0 }] },
    { code: 'in.export-lut', name: 'Export under LUT', category: 'ZERO', printNote: 'Supply meant for export under LUT without payment of IGST.', components: [{ name: 'IGST', rate: 0 }] },
  ],
};

export default preset;
