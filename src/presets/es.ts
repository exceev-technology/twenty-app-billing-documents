import type { Preset } from './types.ts';

const preset: Preset = {
  key: 'es',
  name: 'Spain',
  countryCode: 'ES',
  language: 'EN',
  locale: 'es-ES',
  defaultCurrency: 'EUR',
  roundingMode: 'PER_RATE_ON_TOTAL',
  amountInWords: false,
  numbering: { quote: 'Q-{YYYY}-{SEQ:4}', invoice: 'INV-{YYYY}-{SEQ:4}', creditNote: 'CN-{YYYY}-{SEQ:4}', reset: 'YEARLY' },
  defaultPaymentTermDays: 30,
  defaultQuoteValidityDays: 30,
  mentions: {},
  qrMode: 'NONE',
  complianceNote: 'VERI*FACTU record-keeping is mandatory from 1 January 2027 for corporate taxpayers and 1 July 2027 for the self-employed and others using invoicing software. Mandatory B2B e-invoicing under the Crea y Crece law (Real Decreto 238/2026) applies 12 months (turnover above €8 million) and 24 months (all others) after a pending Ministerial Order takes effect, expected around October 2027 and October 2028. This app is not VERI*FACTU certified. IRPF withholding on professional invoices is not supported yet. Documents print in English until a Spanish language pack exists.',
  verifiedOn: '2026-09-21',
  sources: [
    { title: 'Ley 37/1992 del Impuesto sobre el Valor Añadido (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740' },
    { title: 'Real Decreto 1619/2012, Reglamento de facturación (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696' },
    { title: 'Real Decreto 238/2026, sistema de facturación electrónica obligatoria B2B (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295' },
    { title: 'Sistemas informáticos de facturación (SIF) y VERI*FACTU (Agencia Tributaria)', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html' },
  ],
  identifierTypes: [
    { key: 'es.nif', name: 'NIF', appliesTo: 'BOTH', requiredForSeller: true, requiredForBusinessBuyer: true, validationPattern: '^[A-Z0-9]\\d{7}[A-Z0-9]$' },
  ],
  taxCodes: [
    { code: 'es.iva.21', name: 'IVA 21 %', category: 'STANDARD', components: [{ name: 'IVA', rate: 21 }] },
    { code: 'es.iva.10', name: 'IVA 10 %', category: 'REDUCED', components: [{ name: 'IVA', rate: 10 }] },
    { code: 'es.iva.4', name: 'IVA 4 %', category: 'REDUCED', components: [{ name: 'IVA', rate: 4 }] },
    { code: 'es.exento', name: 'Exento', category: 'EXEMPT', printNote: 'Operación exenta de IVA (artículo 20 de la Ley 37/1992).', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'es.isp', name: 'Inversión del sujeto pasivo', category: 'REVERSE_CHARGE', printNote: 'Inversión del sujeto pasivo (artículo 84 de la Ley 37/1992).', components: [{ name: 'IVA', rate: 0 }] },
    { code: 'es.intra-eu', name: 'Entrega intracomunitaria', category: 'EXEMPT', printNote: 'Entrega intracomunitaria exenta (artículo 25 de la Ley 37/1992).', components: [{ name: 'IVA', rate: 0 }] },
  ],
};

export default preset;
