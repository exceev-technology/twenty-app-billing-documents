import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'ma',
  name: 'Morocco',
  countryCode: 'MA',
  language: 'FR',
  locale: 'fr-MA',
  defaultCurrency: 'MAD',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: true,
  numbering: { quote: 'D-{YYYY}-{SEQ:4}', invoice: 'F-{YYYY}-{SEQ:4}', creditNote: 'AV-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 60,
  defaultQuoteValidityDays: 30,
  mentions: {
    invoice: 'En cas de retard de paiement, des pénalités de retard sont exigibles conformément à la loi n° 69-21 relative aux délais de paiement.',
  },
  qrMode: 'NONE',
  complianceNote: 'The tax administration (DGI) is preparing mandatory electronic invoicing. Until it applies to your business, this PDF is your invoice. Check the current timetable before relying on it.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Code général des impôts 2026, articles 91, 92, 99 et 145 (Direction générale des impôts)', url: 'https://www.tax.gov.ma/wps/wcm/connect/08712531-1e81-4e28-a38b-2bd9edf8e09e/CGI+2026+FR.pdf' },
    { title: 'Loi n° 69-21 relative aux délais de paiement, Bulletin officiel n° 7204 du 15 juin 2023 (Secrétariat général du gouvernement)', url: 'https://www.sgg.gov.ma/BO/FR/2873/2023/BO_7204_Fr.pdf' },
  ],
  identifierTypes: [
    { key: 'ma.ice', name: 'ICE', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, includeInQr: true, validationPattern: '^\\d{15}$' },
    { key: 'ma.if', name: 'IF', appliesTo: 'SELLER', requiredForSeller: true },
    { key: 'ma.rc', name: 'RC', appliesTo: 'SELLER', requiredForSeller: true },
    { key: 'ma.tp', name: 'TP', appliesTo: 'SELLER', requiredForSeller: true },
    { key: 'ma.cnss', name: 'CNSS', appliesTo: 'SELLER' },
  ],
  taxCodes: [
    { code: 'ma.tva.20', name: 'TVA 20 %', category: 'STANDARD', components: [{ name: 'TVA', rate: 20 }] },
    { code: 'ma.tva.10', name: 'TVA 10 %', category: 'REDUCED', components: [{ name: 'TVA', rate: 10 }] },
    { code: 'ma.exonere', name: 'Exonéré de TVA', category: 'EXEMPT', printNote: 'Exonéré de TVA en application du Code général des impôts (articles 91 et 92).', components: [{ name: 'TVA', rate: 0 }] },
  ],
};

export default preset;
