export type Language = 'EN' | 'FR';
export type TaxCategory = 'STANDARD' | 'REDUCED' | 'ZERO' | 'EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';
export type AppliesTo = 'SELLER' | 'BUYER' | 'BOTH';
export type NumberingReset = 'NEVER' | 'YEARLY' | 'MONTHLY';
export type RoundingMode = 'PER_RATE_ON_TOTAL' | 'PER_LINE';
export type QrMode = 'NONE' | 'PAYLOAD' | 'URL_WITH_PAYLOAD';

export type PresetIdentifierType = {
  key: string;
  name: string;
  appliesTo: AppliesTo;
  requiredForSeller?: boolean;
  /** Applies to company buyers in the preset's country, or of unknown country. */
  requiredForBusinessBuyer?: boolean;
  printOnDocuments?: boolean;
  includeInQr?: boolean;
  validationPattern?: string;
};

export type PresetTaxComponent = { name: string; rate: number; compound?: boolean };

export type PresetTaxCode = {
  code: string;
  name: string;
  category: TaxCategory;
  printNote?: string;
  components: readonly PresetTaxComponent[];
};

export type PresetSource = { title: string; url: string };

export type Preset = {
  key: string;
  name: string;
  countryCode: string | null;
  language: Language;
  locale: string;
  defaultCurrency: string | null;
  roundingMode: RoundingMode;
  amountInWords: boolean;
  invoiceTitle?: string;
  creditNoteTitle?: string;
  numbering: { quote: string; invoice: string; creditNote: string; reset: NumberingReset };
  defaultPaymentTermDays: number;
  defaultQuoteValidityDays: number;
  mentions: { quote?: string; invoice?: string; creditNote?: string };
  qrMode: QrMode;
  complianceNote?: string;
  verifiedOn: string;
  sources: readonly PresetSource[];
  identifierTypes: readonly PresetIdentifierType[];
  taxCodes: readonly PresetTaxCode[];
};
