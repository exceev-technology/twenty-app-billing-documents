import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'be',
  name: 'Belgium',
  countryCode: 'BE',
  language: 'FR',
  locale: 'fr-BE',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'D-{YYYY}-{SEQ:4}', invoice: 'F-{YYYY}-{SEQ:4}', creditNote: 'NC-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Structured B2B e-invoicing over Peppol is mandatory since 1 January 2026. For domestic B2B, this PDF is not a valid invoice: send the invoice through Peppol. It remains usable for consumers and foreign buyers.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'E-facturation (SPF Finances)', url: 'https://finances.belgium.be/fr/entreprises/tva/e-facturation' },
    { title: 'TVA (SPF Finances)', url: 'https://finances.belgium.be/fr/tva' },
  ],
  identifierTypes: [
    { key: 'be.bce', name: 'Numéro d’entreprise', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^[01]\\d{3}\\.?\\d{3}\\.?\\d{3}$' },
    { key: 'be.tva', name: 'N° TVA', appliesTo: 'BOTH', validationPattern: '^BE[01]\\d{9}$' },
    { key: 'be.rpm', name: 'RPM', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'be.tva.21', name: 'TVA 21 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 21 }] },
    { code: 'be.tva.12', name: 'TVA 12 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 12 }] },
    { code: 'be.tva.6', name: 'TVA 6 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 6 }] },
    { code: 'be.tva.0', name: 'TVA 0 %', category: 'ZERO', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'be.franchise', name: 'Franchise des petites entreprises', category: 'EXEMPT', printNote: 'Régime particulier de franchise des petites entreprises (article 56bis, Code de la TVA).', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'be.autoliquidation', name: 'Autoliquidation', category: 'REVERSE_CHARGE', printNote: 'Autoliquidation.', components: [{ name: 'TVA', rate: 0 }] },
    { code: 'be.intracom', name: 'Livraison intracommunautaire', category: 'EXEMPT', printNote: 'Livraison intracommunautaire exemptée (article 39bis du Code de la TVA).', components: [{ name: 'TVA', rate: 0 }] },
  ],
};

export default preset;
