import { checkDocument, validatePattern, type NumberingReset } from '../engine/index.ts';
import type { AnyProblem, LifecycleProblemCode } from './lang/pack.ts';
import type { Loaded } from './load.ts';
import { countryCode, idOf, textOf, toDocumentInput } from './map.ts';
import { heldNumberOf } from './numbering.ts';
import type { Row } from './store.ts';

export type GateAction = 'preview' | 'issue' | 'quotePdf';

export type GateContext = {
  action: GateAction;
  /** The clicking user's date, YYYY-MM-DD. */
  localDate: string;
  /** The latest issue date among the other numbered documents of the scope; used by an issue only. */
  latestIssueDate: string | null;
};

const lifecycle = (code: LifecycleProblemCode, details: { field?: string; value?: string } = {}): AnyProblem => ({ source: 'lifecycle', code, ...details });

const RESETS: readonly NumberingReset[] = ['NEVER', 'YEARLY', 'MONTHLY'];

/** The profile's numbering reset; an empty one reads as the field's default, YEARLY. */
export const resetOf = (profile: Row | null): NumberingReset => {
  const value = textOf(profile?.numberingReset) as NumberingReset;
  return RESETS.includes(value) ? value : 'YEARLY';
};

const appliesTo = (type: Row, side: 'SELLER' | 'BUYER'): boolean => type.appliesTo === side || type.appliesTo === 'BOTH';
const valueOf = (identifier: Row): string => textOf(identifier.value).trim();

function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
}

/** Check 5: required identifiers, their format, and one owner each (Foundation §1). */
function identifierProblems(loaded: Loaded): AnyProblem[] {
  const problems: AnyProblem[] = [];
  const { identifierTypes, profileTypes, sellerIdentifiers, buyerIdentifiers, company, profile } = loaded;
  const typeName = (identifier: Row): string => textOf(identifierTypes.get(idOf(identifier.identifierTypeId) ?? '')?.name).trim();
  const has = (identifiers: Row[], type: Row): boolean => identifiers.some((identifier) => identifier.identifierTypeId === type.id && valueOf(identifier) !== '');

  // An identifier attached to the issuer and to the buyer is in both lists: report it once.
  const involved = [...new Map([...sellerIdentifiers, ...buyerIdentifiers].map((identifier) => [identifier.id, identifier])).values()];
  for (const identifier of involved) {
    const owners = [identifier.issuerId, identifier.companyId, identifier.personId].filter((owner) => idOf(owner) !== null).length;
    if (owners !== 1) problems.push(lifecycle('IDENTIFIER_OWNER', { value: `${typeName(identifier)} ${valueOf(identifier)}`.trim() }));
  }

  for (const type of profileTypes) {
    if (type.requiredForSeller === true && appliesTo(type, 'SELLER') && !has(sellerIdentifiers, type)) {
      problems.push(lifecycle('MISSING_IDENTIFIER', { field: 'seller', value: textOf(type.name) }));
    }
  }

  // A company buyer in the profile's country, or of unknown country, is a domestic business buyer.
  const profileCountry = textOf(profile?.countryCode).trim().toUpperCase();
  const buyerCountry = company ? countryCode((company.address as { addressCountry?: unknown } | null)?.addressCountry) : null;
  const domestic = company !== null && (buyerCountry === null || profileCountry === '' || buyerCountry === profileCountry);
  if (domestic) {
    for (const type of profileTypes) {
      if (type.requiredForBusinessBuyer === true && appliesTo(type, 'BUYER') && !has(buyerIdentifiers, type)) {
        problems.push(lifecycle('MISSING_IDENTIFIER', { field: 'buyer', value: textOf(type.name) }));
      }
    }
  }

  for (const [side, identifiers] of [['seller', sellerIdentifiers], ['buyer', buyerIdentifiers]] as const) {
    for (const identifier of identifiers) {
      const type = identifierTypes.get(idOf(identifier.identifierTypeId) ?? '');
      const pattern = textOf(type?.validationPattern).trim();
      if (pattern === '' || valueOf(identifier) === '') continue;
      if (!matches(pattern, valueOf(identifier))) problems.push(lifecycle('INVALID_IDENTIFIER', { field: side, value: textOf(type?.name) }));
    }
  }
  return problems;
}

