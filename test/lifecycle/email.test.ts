import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentOf, checkMessage, factsOf, MAX_RECIPIENTS, messageHtml, parseEmailRequest, prefilled, preselected, recipientOf, recipientsOf,
  sendRefusal, templateOf, type EmailSources,
} from '../../lifecycle/email.ts';
import { KINDS, type Kind } from '../../lifecycle/load.ts';
import type { Row } from '../../lifecycle/store.ts';
import { money } from './helpers/fixtures.ts';

const INVOICE = KINDS.billingInvoice;
const CREDIT_NOTE = KINDS.billingCreditNote;
const QUOTE = KINDS.billingQuote;
const ID = '00000000-0000-4000-8000-000000000001';
const TODAY = '2026-09-26';
const PDF = { fileId: 'file-1', label: 'F2026-0001.pdf', extension: 'pdf', url: 'https://files.example/file-1' };

const issuer: Row = { id: 'issuer-1', name: 'Verdal Studio', legalName: 'Verdal Studio SARL', emails: { primaryEmail: 'bonjour@verdal.example', additionalEmails: null } };
const profile: Row = { id: 'profile-1', language: 'FR', locale: 'fr-FR' };
const person: Row = { id: 'person-1', name: { firstName: 'Camille', lastName: 'Durand' }, emails: { primaryEmail: 'camille@calibre.example', additionalEmails: null } };

/** An issued invoice billed to Camille: F2026-0001, 9\u00a0792,00\u00a0€, due on 26/10/2026. */
const invoice = (over: Record<string, unknown> = {}): Row => ({
  id: ID, status: 'ISSUED', number: 'F2026-0001', snapshot: { printed: {}, record: {} }, pdf: [PDF], total: money(9_792_000_000),
  currencyCode: 'EUR', dueDate: '2026-10-26', personId: person.id, language: null, deletedAt: null, ...over,
});
/** An issued credit note: AV2026-0001, 1\u00a0440,00\u00a0€. */
const creditNote = (over: Record<string, unknown> = {}): Row => ({
  id: ID, status: 'ISSUED', number: 'AV2026-0001', snapshot: { printed: {}, record: {} }, pdf: [{ fileId: 'file-cn', label: 'AV2026-0001.pdf' }],
  total: money(1_440_000_000), currencyCode: 'EUR', personId: person.id, language: null, deletedAt: null, ...over,
});
/** A sent quote in its second version, its newest PDF first: D2026-0004, 600,00\u00a0€, valid until 26/10/2026. */
const quote = (over: Record<string, unknown> = {}): Row => ({
  id: ID, status: 'SENT', number: 'D2026-0004', version: 2, snapshot: null,
  pdf: [{ fileId: 'file-q2', label: 'D2026-0004 v2.pdf' }, { fileId: 'file-q1', label: 'D2026-0004 v1.pdf' }],
  total: money(600_000_000), currencyCode: 'EUR', validUntil: '2026-10-26', personId: person.id, language: null, deletedAt: null, ...over,
});
const sources = (kind: Kind, document: Row, over: Partial<EmailSources> = {}): EmailSources => ({ kind, document, issuer, profile, person, invoice: null, ...over });

test('the form’s requests are read, a Send’s missing texts as empty; anything else is no request', () => {
  const prepare = { step: 'prepare', object: 'billingInvoice', recordId: ID, localDate: TODAY, locale: 'fr-FR' };
  assert.deepEqual(parseEmailRequest(prepare), prepare);
  assert.deepEqual(parseEmailRequest({ ...prepare, step: 'send', from: 'm1', to: 'a@x.example', subject: 'S', message: 'M' }), {
    ...prepare, step: 'send', from: 'm1', to: 'a@x.example', cc: '', subject: 'S', message: 'M',
  });
  assert.equal(parseEmailRequest({ ...prepare, locale: undefined })?.locale, 'en');
  const wrong = [
    null, 'prepare', { ...prepare, step: 'issue' }, { ...prepare, object: 'company' }, { ...prepare, recordId: 'r1' },
    { ...prepare, localDate: '2026-02-30' }, { ...prepare, step: 'send', to: 42 },
  ];
  for (const raw of wrong) assert.equal(parseEmailRequest(raw), null, JSON.stringify(raw));
});

