import type { LifecyclePack, StatusKey } from './pack.ts';

const statuses: Record<StatusKey, string> = {
  DRAFT: 'Draft', ISSUED: 'Issued', SENT: 'Sent', PAID: 'Paid', CANCELLED: 'Cancelled',
  ACCEPTED: 'Accepted', DECLINED: 'Declined', EXPIRED: 'Expired', INVOICED: 'Invoiced',
};

const statusName = (value?: string): string => (value && value in statuses ? statuses[value as StatusKey] : value ?? '');
const party = (field?: string): string => (field === 'buyer' ? 'The buyer' : 'The seller');
const kinds = { QUOTE: 'quote', INVOICE: 'invoice', CREDIT_NOTE: 'credit note' } as const;
const list = (names: readonly string[]): string =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const correct = (kind: keyof typeof kinds): string =>
  kind === 'CREDIT_NOTE' ? 'An issued credit note cannot change.' : 'Correct it with a credit note.';

export const en: LifecyclePack = {
  code: 'EN',
  problems: {
    NOT_ALLOWED: () => 'Your role cannot edit this document, so it cannot run this action.',
    WRONG_STATUS: ({ value }) => `This action needs a draft; this document is ${statusName(value)}.`,
    ALREADY_ISSUED: ({ value }) => `This document is already issued, as ${value}.`,
    MISSING_ISSUER: () => 'Choose the issuer.',
    MISSING_PROFILE: () => 'The issuer has no billing profile: choose one on the issuer.',
    MISSING_BUYER: () => 'Choose the company or the person to bill.',
    MISSING_CURRENCY: () => 'Set a currency on the document, on the issuer or on its profile.',
    MISSING_IDENTIFIER: ({ field, value }) => `${party(field)} has no ${value}.`,
    INVALID_IDENTIFIER: ({ field, value }) => `${party(field)}’s ${value} does not have the expected format.`,
    IDENTIFIER_OWNER: ({ value }) => `The identifier ${value} is attached to more than one record: keep one.`,
    MISSING_INVOICE: () => 'Choose the invoice this credit note corrects.',
    INVOICE_NOT_ISSUED: () => 'The invoice this credit note corrects is not issued.',
    INVOICE_MISMATCH: ({ field }) =>
      field === 'currencyCode'
        ? 'The invoice this credit note corrects is in another currency.'
        : 'The invoice this credit note corrects has another issuer.',
    DATE_IN_FUTURE: ({ value }) => `The issue date, ${value}, is later than today.`,
    DATE_BEFORE_LAST: ({ value }) => `The issue date is earlier than ${value}, the date of the last numbered document in its sequence.`,
    DUE_BEFORE_ISSUE: () => 'The due date is earlier than the issue date.',
    CLOCK_SKEW: () => 'Your computer’s date is more than a day away from the server’s: check its date and time.',
    LEDGER_BEHIND: ({ value, documentType }) =>
      `The ${documentType ? kinds[documentType] : 'document'} numbering sequence of ${value} is far behind the numbers already given: raise its last number.`,
    HELD_NUMBER_ELSEWHERE: ({ value }) =>
      `This document already holds the number ${value}, given under another issuer or period: put its issuer and issue date back to use it.`,
    QUOTE_NOT_OPEN: ({ value }) => `This quote is ${statusName(value)}: only a draft, sent or accepted quote becomes an invoice.`,
    ALREADY_INVOICED: ({ value }) => `This quote already has an invoice, ${value}: finish it, or delete it to start again.`,
    NOT_ISSUED: () => 'This invoice is not issued: a draft is corrected by editing it.',
    INVOICE_CANCELLED: ({ field }) =>
      field === 'invoiceId'
        ? 'The invoice this credit note corrects is cancelled: it has nothing left to credit.'
        : 'This invoice is cancelled: it has nothing left to credit.',
    NOTHING_TO_CREDIT: () => 'Everything on this invoice is credited already.',
    REMAINDER_UNKNOWN: () =>
      'A credit note against this invoice changed a price or added a line, so what remains cannot be worked out: use Credit note and adjust it.',
    OVER_CREDIT: ({ value }) =>
      value ? `This credit note credits more than remains on its invoice (line ${value}).` : 'This credit note credits more than remains on its invoice.',
  },
  renderProblems: {
    UNSUPPORTED_SCRIPT: ({ field, value }) => `Some characters cannot be printed with the PDF’s font (${field}): ${value}`,
    UNSUPPORTED_IMAGE: () => 'The issuer’s logo is not a PNG or JPEG image, or the file is damaged.',
    UNKNOWN_TEMPLATE: ({ value }) => `The issuer’s template, ${value}, is not one this app knows.`,
    UNKNOWN_LANGUAGE: ({ value }) => `Documents cannot be printed in ${value} yet.`,
    QR_PAYLOAD_TOO_LONG: ({ value }) => `The QR code holds too much to be printed legibly (${value}).`,
    MISSING_TAX_NAME: () => 'A tax code on this document has no name.',
    INVALID_LOCALE: ({ value }) => `The profile’s locale, ${value}, is not a valid language tag such as fr-FR.`,
    INVALID_DATE: ({ field, value }) => `${value} is not a valid date (${field}).`,
    INVALID_CURRENCY: ({ value }) => `${value} is not a currency code.`,
    QR_BASE_URL_MISSING: () => 'The profile prints a QR link, but the issuer has no verification link.',
    QR_PAYLOAD_EMPTY: () => 'The QR code would be empty.',
  },
  units: {
    UNIT: 'unit', HOUR: 'hour', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year',
    KG: 'kg', G: 'g', TONNE: 't', M: 'm', KM: 'km', M2: 'm²', M3: 'm³', LITRE: 'L', KWH: 'kWh',
    FLAT_FEE: 'flat fee', PACKAGE: 'package',
  },
  fields: {
    subject: 'Subject', issuerId: 'Issuer', companyId: 'Company', personId: 'Person', issueDate: 'Issue date',
    dueDate: 'Due date', currencyCode: 'Currency', pricesIncludeTax: 'Prices include tax', language: 'Language',
    notes: 'Notes', buyerReference: 'Buyer reference', invoiceId: 'Invoice', reason: 'Reason',
    documentType: 'Document type', periodKey: 'Period', lastValue: 'Last number',
  },
  statuses,
  kinds: { QUOTE: 'quote', INVOICE: 'invoice', CREDIT_NOTE: 'credit note' },
  messages: {
    previewReady: 'Preview ready: it is in the PDF field.',
    issued: (_kind, number) => `Issued as ${number}.`,
    quotePdf: (number, version) => `Quote ${number}, version ${version}: it is in the PDF field.`,
    unexpected: (ref) => `Something went wrong (ref ${ref}).`,
    fieldsPutBack: (kind, fields) =>
      `This ${kinds[kind]} is issued: the change${fields.length > 1 ? 's' : ''} to ${list(fields)} ${fields.length > 1 ? 'were' : 'was'} put back. ${correct(kind)}`,
    lineChangePutBack: (kind) => `This ${kinds[kind]} is issued: the change to a line was put back. ${correct(kind)}`,
    lineAddedRemoved: (kind) => `This ${kinds[kind]} is issued: the line added to it was removed. ${correct(kind)}`,
    lineDeletedRestored: (kind) => `This ${kinds[kind]} is issued: the deleted line was restored. ${correct(kind)}`,
    lineMoveReverted: (kind) => `This ${kinds[kind]} is issued: the line moved in or out was moved back. ${correct(kind)}`,
    documentRestored: (kind, number) => `This ${kinds[kind]} holds the number ${number}, so it cannot be deleted: it was restored.`,
    statusPutBack: (rule, kind, back) => {
      const why = {
        ISSUE: `Only the Issue action issues a ${kinds[kind]}.`,
        DRAFT: `An issued ${kinds[kind]} cannot return to Draft.`,
        CANCEL: `A numbered ${kinds[kind]} is cancelled through a credit note.`,
        INVOICED: 'A quote becomes Invoiced when it is turned into an invoice.',
        NOT_ISSUED: 'Only an issued invoice can be Sent or Paid.',
        UNINVOICE: 'This quote has an invoice, so it stays Invoiced: delete the invoice to reopen the quote.',
      }[rule];
      return `${why} The status was put back to ${back}.`;
    },
    createdAsDraft: (kind, status) => `A new ${kinds[kind]} starts as a draft: its status ${status} was set to Draft.`,
    ledgerDuplicateRemoved: 'A numbering sequence already exists for this issuer, document type and period: this one was removed.',
    ledgerChangePutBack: (fields) =>
      `This sequence has given out numbers: its issuer, document type and period are fixed, and its last number can only rise. The change to ${list(fields)} was put back.`,
    ledgerRestored: 'This sequence has given out numbers, so it cannot be deleted: it was restored.',
    invoiceCreated: 'Draft invoice created from this quote.',
    creditNoteCreated: (invoiceNumber) => `Draft credit note created for ${invoiceNumber}.`,
    cancelledBy: (invoiceNumber, creditNoteNumber) => `${invoiceNumber} is cancelled by credit note ${creditNoteNumber}.`,
    alreadyCredited: (invoiceNumber) => `${invoiceNumber} is cancelled: its credit notes already credit all of it.`,
    invoiceNowCancelled: (invoiceNumber) => `Invoice ${invoiceNumber} is now cancelled.`,
    cancellationReason: (invoiceNumber) => `Cancellation of invoice ${invoiceNumber}`,
    invoicedTimeline: (subject) => (subject ? `Draft invoice "${subject}" created from this quote.` : 'Draft invoice created from this quote.'),
    creditedTimeline: (creditNoteNumber, total) => `Credit note ${creditNoteNumber} issued against this invoice, for ${total}.`,
    cancelledTimeline: (creditNoteNumber) => `Cancelled by credit note ${creditNoteNumber}.`,
    quoteReopened: 'The draft invoice made from this quote was deleted: the quote is Accepted again.',
    quoteReinvoiced: 'The invoice made from this quote was restored: the quote is Invoiced again.',
  },
};
