import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'nl',
  name: 'Netherlands',
  countryCode: 'NL',
  language: 'EN',
  locale: 'nl-NL',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'No B2B e-invoicing mandate was in force on the verification date. Documents print in English until a Dutch language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Factuureisen (Belastingdienst)', url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/factuureisen/factuureisen' },
    { title: 'Tarieven en vrijstellingen (Belastingdienst)', url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/tarieven_en_vrijstellingen/tarieven_en_vrijstellingen' },
    { title: 'U maakt gebruik van de kleineondernemersregeling (Belastingdienst)', url: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/btw/administratie_bijhouden/facturen_maken/factuureisen/aangepaste_regels_facturen/u_maakt_gebruik_van_de_kleineondernemersregeling' },
    { title: 'KVK-nummer: goed om te weten (Kamer van Koophandel)', url: 'https://www.kvk.nl/over-het-handelsregister/kvk-nummer-alles-wat-je-moet-weten/' },
  ],
  identifierTypes: [
    { key: 'nl.kvk', name: 'KvK number', appliesTo: 'SELLER', requiredForSeller: true, validationPattern: '^\\d{8}$' },
    { key: 'nl.btw', name: 'VAT ID (btw-id)', appliesTo: 'BOTH', validationPattern: '^NL\\d{9}B\\d{2}$' },
  ],
  taxCodes: [
    { code: 'nl.btw.21', name: 'Btw 21%', category: 'STANDARD', components: [{ name: 'Btw', rate: 21 }] },
    { code: 'nl.btw.9', name: 'Btw 9%', category: 'REDUCED', components: [{ name: 'Btw', rate: 9 }] },
    { code: 'nl.btw.0', name: 'Btw 0%', category: 'ZERO', components: [{ name: 'Btw', rate: 0 }] },
    { code: 'nl.kor', name: 'Kleineondernemersregeling', category: 'EXEMPT', printNote: 'Vrijgesteld van btw op grond van de kleineondernemersregeling.', components: [{ name: 'Btw', rate: 0 }] },
    { code: 'nl.verlegd', name: 'Btw verlegd', category: 'REVERSE_CHARGE', printNote: 'Btw verlegd.', components: [{ name: 'Btw', rate: 0 }] },
    { code: 'nl.intra-eu', name: 'Intracommunautaire levering', category: 'EXEMPT', printNote: 'Intracommunautaire levering.', components: [{ name: 'Btw', rate: 0 }] },
  ],
};

export default preset;