test('an issued invoice, Issued, Sent or Paid, an issued credit note and a quote with a PDF can be sent', () => {
  for (const status of ['ISSUED', 'SENT', 'PAID']) assert.equal(sendRefusal(INVOICE, invoice({ status })), null, status);
  assert.equal(sendRefusal(CREDIT_NOTE, creditNote()), null);
  for (const status of ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'INVOICED']) assert.equal(sendRefusal(QUOTE, quote({ status })), null, status);
});

test('a draft, a cancelled invoice and a deleted document cannot be sent; one that could be, with no PDF, says so', () => {
  assert.deepEqual(sendRefusal(INVOICE, invoice({ status: 'DRAFT', snapshot: null })), { code: 'NOT_SENDABLE', value: 'DRAFT', documentType: 'INVOICE' });
  assert.deepEqual(sendRefusal(INVOICE, invoice({ status: 'DRAFT', snapshot: null, pdf: [] })), { code: 'NOT_SENDABLE', value: 'DRAFT', documentType: 'INVOICE' });
  assert.deepEqual(sendRefusal(INVOICE, invoice({ status: 'CANCELLED' })), { code: 'NOT_SENDABLE', value: 'CANCELLED', documentType: 'INVOICE' });
  assert.deepEqual(sendRefusal(CREDIT_NOTE, creditNote({ status: 'DRAFT', snapshot: null })), { code: 'NOT_SENDABLE', value: 'DRAFT', documentType: 'CREDIT_NOTE' });
  assert.deepEqual(sendRefusal(INVOICE, null), { code: 'NOT_SENDABLE', value: 'DELETED', documentType: 'INVOICE' });
  assert.deepEqual(sendRefusal(QUOTE, quote({ deletedAt: '2026-09-25T10:00:00.000Z' })), { code: 'NOT_SENDABLE', value: 'DELETED', documentType: 'QUOTE' });
  assert.deepEqual(sendRefusal(QUOTE, quote({ pdf: [] })), { code: 'NO_PDF', documentType: 'QUOTE' });
  assert.deepEqual(sendRefusal(QUOTE, quote({ pdf: null })), { code: 'NO_PDF', documentType: 'QUOTE' });
  assert.deepEqual(sendRefusal(INVOICE, invoice({ pdf: [] })), { code: 'NO_PDF', documentType: 'INVOICE' });
});

test('the attachment’s name holds no path or device character and no control character: each becomes a hyphen', () => {
  assert.equal(attachmentOf(INVOICE, invoice({ number: 'F/2026\\0001: A*B?C"D<E>F|G\u0000H\u001fI\u007fJ' }))?.name, 'F-2026-0001- A-B-C-D-E-F-G-H-I-J.pdf');
  assert.equal(attachmentOf(QUOTE, quote({ number: 'D/4', version: 2 }))?.name, 'D-4 v2.pdf');
  assert.equal(attachmentOf(QUOTE, quote({ number: '', pdf: [{ fileId: 'f', label: 'Offre: v1/final.pdf' }] }))?.name, 'Offre- v1-final.pdf');
  assert.equal(attachmentOf(INVOICE, invoice({ number: 'F2026-0001' }))?.name, 'F2026-0001.pdf', 'a number with none of them is left as it is');
});

test('the attachment is the PDF field’s first file, named by the number, a quote’s by its version too', () => {
  assert.deepEqual(attachmentOf(INVOICE, invoice()), { id: 'file-1', name: 'F2026-0001.pdf' });
  assert.deepEqual(attachmentOf(CREDIT_NOTE, creditNote()), { id: 'file-cn', name: 'AV2026-0001.pdf' });
  assert.deepEqual(attachmentOf(QUOTE, quote()), { id: 'file-q2', name: 'D2026-0004 v2.pdf' });
  assert.deepEqual(attachmentOf(QUOTE, quote({ number: '', pdf: [{ fileId: 'f', label: 'Proposal.pdf' }] })), { id: 'f', name: 'Proposal.pdf' });
  assert.equal(attachmentOf(INVOICE, invoice({ pdf: [] })), null);
  assert.equal(attachmentOf(INVOICE, invoice({ pdf: [{ label: 'x.pdf' }] })), null);
});

