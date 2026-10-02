import { formatDate, formatMoney } from '../render/format.ts';
import { PACKS, type EmailFacts, type EmailTemplate, type LifecycleProblem } from './lang/pack.ts';
import { isIssued, type DocumentObject, type Kind } from './load.ts';
import type { Attachment, Mailbox } from './mailer.ts';
import { currencyOf, isCalendarDate, languageOf, localeOf, microsOf, RECORD_ID, textOf } from './map.ts';
import type { Row } from './store.ts';

/**
 * Sending a document by email (email spec §5 to §7), without a Store: what can be
 * sent, what it carries, the message it starts with, the checks on what the
 * person wrote, and that text as HTML. The route reads and writes; this decides.
 */

/** At most this many addresses, To and Cc together, receive one email (spec §6). */
export const MAX_RECIPIENTS = 20;

type RequestBase = { object: DocumentObject; recordId: string; localDate: string; locale: string };
export type PrepareRequest = RequestBase & { step: 'prepare' };
export type SendRequest = RequestBase & { step: 'send'; from: string; to: string; cc: string; subject: string; message: string };
export type EmailRequest = PrepareRequest | SendRequest;

const OBJECTS: readonly string[] = ['billingInvoice', 'billingCreditNote', 'billingQuote'];
const TEXTS = ['from', 'to', 'cc', 'subject', 'message'] as const;

/** The request the form posts (spec §5, §6), or null when it is not one. A missing text is empty; a text of another type is no request. */
export function parseEmailRequest(raw: unknown): EmailRequest | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const { step, object, recordId, localDate, locale } = body;
  if (step !== 'prepare' && step !== 'send') return null;
  if (typeof object !== 'string' || !OBJECTS.includes(object)) return null;
  if (typeof recordId !== 'string' || !RECORD_ID.test(recordId)) return null;
  if (typeof localDate !== 'string' || !isCalendarDate(localDate)) return null;
  const base: RequestBase = { object: object as DocumentObject, recordId, localDate, locale: typeof locale === 'string' ? locale : 'en' };
  if (step === 'prepare') return { step, ...base };
  const [from, to, cc, subject, message] = TEXTS.map((key) => body[key] ?? '');
  if (typeof from !== 'string' || typeof to !== 'string' || typeof cc !== 'string' || typeof subject !== 'string' || typeof message !== 'string') return null;
  return { step, ...base, from, to, cc, subject, message };
}

/** What no file name may hold, on any system the recipient may save it to: path and device characters, and control characters. */
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;
const safeFileName = (name: string): string => name.replace(UNSAFE_IN_FILE_NAME, '-');

/**
 * The PDF the email carries (spec §6): the PDF field's first file (the issued one, a quote's newest version), named
 * by the number. A number may hold a slash (a pattern like F/{YYYY}/{SEQ}): the name the recipient sees never does.
 */
export function attachmentOf(kind: Kind, document: Row): Attachment | null {
  const first = Array.isArray(document.pdf) ? (document.pdf[0] as { fileId?: unknown; label?: unknown } | null | undefined) : undefined;
  if (typeof first?.fileId !== 'string' || first.fileId === '') return null;
  const number = textOf(document.number).trim();
  if (number === '') return { id: first.fileId, name: safeFileName(textOf(first.label).trim() || 'document.pdf') };
  const version = kind.kind === 'QUOTE' && typeof document.version === 'number' && Number.isInteger(document.version) ? document.version : null;
  return { id: first.fileId, name: safeFileName(version === null ? `${number}.pdf` : `${number} v${version}.pdf`) };
}

/**
 * Why a document cannot be sent (spec §5), or null when it can: a deleted one, an
 * invoice or credit note that is not issued, a cancelled invoice; then, for one
 * that could be sent, an empty PDF field.
 */
export function sendRefusal(kind: Kind, document: Row | null): LifecycleProblem | null {
  const documentType = kind.kind;
  if (!document || document.deletedAt) return { code: 'NOT_SENDABLE', value: 'DELETED', documentType };
  if (kind.kind !== 'QUOTE' && !isIssued(kind, document)) return { code: 'NOT_SENDABLE', value: textOf(document.status), documentType };
  if (kind.kind === 'INVOICE' && document.status === 'CANCELLED') return { code: 'NOT_SENDABLE', value: 'CANCELLED', documentType };
  if (!attachmentOf(kind, document)) return { code: 'NO_PDF', documentType };
  return null;
}

/** The template (spec §7): the reminder for an invoice Issued or Sent whose due date is before the caller's date. */
export function templateOf(kind: Kind, document: Row, localDate: string): EmailTemplate {
  if (kind.kind !== 'INVOICE') return kind.kind;
  const due = textOf(document.dueDate);
  const unpaid = document.status === 'ISSUED' || document.status === 'SENT';
  return unpaid && isCalendarDate(due) && due < localDate ? 'REMINDER' : 'INVOICE';
}

/** What the message is made of: the document, its issuer and profile, the person billed, and a credit note's invoice. */
export type EmailSources = { kind: Kind; document: Row; issuer: Row | null; profile: Row | null; person: Row | null; invoice: Row | null };

/** A locale Intl accepts: the profile's, else the language's own. A profile edited to a bad tag must not stop the email. */
function usableLocale(locale: string, fallback: string): string {
  try {
    Intl.getCanonicalLocales(locale);
    return locale;
  } catch {
    return fallback;
  }
}

