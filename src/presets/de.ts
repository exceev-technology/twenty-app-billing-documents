import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'de',
  name: 'Germany',
  countryCode: 'DE',
  language: 'EN',
  locale: 'de-DE',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {
    invoice: 'Unless a line states a period, the date of supply is the invoice date.',
  },
  qrMode: 'NONE',
  complianceNote: 'Every business must be able to receive e-invoices (XRechnung or ZUGFeRD) since 1 January 2025. Issuing them is mandatory from 1 January 2027 for businesses with a prior-year turnover above €800,000, and for all businesses from 1 January 2028. Until your date, a PDF invoice remains allowed for domestic B2B. Documents print in English until a German language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: '§ 14 UStG: Ausstellung von Rechnungen (Gesetze im Internet)', url: 'https://www.gesetze-im-internet.de/ustg_1980/__14.html' },
    { title: '§ 19 UStG: Besteuerung der Kleinunternehmer (Gesetze im Internet)', url: 'https://www.gesetze-im-internet.de/ustg_1980/__19.html' },
    { title: '§ 13b UStG: Leistungsempfänger als Steuerschuldner (Gesetze im Internet)', url: 'https://www.gesetze-im-internet.de/ustg_1980/__13b.html' },
    { title: 'FAQ zur Einführung der obligatorischen E-Rechnung (Bundesministerium der Finanzen)', url: 'https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html' },
  ],
  identifierTypes: [
    { key: 'de.ust-idnr', name: 'USt-IdNr.', appliesTo: 'BOTH', validationPattern: '^DE\\d{9}$' },
    { key: 'de.steuernummer', name: 'Steuernummer', appliesTo: 'SELLER' },
    { key: 'de.handelsregister', name: 'Handelsregister', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'de.ust.19', name: 'USt 19 %', category: 'STANDARD', components: [{ name: 'USt', rate: 19 }] },
    { code: 'de.ust.7', name: 'USt 7 %', category: 'REDUCED', components: [{ name: 'USt', rate: 7 }] },
    { code: 'de.ust.0', name: 'USt 0 %', category: 'ZERO', components: [{ name: 'USt', rate: 0 }] },
    { code: 'de.kleinunternehmer', name: 'Kleinunternehmer', category: 'EXEMPT', printNote: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', components: [{ name: 'USt', rate: 0 }] },
    { code: 'de.reverse-charge', name: 'Reverse charge', category: 'REVERSE_CHARGE', printNote: 'Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG).', components: [{ name: 'USt', rate: 0 }] },
    { code: 'de.intra-eu', name: 'Innergemeinschaftliche Lieferung', category: 'EXEMPT', printNote: 'Steuerfreie innergemeinschaftliche Lieferung (§ 4 Nr. 1b UStG).', components: [{ name: 'USt', rate: 0 }] },
  ],
};

export default preset;