test('an invoice Issued or Sent whose due date is before the caller’s date gets the reminder; any other document its own template', () => {
  assert.equal(templateOf(INVOICE, invoice({ dueDate: '2026-09-25' }), TODAY), 'REMINDER');
  assert.equal(templateOf(INVOICE, invoice({ status: 'SENT', dueDate: '2026-09-25' }), TODAY), 'REMINDER');
  assert.equal(templateOf(INVOICE, invoice({ dueDate: TODAY }), TODAY), 'INVOICE', 'due today is not overdue');
  assert.equal(templateOf(INVOICE, invoice({ status: 'PAID', dueDate: '2026-09-25' }), TODAY), 'INVOICE', 'paid');
  assert.equal(templateOf(INVOICE, invoice({ dueDate: null }), TODAY), 'INVOICE');
  assert.equal(templateOf(CREDIT_NOTE, creditNote(), TODAY), 'CREDIT_NOTE');
  assert.equal(templateOf(QUOTE, quote(), TODAY), 'QUOTE');
});

test('the facts are formatted as the PDF prints them, in the profile’s locale', () => {
  assert.deepEqual(factsOf(sources(INVOICE, invoice())), {
    number: 'F2026-0001', version: null, seller: 'Verdal Studio', total: '9\u00a0792,00\u00a0€', dueDate: '26/10/2026', validUntil: null, corrects: null, buyer: 'Camille',
  });
  assert.deepEqual(factsOf(sources(QUOTE, quote())), {
    number: 'D2026-0004', version: 2, seller: 'Verdal Studio', total: '600,00\u00a0€', dueDate: null, validUntil: '26/10/2026', corrects: null, buyer: 'Camille',
  });
  assert.equal(factsOf(sources(CREDIT_NOTE, creditNote(), { invoice: invoice() })).corrects, 'F2026-0001');
  assert.equal(factsOf(sources(CREDIT_NOTE, creditNote(), { invoice: null })).corrects, null);
});

test('a currency Intl does not know leaves the total out, and a date that is no day of the calendar leaves it out: the email still reads', () => {
  for (const code of ['EU', 'EURO', '€€€', '12']) {
    assert.equal(factsOf(sources(INVOICE, invoice({ total: money(9_792_000_000, code) }))).total, null, code);
  }
  for (const text of ['not-a-date', '2026-13-45', '2026-02-30', '26/10/2026']) {
    assert.equal(factsOf(sources(INVOICE, invoice({ dueDate: text }))).dueDate, null, text);
    assert.equal(factsOf(sources(QUOTE, quote({ validUntil: text }))).validUntil, null, text);
  }
  const worn = invoice({ total: money(9_792_000_000, 'EU'), dueDate: '2026-13-45' });
  assert.deepEqual(prefilled(sources(INVOICE, worn), TODAY), {
    subject: 'Facture F2026-0001 de Verdal Studio',
    message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint la facture F2026-0001.\n\nCordialement,\nVerdal Studio',
  });
  // Nothing says the invoice is overdue: a date that is no date is not before today.
  assert.equal(templateOf(INVOICE, invoice({ dueDate: '2026-02-30' }), TODAY), 'INVOICE');
});

test('the seller is the issuer’s trading name, else its legal name; the buyer the billed person’s first name, else none', () => {
  assert.equal(factsOf(sources(INVOICE, invoice(), { issuer: { ...issuer, name: ' ' } })).seller, 'Verdal Studio SARL');
  assert.equal(factsOf(sources(INVOICE, invoice({ personId: null }))).buyer, null, 'a company alone');
  assert.equal(factsOf(sources(INVOICE, invoice(), { person: { ...person, name: { firstName: ' ', lastName: 'Durand' } } })).buyer, null);
});

test('a profile with no locale, or one that is not a valid tag, prints in the language’s own locale', () => {
  const english = invoice({ language: 'EN' });
  assert.equal(factsOf(sources(INVOICE, english, { profile: { ...profile, locale: '' } })).total, '€9,792.00');
  assert.equal(factsOf(sources(INVOICE, english, { profile: { ...profile, locale: 'not a locale' } })).total, '€9,792.00');
  assert.equal(factsOf(sources(INVOICE, invoice(), { profile: { ...profile, locale: 'not a locale' } })).total, '9\u00a0792,00\u00a0€');
});