const field = (value: unknown, key: string): unknown => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined);
const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/** The template's facts (spec §7), formatted as the PDF prints them: amounts and dates in the profile's locale. */
export function factsOf(sources: EmailSources): EmailFacts {
  const { kind, document, issuer, profile, person, invoice } = sources;
  const language = languageOf(document, profile);
  const locale = usableLocale(localeOf(language, profile), localeOf(language, null));
  // A date that is not a day of the calendar, or a currency Intl does not know, is left out of the message: the
  // person fills the form in anyway, and a record edited to a bad value must not stop the email.
  const date = (value: unknown): string | null => (isCalendarDate(textOf(value)) ? formatDate(textOf(value), locale) : null);
  const micros = microsOf(document.total);
  const currency = currencyOf(document.total) || textOf(document.currencyCode);
  const money = (): string | null => {
    if (Number.isNaN(micros) || currency === '') return null;
    try {
      return formatMoney(micros, currency, locale);
    } catch {
      return null;
    }
  };
  return {
    number: textOf(document.number).trim(),
    version: kind.kind === 'QUOTE' && typeof document.version === 'number' ? document.version : null,
    seller: textOf(issuer?.name).trim() || textOf(issuer?.legalName).trim(),
    total: money(),
    dueDate: kind.kind === 'INVOICE' ? date(document.dueDate) : null,
    validUntil: kind.kind === 'QUOTE' ? date(document.validUntil) : null,
    corrects: kind.kind === 'CREDIT_NOTE' ? orNull(textOf(invoice?.number)) : null,
    buyer: document.personId ? orNull(textOf(field(person?.name, 'firstName'))) : null,
  };
}

/** The subject and message the form opens with, in the document's language (spec §7). */
export function prefilled(sources: EmailSources, localDate: string): { subject: string; message: string } {
  const pack = PACKS[languageOf(sources.document, sources.profile)] ?? PACKS.EN;
  const words = pack.emails[templateOf(sources.kind, sources.document, localDate)];
  const facts = factsOf(sources);
  return { subject: words.subject(facts), message: words.message(facts) };
}

/** The address the form starts with (spec §5): the billed person's primary email; none for a company alone, which has no email in Twenty. */
export function recipientOf(document: Row, person: Row | null): string {
  return document.personId && person ? textOf(field(person.emails, 'primaryEmail')).trim() : '';
}

/** The mailbox to preselect (spec §5): the one whose address is the issuer's primary email, whatever its case, else the first. */
export function preselected(mailboxes: readonly Mailbox[], issuer: Row | null): string {
  const email = textOf(field(issuer?.emails, 'primaryEmail')).trim().toLowerCase();
  const match = email === '' ? undefined : mailboxes.find((mailbox) => mailbox.handle.trim().toLowerCase() === email);
  return (match ?? mailboxes[0])?.id ?? '';
}

/** The addresses of a To or Cc field (spec §6): split on commas and semicolons, trimmed, empty pieces dropped. */
export const recipientsOf = (text: string): string[] =>
  text.split(/[,;]/).map((piece) => piece.trim()).filter((piece) => piece !== '');

/** Something that looks like an address: one @, no space, bracket or control character, a dot in the domain. Twenty checks it again before sending. */
const ADDRESS = /^[^\s@<>()",;:\u0000-\u001f\u007f]+@[^\s@<>()",;:\u0000-\u001f\u007f]+\.[^\s@<>()",;:.\u0000-\u001f\u007f]+$/;

/** Each address once, whatever its case: the first spelling stays. An address in `taken` is left out. */
function distinct(addresses: readonly string[], taken: readonly string[] = []): string[] {
  const seen = new Set(taken.map((address) => address.toLowerCase()));
  return addresses.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type CheckedMessage = { problems: LifecycleProblem[]; to: string[]; cc: string[]; subject: string; message: string };

/**
 * The message as the person wrote it, checked all at once (spec §6, step 1). The subject is folded onto one line: it
 * becomes a header. An address written twice, whatever its case, goes once, and one already in To is not copied.
 */
export function checkMessage(input: { to: string; cc: string; subject: string; message: string }): CheckedMessage {
  const to = distinct(recipientsOf(input.to));
  const cc = distinct(recipientsOf(input.cc), to);
  const subject = input.subject.replace(/[\r\n]+/g, ' ').trim();
  const problems: LifecycleProblem[] = [];
  for (const [name, addresses] of [['to', to], ['cc', cc]] as const) {
    for (const address of addresses) if (!ADDRESS.test(address)) problems.push({ code: 'INVALID_RECIPIENT', field: name, value: address });
  }
  if (to.length === 0) problems.push({ code: 'MISSING_RECIPIENT', field: 'to' });
  if (to.length + cc.length > MAX_RECIPIENTS) problems.push({ code: 'TOO_MANY_RECIPIENTS', value: String(MAX_RECIPIENTS) });
  if (subject === '') problems.push({ code: 'MISSING_SUBJECT', field: 'subject' });
  if (input.message.trim() === '') problems.push({ code: 'MISSING_MESSAGE', field: 'message' });
  return { problems, to, cc, subject, message: input.message };
}

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * The person's text as the body Twenty sends (spec §6): every special character
 * escaped, so nothing they typed is read as markup; a blank line starts a
 * paragraph, and a single line break is a <br>.
 */
export function messageHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[&<>"']/g, (character) => ESCAPES[character]!)
    .split(/\n(?:[ \t]*\n)+/)
    // A line of spaces at the start or the end of the message is no line of a paragraph: it would leave a stray <br>.
    .map((paragraph) => paragraph.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, ''))
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => `<p>${paragraph.split('\n').join('<br>')}</p>`)
    .join('');
}
