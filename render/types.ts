import type { DocumentResult } from '../engine/index.ts';
import type { DocumentKind, Language, LanguagePack } from './lang/pack.ts';

export type { DocumentKind, Language };
export type TemplateKey = 'classic' | 'modern' | 'compact' | 'letterhead' | 'receipt';

export type Party = {
  name: string;
  legalName?: string | null;
  legalForm?: string | null;
  addressLines: string[];
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type PrintedIdentifier = { label: string; value: string; side: 'SELLER' | 'BUYER' };

export type RenderLine = {
  /** The line's record id. It is echoed in the result, never printed. */
  key: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceMicros: number;
  discountPercent: number | null;
  taxLabel: string;
  lineTotalMicros: number;
  periodStart?: string | null;
  periodEnd?: string | null;
};

export type RenderInput = {
  template: TemplateKey;
  language: Language;
  locale: string;
  kind: DocumentKind;
  title?: string | null;
  /** Null prints the draft marker: rendering never invents a number. */
  number: string | null;
  version?: number | null;
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  subject?: string | null;
  notes?: string | null;
  currencyCode: string;
  pricesIncludeTax: boolean;
  seller: Party;
  buyer: Party;
  buyerReference?: string | null;
  identifiers: PrintedIdentifier[];
  lines: RenderLine[];
  /** The engine's result, unchanged: rendering computes no figure of its own. */
  totals: DocumentResult;
  /** The printed name of each code in totals.taxCodesUsed, keyed by that code: the code itself is a record id. */
  taxNames: Record<string, string>;
  taxNotes: string[];
  mentions?: string | null;
  amountInWords: boolean;
  brand: {
    accentColor?: string | null;
    footerNote?: string | null;
    paymentDetails?: string | null;
    logo?: { bytes: Uint8Array; type: 'image/png' | 'image/jpeg' } | null;
  };
  qr?: { mode: 'PAYLOAD' | 'URL_WITH_PAYLOAD'; payload: string; baseUrl?: string | null } | null;
};

export type RenderResult = { bytes: Uint8Array; pages: number };

export type RenderProblemCode =
  | 'UNSUPPORTED_SCRIPT' | 'UNSUPPORTED_IMAGE' | 'UNKNOWN_TEMPLATE'
  | 'UNKNOWN_LANGUAGE' | 'QR_PAYLOAD_TOO_LONG' | 'MISSING_TAX_NAME'
  | 'INVALID_LOCALE' | 'INVALID_DATE' | 'INVALID_CURRENCY';

export type RenderProblem = { code: RenderProblemCode; field?: string; value?: string };

export class RenderError extends Error {
  readonly problems: readonly RenderProblem[];

  constructor(problems: readonly RenderProblem[]) {
    super(`The renderer refused: ${problems.map((problem) => problem.code).join(', ')}`);
    this.name = 'RenderError';
    this.problems = problems;
  }
}

/** A pdfmake document definition. Only render/pdf.ts knows its real shape. */
export type PdfDefinition = Record<string, unknown>;

export type Layout = (input: RenderInput, pack: LanguagePack) => PdfDefinition;