test('each template, in both languages, with a person or without, and the reminder once overdue', () => {
  assert.deepEqual(prefilled(sources(INVOICE, invoice()), TODAY), {
    subject: 'Facture F2026-0001 de Verdal Studio',
    message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint la facture F2026-0001 d’un montant de 9\u00a0792,00\u00a0€, à régler au plus tard le 26/10/2026.\n\nCordialement,\nVerdal Studio',
  });
  assert.deepEqual(prefilled(sources(INVOICE, invoice({ language: 'EN', personId: null })), TODAY), {
    subject: 'Invoice F2026-0001 from Verdal Studio',
    message: 'Hello,\n\nPlease find attached invoice F2026-0001 for 9\u00a0792,00\u00a0€, due on 26/10/2026.\n\nKind regards,\nVerdal Studio',
  });
  assert.equal(prefilled(sources(INVOICE, invoice({ dueDate: '2026-09-20' })), TODAY).subject, 'Relance\u00a0: facture F2026-0001 de Verdal Studio');
  assert.match(
    prefilled(sources(INVOICE, invoice({ language: 'EN', dueDate: '2026-09-20' })), TODAY).message,
    /^Hello Camille,\n\nInvoice F2026-0001 for 9\u00a0792,00\u00a0€ was due on 20\/09\/2026, and we have not received its payment yet\./,
  );
  assert.deepEqual(prefilled(sources(CREDIT_NOTE, creditNote({ language: 'EN' }), { invoice: invoice() }), TODAY), {
    subject: 'Credit note AV2026-0001 from Verdal Studio',
    message: 'Hello Camille,\n\nPlease find attached credit note AV2026-0001 for 1\u00a0440,00\u00a0€, which corrects invoice F2026-0001.\n\nKind regards,\nVerdal Studio',
  });
  assert.deepEqual(prefilled(sources(QUOTE, quote()), TODAY), {
    subject: 'Devis D2026-0004 (version 2) de Verdal Studio',
    message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint notre devis D2026-0004 (version 2) d’un montant de 600,00\u00a0€, valable jusqu’au 26/10/2026.\n\nCordialement,\nVerdal Studio',
  });
});

test('the issuer’s own mailbox is preselected whatever its case, else the first; the billed person’s address starts the To', () => {
  const mailboxes = [{ id: 'm1', handle: 'me@verdal.example' }, { id: 'm2', handle: 'Bonjour@Verdal.example' }];
  assert.equal(preselected(mailboxes, issuer), 'm2');
  assert.equal(preselected(mailboxes, { ...issuer, emails: { primaryEmail: '' } }), 'm1');
  assert.equal(preselected(mailboxes, null), 'm1');
  assert.equal(preselected([], issuer), '');
  assert.equal(recipientOf(invoice(), person), 'camille@calibre.example');
  assert.equal(recipientOf(invoice({ personId: null }), person), '');
  assert.equal(recipientOf(invoice(), null), '');
});

test('recipients are split on commas and semicolons, trimmed, and empty pieces dropped', () => {
  assert.deepEqual(recipientsOf(' camille@calibre.example ;compta@calibre.example,, '), ['camille@calibre.example', 'compta@calibre.example']);
  assert.deepEqual(recipientsOf(''), []);
});

test('a message is checked all at once: each address that is not one, named; To required; at most twenty in all; a subject and a message', () => {
  const ok = { to: 'camille@calibre.example', cc: '', subject: 'Facture', message: 'Bonjour' };
  assert.deepEqual(checkMessage(ok), { problems: [], to: ['camille@calibre.example'], cc: [], subject: 'Facture', message: 'Bonjour' });
  assert.deepEqual(checkMessage({ to: 'Camille Durand <camille@calibre.example>, a@b.c', cc: 'compta@calibre; x y@z.example', subject: ' ', message: '\n\t' }).problems, [
    { code: 'INVALID_RECIPIENT', field: 'to', value: 'Camille Durand <camille@calibre.example>' },
    { code: 'INVALID_RECIPIENT', field: 'cc', value: 'compta@calibre' },
    { code: 'INVALID_RECIPIENT', field: 'cc', value: 'x y@z.example' },
    { code: 'MISSING_SUBJECT', field: 'subject' },
    { code: 'MISSING_MESSAGE', field: 'message' },
  ]);
  assert.deepEqual(checkMessage({ ...ok, to: ' , ', cc: 'compta@calibre.example' }).problems, [{ code: 'MISSING_RECIPIENT', field: 'to' }], 'a copy alone is no recipient');
  // Distinct addresses: the same address in both fields counts once (below).
  const many = (count: number, name = 'p') => Array.from({ length: count }, (_, index) => `${name}${index}@calibre.example`).join(', ');
  assert.deepEqual(checkMessage({ ...ok, to: many(15), cc: many(5, 'c') }).problems, []);
  assert.deepEqual(checkMessage({ ...ok, to: many(15), cc: many(6, 'c') }).problems, [{ code: 'TOO_MANY_RECIPIENTS', value: String(MAX_RECIPIENTS) }]);
});

