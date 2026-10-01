import type { Problem } from '../../engine/index.ts';
import { describeProblem, type DocumentKind, type Language } from '../../render/lang/pack.ts';
import type { RenderProblem, RenderProblemCode } from '../../render/types.ts';
import { en } from './en.ts';
import { fr } from './fr.ts';

export type { DocumentKind, Language };

export type LifecycleProblemCode =
  | 'NOT_ALLOWED' | 'WRONG_STATUS' | 'ALREADY_ISSUED'
  | 'MISSING_ISSUER' | 'MISSING_PROFILE' | 'MISSING_BUYER' | 'MISSING_CURRENCY'
  | 'MISSING_IDENTIFIER' | 'INVALID_IDENTIFIER' | 'IDENTIFIER_OWNER'
  | 'MISSING_INVOICE' | 'INVOICE_NOT_ISSUED' | 'INVOICE_MISMATCH'
  | 'DATE_IN_FUTURE' | 'DATE_BEFORE_LAST' | 'DUE_BEFORE_ISSUE' | 'CLOCK_SKEW' | 'LEDGER_BEHIND' | 'HELD_NUMBER_ELSEWHERE'
  | 'QUOTE_NOT_OPEN' | 'ALREADY_INVOICED' | 'NOT_ISSUED' | 'INVOICE_CANCELLED' | 'NOTHING_TO_CREDIT' | 'REMAINDER_UNKNOWN' | 'OVER_CREDIT';

/**
 * A problem is data: `field` names what to fix, `value` what was found. The
 * packs word it. `documentType` is carried only by LEDGER_BEHIND, raw, so
 * each pack can word it with its own kind names instead of printing the enum.
 */
export type LifecycleProblem = { code: LifecycleProblemCode; field?: string; value?: string; documentType?: DocumentKind };

/** A refusal found part-way through, such as a sequence too far behind: it carries its problems to the action. */
export class LifecycleError extends Error {
  readonly problems: readonly LifecycleProblem[];

  constructor(problems: readonly LifecycleProblem[]) {
    super(`Lifecycle refused: ${problems.map((problem) => problem.code).join(', ')}`);
    this.name = 'LifecycleError';
    this.problems = problems;
  }
}

/** Any problem an action reports, tagged with who found it. */
export type AnyProblem =
  | ({ source: 'lifecycle' } & LifecycleProblem)
  | { source: 'engine'; problem: Problem; field?: string }
  | { source: 'render'; problem: RenderProblem };

/** What a button shows: the code, the sentence, and the field to fix when there is one. */
export type WordedProblem = { code: string; message: string; field?: string };

export type UnitKey =
  | 'UNIT' | 'HOUR' | 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' | 'KG' | 'G' | 'TONNE'
  | 'M' | 'KM' | 'M2' | 'M3' | 'LITRE' | 'KWH' | 'FLAT_FEE' | 'PACKAGE';

/** The fields a guard may put back, by the names Twenty's REST API gives them. */
export type FieldKey =
  | 'subject' | 'issuerId' | 'companyId' | 'personId' | 'issueDate' | 'dueDate' | 'currencyCode'
  | 'pricesIncludeTax' | 'language' | 'notes' | 'buyerReference' | 'invoiceId' | 'reason'
  | 'documentType' | 'periodKey' | 'lastValue';

export type StatusKey = 'DRAFT' | 'ISSUED' | 'SENT' | 'PAID' | 'CANCELLED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'INVOICED';

/**
 * Which status rule a move broke (spec §7, flows spec §8): issuing, returning to draft,
 * cancelling, invoicing a quote, sending or paying an invoice that is not issued,
 * moving a quote out of Invoiced while its invoice lives, or reviving a cancelled
 * numbered invoice.
 */
export type StatusRule = 'ISSUE' | 'DRAFT' | 'CANCEL' | 'INVOICED' | 'NOT_ISSUED' | 'UNINVOICE' | 'UNCANCEL';

type Details = { field?: string; value?: string; documentType?: DocumentKind };

export type LifecyclePack = {
  code: Language;
  problems: Record<LifecycleProblemCode, (details: Details) => string>;
  renderProblems: Record<RenderProblemCode, (details: Details) => string>;
  units: Record<UnitKey, string>;
  fields: Record<FieldKey, string>;
  statuses: Record<StatusKey, string>;
  kinds: Record<DocumentKind, string>;
  messages: {
    previewReady: string;
    issued: (kind: DocumentKind, number: string) => string;
    quotePdf: (number: string, version: number) => string;
    unexpected: (ref: string) => string;
    fieldsPutBack: (kind: DocumentKind, fields: readonly string[]) => string;
    lineChangePutBack: (kind: DocumentKind) => string;
    lineAddedRemoved: (kind: DocumentKind) => string;
    lineDeletedRestored: (kind: DocumentKind) => string;
    lineMoveReverted: (kind: DocumentKind) => string;
    documentRestored: (kind: DocumentKind, number: string) => string;
    statusPutBack: (rule: StatusRule, kind: DocumentKind, back: string) => string;
    createdAsDraft: (kind: DocumentKind, status: string) => string;
    ledgerDuplicateRemoved: string;
    ledgerChangePutBack: (fields: readonly string[]) => string;
    ledgerRestored: string;
    invoiceCreated: string;
    creditNoteCreated: (invoiceNumber: string) => string;
    cancelledBy: (invoiceNumber: string, creditNoteNumber: string) => string;
    alreadyCredited: (invoiceNumber: string) => string;
    invoiceNowCancelled: (invoiceNumber: string) => string;
    /** Printed on the credit note Cancel issues, as its reason. */
    cancellationReason: (invoiceNumber: string) => string;
    invoicedTimeline: (subject: string) => string;
    creditedTimeline: (creditNoteNumber: string, total: string) => string;
    cancelledTimeline: (creditNoteNumber: string) => string;
    quoteReopened: string;
    quoteReinvoiced: string;
  };
};

export const PACKS: Record<Language, LifecyclePack> = { EN: en, FR: fr };

/** The pack for a Twenty locale ('fr-FR', 'en', 'de-DE'): French for any French locale, English otherwise. */
export function packFor(locale: string | null | undefined): LifecyclePack {
  return /^fr(?:[-_]|$)/i.test(locale ?? '') ? fr : en;
}

/** One problem, worded. An engine problem's line is its position on the document, never a record id. */
export function describe(problem: AnyProblem, language: Language, lineNumbers?: ReadonlyMap<string, number>): WordedProblem {
  const pack = PACKS[language];
  if (problem.source === 'engine') {
    const { line } = problem.problem;
    const position = line === undefined ? undefined : lineNumbers?.get(line);
    const engineProblem = position === undefined ? problem.problem : { ...problem.problem, line: String(position) };
    return { code: problem.problem.code, message: describeProblem(engineProblem, language), ...(problem.field ? { field: problem.field } : {}) };
  }
  if (problem.source === 'render') {
    const { code, field, value } = problem.problem;
    return { code, message: pack.renderProblems[code]({ field, value }), ...(field ? { field } : {}) };
  }
  const { code, field, value, documentType } = problem;
  return { code, message: pack.problems[code]({ field, value, documentType }), ...(field ? { field } : {}) };
}

export function describeAll(problems: readonly AnyProblem[], language: Language, lineNumbers?: ReadonlyMap<string, number>): WordedProblem[] {
  return problems.map((problem) => describe(problem, language, lineNumbers));
}
