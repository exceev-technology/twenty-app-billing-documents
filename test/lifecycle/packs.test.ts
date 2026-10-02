import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PACKS, describe, describeAll, packFor, type EmailFacts, type LifecyclePack } from '../../lifecycle/lang/pack.ts';

const LIFECYCLE_CODES = [
  'NOT_ALLOWED', 'WRONG_STATUS', 'ALREADY_ISSUED', 'MISSING_ISSUER', 'MISSING_PROFILE', 'MISSING_BUYER',
  'MISSING_CURRENCY', 'MISSING_IDENTIFIER', 'INVALID_IDENTIFIER', 'IDENTIFIER_OWNER', 'MISSING_INVOICE',
  'INVOICE_NOT_ISSUED', 'INVOICE_MISMATCH', 'DATE_IN_FUTURE', 'DATE_BEFORE_LAST', 'DUE_BEFORE_ISSUE',
  'CLOCK_SKEW', 'LEDGER_BEHIND', 'HELD_NUMBER_ELSEWHERE',
  'QUOTE_NOT_OPEN', 'ALREADY_INVOICED', 'NOT_ISSUED', 'INVOICE_CANCELLED', 'NOTHING_TO_CREDIT', 'REMAINDER_UNKNOWN', 'OVER_CREDIT',
  'NUMBERED_CREDIT_NOTE_PENDING',
  'NOT_SENDABLE', 'NO_PDF', 'NO_MAILBOX', 'MISSING_RECIPIENT', 'INVALID_RECIPIENT', 'TOO_MANY_RECIPIENTS', 'MISSING_SUBJECT',
  'MISSING_MESSAGE', 'EMAIL_NOT_ALLOWED', 'SEND_FAILED',
];
const RENDER_CODES = [
  'UNSUPPORTED_SCRIPT', 'UNSUPPORTED_IMAGE', 'UNKNOWN_TEMPLATE', 'UNKNOWN_LANGUAGE', 'QR_PAYLOAD_TOO_LONG',
  'MISSING_TAX_NAME', 'INVALID_LOCALE', 'INVALID_DATE', 'INVALID_CURRENCY', 'QR_BASE_URL_MISSING', 'QR_PAYLOAD_EMPTY',
];
const UNITS = ['UNIT', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR', 'KG', 'G', 'TONNE', 'M', 'KM', 'M2', 'M3', 'LITRE', 'KWH', 'FLAT_FEE', 'PACKAGE'];
const DETAILS = { field: 'seller', value: 'SIREN', documentType: 'INVOICE' } as const;

const filled = (text: string, where: string) => assert.ok(text.trim().length > 0, `${where} is empty`);

function everyMessage(pack: LifecyclePack): string[] {
  const m = pack.messages;
  return [
    m.previewReady, m.issued('INVOICE', 'F2026-0001'), m.issued('CREDIT_NOTE', 'AV2026-0001'), m.quotePdf('D2026-0001', 2), m.unexpected('7f3a09'),
    ...(['INVOICE', 'CREDIT_NOTE'] as const).flatMap((kind) => [
      m.fieldsPutBack(kind, ['Subject']), m.fieldsPutBack(kind, ['Subject', 'Notes', 'Due date']),
      m.lineChangePutBack(kind), m.lineAddedRemoved(kind), m.lineDeletedRestored(kind), m.lineMoveReverted(kind),
      m.documentRestored(kind, 'F2026-0001'), m.createdAsDraft(kind, 'Paid'),
      m.statusPutBack('ISSUE', kind, 'Draft'), m.statusPutBack('DRAFT', kind, 'Issued'), m.statusPutBack('CANCEL', kind, 'Paid'),
    ]),
    m.documentRestored('QUOTE', 'D2026-0001'), m.createdAsDraft('QUOTE', 'Sent'), m.statusPutBack('INVOICED', 'QUOTE', 'Accepted'),
    m.statusPutBack('NOT_ISSUED', 'INVOICE', 'Draft'), m.statusPutBack('UNINVOICE', 'QUOTE', 'Invoiced'), m.statusPutBack('UNCANCEL', 'INVOICE', 'Cancelled'),
    m.invoiceCreated, m.creditNoteCreated('F2026-0001'), m.cancelledBy('F2026-0001', 'AV2026-0002'),
    m.alreadyCredited('F2026-0001'), m.invoiceNowCancelled('F2026-0001'), m.cancellationReason('F2026-0001'),
    m.invoicedTimeline('Identité visuelle'), m.invoicedTimeline(''), m.creditedTimeline('AV2026-0001', '120.00 EUR'),
    m.cancelledTimeline('AV2026-0002'), m.quoteReopened, m.quoteReinvoiced,
    m.sentTo(['camille@calibre.example']), m.sentTo(['a@x.example', 'b@x.example']),
    ...(['QUOTE', 'INVOICE', 'CREDIT_NOTE'] as const).map((kind) => m.sentNotMarked(['camille@calibre.example'], kind, '7f3a09')),
    m.sentTimeline(['camille@calibre.example'], [], 'bonjour@verdal.example'),
    m.sentTimeline(['a@x.example'], ['b@x.example', 'c@x.example'], 'bonjour@verdal.example'),
    m.ledgerDuplicateRemoved, m.ledgerChangePutBack(['Last number']), m.ledgerRestored,
  ];
}

const TEMPLATES = ['INVOICE', 'REMINDER', 'CREDIT_NOTE', 'QUOTE'] as const;
/** Every fact a template can use, then none but the number. */
const ALL_FACTS: EmailFacts = {
  number: 'F2026-0017', version: 2, seller: 'Acme', total: '1\u00a0234,00\u00a0€', dueDate: '31/10/2026', validUntil: '31/10/2026', corrects: 'F2026-0001', buyer: 'Maria',
};
const NO_FACTS: EmailFacts = { number: 'F2026-0017', version: null, seller: '', total: null, dueDate: null, validUntil: null, corrects: null, buyer: null };

function everyEmail(pack: LifecyclePack): string[] {
  return TEMPLATES.flatMap((template) => [ALL_FACTS, NO_FACTS].flatMap((facts) => [pack.emails[template].subject(facts), pack.emails[template].message(facts)]));
}

test('both packs word every Lifecycle problem, and every Rendering problem', () => {
  for (const pack of [PACKS.EN, PACKS.FR]) {
    assert.deepEqual(Object.keys(pack.problems).sort(), [...LIFECYCLE_CODES].sort(), pack.code);
    assert.deepEqual(Object.keys(pack.renderProblems).sort(), [...RENDER_CODES].sort(), pack.code);
    for (const code of LIFECYCLE_CODES) filled(pack.problems[code as 'NOT_ALLOWED'](DETAILS), `${pack.code} ${code}`);
    for (const code of RENDER_CODES) filled(pack.renderProblems[code as 'UNSUPPORTED_SCRIPT'](DETAILS), `${pack.code} ${code}`);
  }
});

test('both packs name every unit, field, status and document kind, and carry every message', () => {
  const [en, fr] = [PACKS.EN, PACKS.FR];
  assert.deepEqual(Object.keys(en.units).sort(), [...UNITS].sort());
  for (const group of ['units', 'fields', 'statuses', 'kinds'] as const) {
    assert.deepEqual(Object.keys(en[group]).sort(), Object.keys(fr[group]).sort(), group);
    for (const pack of [en, fr]) for (const [key, value] of Object.entries(pack[group])) filled(value, `${pack.code} ${group}.${key}`);
  }
  for (const pack of [en, fr]) everyMessage(pack).forEach((message, index) => filled(message, `${pack.code} message ${index}`));
});

test('the two packs are different languages', () => {
  assert.equal(PACKS.EN.units.DAY, 'day');
  assert.equal(PACKS.FR.units.DAY, 'jour');
  assert.notEqual(PACKS.EN.messages.previewReady, PACKS.FR.messages.previewReady);
});

test('a French locale gets French, any other locale English', () => {
  for (const locale of ['fr', 'fr-FR', 'fr-CA', 'fr_FR', 'FR-be']) assert.equal(packFor(locale).code, 'FR', locale);
  for (const locale of ['en', 'en-US', 'de-DE', 'fra', '', null, undefined]) assert.equal(packFor(locale).code, 'EN', String(locale));
});

test('the Draft rule’s message speaks of an issued document, the only kind it now puts back', () => {
  assert.equal(PACKS.EN.messages.statusPutBack('DRAFT', 'INVOICE', 'Issued'), 'An issued invoice cannot return to Draft. The status was put back to Issued.');
  assert.equal(PACKS.EN.messages.statusPutBack('DRAFT', 'CREDIT_NOTE', 'Issued'), 'An issued credit note cannot return to Draft. The status was put back to Issued.');
  assert.equal(PACKS.FR.messages.statusPutBack('DRAFT', 'INVOICE', 'Émise'), 'Une facture émise ne peut pas revenir au statut Brouillon. Le statut a été remis à Émise.');
  assert.equal(PACKS.FR.messages.statusPutBack('DRAFT', 'CREDIT_NOTE', 'Émis'), 'Un avoir émis ne peut pas revenir au statut Brouillon. Le statut a été remis à Émis.');
  assert.match(PACKS.EN.messages.statusPutBack('CANCEL', 'INVOICE', 'Draft'), /^A numbered invoice is cancelled through a credit note\./, 'cancelling is still refused to a numbered draft');
});

test('a guard’s message names the fields it put back and says how to correct', () => {
  assert.equal(
    PACKS.EN.messages.fieldsPutBack('INVOICE', ['Subject']),
    'This invoice is issued: the change to Subject was put back. Correct it with a credit note.',
  );
  assert.match(PACKS.EN.messages.fieldsPutBack('INVOICE', ['Subject', 'Notes', 'Due date']), /the changes to Subject, Notes and Due date were put back/);
  assert.match(PACKS.FR.messages.fieldsPutBack('INVOICE', ['Objet']), /Cette facture est émise/);
});

test('a number held under another issuer or period is worded in both languages', () => {
  const problem = { source: 'lifecycle', code: 'HELD_NUMBER_ELSEWHERE', value: 'F2026-0001' } as const;
  assert.deepEqual(describe(problem, 'EN'), {
    code: 'HELD_NUMBER_ELSEWHERE',
    message: 'This document already holds the number F2026-0001, given under another issuer or period: put its issuer and issue date back to use it.',
  });
  assert.equal(
    describe(problem, 'FR').message,
    'Ce document porte déjà le numéro F2026-0001, attribué pour un autre émetteur ou une autre période\u00a0: rétablissez son émetteur et sa date d’émission pour l’utiliser.',
  );
});

test('OVER_CREDIT names the line when it can, and INVOICE_CANCELLED speaks of the corrected invoice from a credit note', () => {
  assert.equal(PACKS.EN.problems.OVER_CREDIT({ value: '2' }), 'This credit note credits more than remains on its invoice (line 2).');
  assert.equal(PACKS.EN.problems.OVER_CREDIT({}), 'This credit note credits more than remains on its invoice.');
  assert.match(PACKS.EN.problems.INVOICE_CANCELLED({ field: 'invoiceId' }), /^The invoice this credit note corrects is cancelled/);
  assert.match(PACKS.FR.problems.INVOICE_CANCELLED({}), /^Cette facture est annulée/);
  assert.equal(PACKS.FR.messages.cancellationReason('F2026-0001'), 'Annulation de la facture F2026-0001');
});

test('a numbered credit note left unissued is named, to be finished before another is made', () => {
  assert.equal(
    PACKS.EN.problems.NUMBERED_CREDIT_NOTE_PENDING({ value: 'AV2026-0001' }),
    'Credit note AV2026-0001 already holds a number: finish it (or correct it) before making another.',
  );
  assert.equal(
    PACKS.FR.problems.NUMBERED_CREDIT_NOTE_PENDING({ value: 'AV2026-0001' }),
    'L’avoir AV2026-0001 porte déjà un numéro\u00a0: terminez-le (ou corrigez-le) avant d’en créer un autre.',
  );
});

test('ALREADY_INVOICED names the invoice when it has a number or a subject, and words it without one otherwise', () => {
  assert.equal(PACKS.EN.problems.ALREADY_INVOICED({ value: 'F2026-0001' }), 'This quote already has an invoice, F2026-0001: finish it, or delete it to start again.');
  assert.equal(PACKS.EN.problems.ALREADY_INVOICED({}), 'This quote already has an invoice: finish it, or delete it to start again.');
  assert.equal(PACKS.FR.problems.ALREADY_INVOICED({}), 'Ce devis a déjà une facture\u00a0: terminez-la, ou supprimez-la pour recommencer.');
});

test('a problem of each origin is worded, with the field it names', () => {
  assert.deepEqual(describe({ source: 'lifecycle', code: 'MISSING_IDENTIFIER', field: 'seller', value: 'SIREN' }, 'EN'), {
    code: 'MISSING_IDENTIFIER', message: 'The seller has no SIREN.', field: 'seller',
  });
  const engine = describe({ source: 'engine', problem: { code: 'INVALID_PATTERN', value: '{SEQ}' }, field: 'invoiceNumberPattern' }, 'FR');
  assert.equal(engine.code, 'INVALID_PATTERN');
  assert.equal(engine.field, 'invoiceNumberPattern');
  assert.match(engine.message, /format de numérotation/);
  const render = describe({ source: 'render', problem: { code: 'UNSUPPORTED_IMAGE', field: 'brand.logo.bytes', value: 'image/png' } }, 'EN');
  assert.equal(render.code, 'UNSUPPORTED_IMAGE');
  assert.match(render.message, /logo/i);
});

test('an engine problem names its line by position, not by record id', () => {
  const worded = describe({ source: 'engine', problem: { code: 'MISSING_TAX_CODE', line: 'a1b2-line-id' } }, 'EN', new Map([['a1b2-line-id', 3]]));
  assert.match(worded.message, /line 3/);
  assert.doesNotMatch(worded.message, /a1b2-line-id/);
});

test('a status in a problem is shown by its name in the language', () => {
  assert.match(describe({ source: 'lifecycle', code: 'WRONG_STATUS', value: 'ISSUED' }, 'EN').message, /Issued/);
  assert.match(describe({ source: 'lifecycle', code: 'WRONG_STATUS', value: 'ISSUED' }, 'FR').message, /Émise/);
});

test('describeAll keeps the order of the problems', () => {
  const worded = describeAll([
    { source: 'lifecycle', code: 'MISSING_ISSUER' },
    { source: 'lifecycle', code: 'MISSING_BUYER' },
  ], 'EN');
  assert.deepEqual(worded.map((problem) => problem.code), ['MISSING_ISSUER', 'MISSING_BUYER']);
});

test('French messages don’t take a plain space before : ; ? ! or inside « »', () => {
  const fr = PACKS.FR;
  const texts = [
    ...LIFECYCLE_CODES.map((code) => fr.problems[code as 'NOT_ALLOWED'](DETAILS)),
    ...RENDER_CODES.map((code) => fr.renderProblems[code as 'UNSUPPORTED_SCRIPT'](DETAILS)),
    ...everyMessage(fr),
    ...everyEmail(fr),
  ];
  for (const text of texts) assert.doesNotMatch(text, / [:;?!]|« | »/, text);
});

test('both packs word every email template, with every fact or none, and never print a missing one', () => {
  for (const pack of [PACKS.EN, PACKS.FR]) {
    assert.deepEqual(Object.keys(pack.emails).sort(), [...TEMPLATES].sort(), pack.code);
    for (const text of everyEmail(pack)) {
      filled(text, `${pack.code} email`);
      assert.doesNotMatch(text, /null|undefined|NaN/, text);
    }
  }
});

test('the invoice’s email reads as the spec’s example, and greets no one by name when no person is billed', () => {
  const facts = { ...NO_FACTS, seller: 'Acme', total: '1,234.00 €', dueDate: '31/10/2026', buyer: 'Maria' };
  assert.equal(PACKS.EN.emails.INVOICE.subject(facts), 'Invoice F2026-0017 from Acme');
  assert.equal(
    PACKS.EN.emails.INVOICE.message(facts),
    'Hello Maria,\n\nPlease find attached invoice F2026-0017 for 1,234.00 €, due on 31/10/2026.\n\nKind regards,\nAcme',
  );
  assert.match(PACKS.EN.emails.INVOICE.message({ ...facts, buyer: null }), /^Hello,\n\n/);
  assert.match(PACKS.FR.emails.INVOICE.message({ ...facts, buyer: null }), /^Bonjour,\n\n/);
});

test('French elides de before a vowel, and a quote is named by its version from the second on', () => {
  assert.equal(PACKS.FR.emails.INVOICE.subject({ ...NO_FACTS, seller: 'Atelier Nord' }), 'Facture F2026-0017 d’Atelier Nord');
  assert.equal(PACKS.FR.emails.INVOICE.subject({ ...NO_FACTS, seller: 'Verdal Studio' }), 'Facture F2026-0017 de Verdal Studio');
  assert.equal(PACKS.EN.emails.QUOTE.subject({ ...NO_FACTS, number: 'D2026-0004', version: 1, seller: 'Acme' }), 'Quote D2026-0004 from Acme');
  assert.equal(PACKS.EN.emails.QUOTE.subject({ ...NO_FACTS, number: 'D2026-0004', version: 2, seller: 'Acme' }), 'Quote D2026-0004 (version 2) from Acme');
});

test('the email problems say what to do, and the messages name who received the email', () => {
  const en = PACKS.EN;
  assert.equal(en.problems.INVALID_RECIPIENT({ field: 'to', value: 'camille@calibre' }), 'camille@calibre is not an email address.');
  assert.equal(en.problems.NOT_SENDABLE({ value: 'DRAFT', documentType: 'CREDIT_NOTE' }), 'Only an issued credit note can be sent: issue this one first.');
  assert.equal(en.problems.NOT_SENDABLE({ value: 'DRAFT', documentType: 'INVOICE' }), 'Only an issued invoice can be sent: issue this one first.');
  assert.equal(en.problems.NOT_SENDABLE({ value: 'CANCELLED', documentType: 'INVOICE' }), 'This invoice is cancelled: it cannot be sent.');
  assert.equal(en.problems.NOT_SENDABLE({ value: 'DELETED', documentType: 'QUOTE' }), 'This document is deleted: restore it to send it.');
  assert.equal(en.problems.NO_PDF({ documentType: 'QUOTE' }), 'This quote has no PDF yet: generate it first.');
  assert.match(en.problems.NO_MAILBOX({}), /Settings → Accounts/);
  assert.match(en.problems.NO_MAILBOX({ field: 'from' }), /no longer connected/);
  assert.match(en.problems.EMAIL_NOT_ALLOWED({}), /Settings → Roles.*“Send email”/);
  assert.equal(en.problems.SEND_FAILED({ value: 'Invalid recipient' }), 'The email could not be sent: Invalid recipient');
  assert.equal(en.problems.SEND_FAILED({}), 'The email could not be sent.');
  assert.equal(en.messages.sentTo(['camille@calibre.example']), 'Sent to camille@calibre.example.');
  assert.equal(
    en.messages.sentNotMarked(['camille@calibre.example'], 'INVOICE', 'ref-7f3a'),
    'Sent to camille@calibre.example, but the invoice could not be marked as sent (ref ref-7f3a).',
  );
  assert.equal(
    PACKS.FR.messages.sentTimeline(['camille@calibre.example'], ['compta@calibre.example'], 'bonjour@verdal.example'),
    'E-mail envoyé depuis bonjour@verdal.example à camille@calibre.example, en copie à compta@calibre.example.',
  );
});