test('an address written twice, whatever its case, goes once with its first spelling; one already in To is dropped from Cc', () => {
  const checked = checkMessage({
    to: 'Camille@Calibre.example, camille@calibre.example; compta@calibre.example',
    cc: 'COMPTA@calibre.example, nouveau@calibre.example, Nouveau@Calibre.example, CAMILLE@calibre.example',
    subject: 'Facture', message: 'Bonjour',
  });
  assert.deepEqual([checked.problems, checked.to, checked.cc], [[], ['Camille@Calibre.example', 'compta@calibre.example'], ['nouveau@calibre.example']]);
  // The twenty-address limit counts the addresses that remain.
  const many = (count: number) => Array.from({ length: count }, (_, index) => `p${index}@calibre.example`);
  const twenty = many(MAX_RECIPIENTS);
  const again = checkMessage({ to: twenty.join(', '), cc: twenty.map((address) => address.toUpperCase()).join(', '), subject: 'S', message: 'M' });
  assert.deepEqual([again.problems, again.to.length, again.cc], [[], 20, []]);
  // A bad address written twice is told once.
  assert.deepEqual(checkMessage({ to: 'a@b, A@B, ok@calibre.example', cc: '', subject: 'S', message: 'M' }).problems, [{ code: 'INVALID_RECIPIENT', field: 'to', value: 'a@b' }]);
});

test('an address with a control character, whatever it is, is not an address', () => {
  for (const character of ['\u0000', '\u0007', '\u001b', '\u001f', '\u007f']) {
    const address = `ca${character}mille@calibre.example`;
    assert.deepEqual(
      checkMessage({ to: address, cc: '', subject: 'S', message: 'M' }).problems, [{ code: 'INVALID_RECIPIENT', field: 'to', value: address }],
      JSON.stringify(character),
    );
  }
  assert.deepEqual(checkMessage({ to: 'camille@calibre.example', cc: '\u0000x@y.example', subject: 'S', message: 'M' }).problems.map((problem) => problem.field), ['cc']);
});

test('a subject is folded onto one line: it becomes a header', () => {
  assert.equal(checkMessage({ to: 'a@b.example', cc: '', subject: 'Facture F2026-0001\r\nBcc: x@y.example', message: 'M' }).subject, 'Facture F2026-0001 Bcc: x@y.example');
});

test('the message is HTML: every special character escaped, a blank line a paragraph, a single line break a <br>', () => {
  assert.equal(
    messageHtml('Hello Camille,\n\nPlease <b>pay</b> & "thank" you\nIt\'s due.\r\n\r\n \r\nBye'),
    '<p>Hello Camille,</p><p>Please &lt;b&gt;pay&lt;/b&gt; &amp; &quot;thank&quot; you<br>It&#39;s due.</p><p>Bye</p>',
  );
  assert.equal(messageHtml('\n\nOne line\n'), '<p>One line</p>');
  // A line of spaces at the start or the end is no line of a paragraph, whatever the line break that follows or precedes it.
  assert.equal(messageHtml('  \nHello\nthere\n \t'), '<p>Hello<br>there</p>');
  assert.equal(messageHtml(' \r\n\r\n \nHello\r\n \r\n'), '<p>Hello</p>');
  assert.equal(messageHtml('\t\nA\n \nB\n  '), '<p>A</p><p>B</p>');
  assert.equal(messageHtml('  Indented\nstays'), '<p>  Indented<br>stays</p>');
  assert.equal(messageHtml(' \n \n'), '');
  assert.equal(messageHtml('<script>alert(1)</script> <a href="x">link</a>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt; &lt;a href=&quot;x&quot;&gt;link&lt;/a&gt;</p>');
});