/** Checks 1 to 7 of spec §6, all of them, in order. */
export function checkGate(loaded: Loaded, context: GateContext): AnyProblem[] {
  const { document, kind, issuer, profile } = loaded;
  const problems: AnyProblem[] = [];
  const issueDate = textOf(document.issueDate);

  // 1. The status allows the action.
  if (context.action !== 'quotePdf' && document.status !== 'DRAFT') problems.push(lifecycle('WRONG_STATUS', { value: textOf(document.status) }));

  // 2. Issuer, profile, currency, pattern; a held number still this issuer's, and an invoice's or credit note's this period's.
  if (!issuer) problems.push(lifecycle('MISSING_ISSUER', { field: 'issuerId' }));
  else if (!profile) problems.push(lifecycle('MISSING_PROFILE', { field: 'profileId' }));
  const currencyCode = textOf(document.currencyCode).trim();
  if (currencyCode === '') problems.push(lifecycle('MISSING_CURRENCY', { field: 'currencyCode' }));
  if (issuer && profile) {
    const pattern = textOf(profile[kind.patternField]);
    const patternProblems = validatePattern(pattern, resetOf(profile));
    for (const problem of patternProblems) problems.push({ source: 'engine', problem, field: kind.patternField });
    // A preview numbers nothing. Issue and a quote PDF reuse a held number: refused here, before the claim writes anything.
    if (context.action !== 'preview' && patternProblems.length === 0 && issueDate !== '') {
      const held = heldNumberOf(kind, document, issuer.id, pattern, issueDate);
      if (held && !held.belongs) problems.push(lifecycle('HELD_NUMBER_ELSEWHERE', { value: held.number }));
    }
  }

  // 3. A buyer.
  if (!idOf(document.companyId) && !idOf(document.personId)) problems.push(lifecycle('MISSING_BUYER', { field: 'companyId' }));

  // 4. A credit note's invoice: issued, with the same issuer and the same currency.
  if (kind.kind === 'CREDIT_NOTE') {
    const invoice = loaded.invoice;
    if (!invoice) problems.push(lifecycle('MISSING_INVOICE', { field: 'invoiceId' }));
    else {
      if (!invoice.snapshot) problems.push(lifecycle('INVOICE_NOT_ISSUED', { field: 'invoiceId' }));
      if (idOf(invoice.issuerId) !== idOf(document.issuerId)) problems.push(lifecycle('INVOICE_MISMATCH', { field: 'issuerId' }));
      if (textOf(invoice.currencyCode).trim() !== currencyCode) problems.push(lifecycle('INVOICE_MISMATCH', { field: 'currencyCode' }));
    }
  }

  // 5. Identifiers.
  problems.push(...identifierProblems(loaded));

  // 6. The Engine. Without a currency every line would also mismatch it: MISSING_CURRENCY says it once.
  if (currencyCode !== '') problems.push(...checkDocument(toDocumentInput(loaded)).map((problem): AnyProblem => ({ source: 'engine', problem })));

  // 7. Dates.
  if (context.action === 'issue' && issueDate !== '') {
    if (issueDate > context.localDate) problems.push(lifecycle('DATE_IN_FUTURE', { field: 'issueDate', value: issueDate }));
    else if (context.latestIssueDate !== null && issueDate < context.latestIssueDate) {
      problems.push(lifecycle('DATE_BEFORE_LAST', { field: 'issueDate', value: context.latestIssueDate }));
    }
  }
  const dueDate = kind.kind === 'INVOICE' ? textOf(document.dueDate) : '';
  if (dueDate !== '' && issueDate !== '' && dueDate < issueDate) problems.push(lifecycle('DUE_BEFORE_ISSUE', { field: 'dueDate', value: dueDate }));

  return problems;
}
