import type { Problem, ProblemCode } from '../../engine/index.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

export type Language = 'EN' | 'FR';
export type DocumentKind = 'QUOTE' | 'INVOICE' | 'CREDIT_NOTE';

export type LabelKey =
  | 'number' | 'issueDate' | 'dueDate' | 'validUntil' | 'version' | 'subject' | 'notes' | 'correctsInvoice'
  | 'from' | 'billTo' | 'reference'
  | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'tax' | 'lineTotal' | 'period'
  | 'taxRecap' | 'rate' | 'taxableBase' | 'taxAmount'
  | 'subtotal' | 'discountTotal' | 'taxTotal' | 'total' | 'amountInWords' | 'pricesIncludeTax'
  | 'paymentDetails' | 'page' | 'line';

export type LanguagePack = {
  code: Language;
  titles: Record<DocumentKind, string>;
  draft: string;
  labels: Record<LabelKey, string>;
  problems: Record<ProblemCode, string>;
};

export const PACKS: Record<Language, LanguagePack> = { EN: en, FR: fr };

/** An engine problem, worded for a person, with the line and value that caused it. */
export function describeProblem(problem: Problem, language: Language): string {
  const pack = PACKS[language];
  const parts = [pack.problems[problem.code]];
  if (problem.line !== undefined) parts.push(`${pack.labels.line} ${problem.line}`);
  if (problem.value !== undefined && problem.value !== null) parts.push(String(problem.value));
  return parts.join(' — ');
}
