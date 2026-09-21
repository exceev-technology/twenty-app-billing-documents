import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'it',
  name: 'Italy',
  countryCode: 'IT',
  language: 'EN',
  locale: 'it-IT',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'Domestic invoices must be issued as FatturaPA XML through the SDI exchange system; this PDF is only a courtesy copy (copia di cortesia). Withholding tax (ritenuta d’acconto) and stamp duty (imposta di bollo) are not supported yet. Documents print in English until an Italian language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Fatturazione elettronica (Agenzia delle Entrate)', url: 'https://www.agenziaentrate.gov.it/portale/aree-tematiche/fatturazione-elettronica' },
    { title: 'D.P.R. 26 ottobre 1972, n. 633 (Normattiva)', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:presidente.repubblica:decreto:1972-10-26;633' },
  ],
  identifierTypes: [
    { key: 'it.partita-iva', name: 'Partita IVA', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^\\d{11}$' },
    { key: 'it.codice-fiscale', name: 'Codice fiscale', appliesTo: 'BOTH', validationPattern: '^([A-Z0-9]{16}|\\d{11})$' },
    { key: 'it.sdi', name: 'Codice destinatario (SDI)', appliesTo: 'BUYER', validationPattern: '^[A-Z0-9]{7}$' },
  ],
  taxCodes: [
    { code: 'it.iva.22', name: 'IVA 22%', category: 'STANDARD', components: [{ name: 'IVA', rate: 22 }] },
    { code: 'it.iva.10', name: 'IVA 10%', category: 'REDUCED', components: [{ name: 'IVA', rate: 10 }] },
    { code: 'it.iva.5', name: 'IVA 5%', category: 'REDUCED', components: [{ name: 'IVA', rate: 5 }] },
    { code: 'it.iva.4', name: 'IVA 4%', category: 'REDUCED', components: [{ name: 'IVA', rate: 4 }] },
    { code: 'it.esente', name: 'Esente', category: 'EXEMPT', printNote: 'Operazione esente ai sensi dell’art. 10 del D.P.R. 633/1972.', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'it.reverse-charge', name: 'Inversione contabile', category: 'REVERSE_CHARGE', printNote: 'Inversione contabile ai sensi dell’art. 17 del D.P.R. 633/1972.', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'it.forfettario', name: 'Regime forfettario', category: 'OUT_OF_SCOPE', printNote: 'Operazione senza applicazione dell’IVA, effettuata ai sensi dell’art. 1, commi 54-89, della Legge n. 190/2014.', components: [{ name: 'IVA', rate: 0 }] },
  ],
};

export default preset;
