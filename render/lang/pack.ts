import type { Problem, ProblemCode } from '../../engine/index.ts';
import { ar } from './ar.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

export type Language = 'EN' | 'FR' | 'AR';
export type DocumentKind = 'QUOTE' | 'INVOICE' | 'CREDIT_NOTE';

export type LabelKey =
  | 'number' | 'issueDate' | 'dueDate' | 'validUntil' | 'version' | 'subject' | 'notes' | 'correctsInvoice'
  | 'from' | 'billTo' | 'reference'
  | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'tax' | 'lineTotal' | 'period'
  | 'taxRecap' | 'rate' | 'taxableBase' | 'taxAmount'
  | 'subtotal' | 'discountTotal' | 'taxTotal' | 'total' | 'amountInWords' | 'pricesIncludeTax'
  | 'paymentDetails' | 'page' | 'of' | 'line';

export type LanguagePack = {
  code: Language;
  /** A right-to-left pack has its page mirrored (render/rtl.ts). */
  direction: 'ltr' | 'rtl';
  titles: Record<DocumentKind, string>;
  draft: string;
  /** What joins a label to its value: French sets a no-break space before the colon. */
  colon: string;
  labels: Record<LabelKey, string>;
  /** A unit in the form its quantity asks for (Arabic: 3 أيام, 15 يوم); absent, the unit prints as given. */
  countedUnit?: (quantity: number, unit: string) => string;
  /** The number's label per document kind (رقم الفاتورة); absent, labels.number. */
  numberLabels?: Partial<Record<DocumentKind, string>>;
  /** The title of a document that charges tax (فاتورة ضريبية); absent, titles. */
  taxedTitles?: Partial<Record<DocumentKind, string>>;
  /**
   * Totals that show the discount as rows above the sum (the total before discount, then
   * the discount), instead of a note under it. Used when prices exclude tax: only then does the
   * total before discount less the discount give the subtotal.
   */
  discountRows?: { gross: string; discount: string };
  problems: Record<ProblemCode, string>;
};

export const PACKS: Record<Language, LanguagePack> = { EN: en, FR: fr, AR: ar };

/** An engine problem, worded for a person, with the line and value that caused it. */
export function describeProblem(problem: Problem, language: Language): string {
  const pack = PACKS[language];
  const parts = [pack.problems[problem.code]];
  if (problem.line !== undefined) parts.push(`${pack.labels.line} ${problem.line}`);
  if (problem.value !== undefined && problem.value !== null) parts.push(String(problem.value));
  return parts.join(' — ');
}
