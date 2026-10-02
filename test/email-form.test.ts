import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_PATH, SEND_START, canSend, formWords, inputValue, postEmail, readPrepared, readSent, sendStep, withField,
  type EmailForm, type EmailRequest, type SendEvent, type SendState, type SentRead,
} from '../src/front-components/email-form.ts';

const FORM: EmailForm = {
  number: 'F2026-0001', mailboxes: [{ id: 'm1', handle: 'bonjour@verdal.example' }], from: 'm1', to: 'camille@calibre.example', cc: '',
  subject: 'Facture F2026-0001', message: 'Bonjour', attachment: 'F2026-0001.pdf',
};
const PREPARE: EmailRequest = { step: 'prepare', object: 'billingInvoice', recordId: 'r1', localDate: '2026-09-26', locale: 'en' };
const restError = (status: number, body: unknown) => Object.assign(new Error('failed'), { name: 'RestApiClientError', status, body });

const UNCONFIRMED_EN = 'We could not confirm that the email was sent: check your Sent folder, or the document’s timeline, before sending it again.';
const UNCONFIRMED_FR = 'Impossible de confirmer l’envoi de l’e-mail\u00a0: vérifiez vos éléments envoyés, ou l’historique du document, avant de le renvoyer.';

test('the form posts to the email route, and keeps every answer, a refusal included', async () => {
  assert.equal(EMAIL_PATH, '/s/billing/email');
  const posted: unknown[] = [];
  const answer = await postEmail(async (path, body) => {
    posted.push([path, body]);
    return { ok: true, form: FORM };
  }, PREPARE);
  assert.deepEqual(answer, { status: 200, body: { ok: true, form: FORM } });
  assert.deepEqual(posted, [[EMAIL_PATH, PREPARE]]);
  const refused = { ok: false, problems: [{ code: 'NO_MAILBOX', message: 'Connect a mailbox.' }] };
  assert.deepEqual(await postEmail(async () => { throw restError(422, refused); }, PREPARE), { status: 422, body: refused });
});

test('Prepare’s answer is the form, or the problems the route worded, or the buttons’ words for a transport failure', () => {
  assert.deepEqual(readPrepared({ status: 200, body: { ok: true, form: FORM } }, 'en'), { ok: true, form: FORM });
  const problems = [{ code: 'NO_PDF', message: 'No PDF.' }, { code: 'NO_MAILBOX', message: 'No mailbox.' }];
  assert.deepEqual(readPrepared({ status: 422, body: { ok: false, problems } }, 'en'), { ok: false, problems: ['No PDF.', 'No mailbox.'] });
  assert.deepEqual(readPrepared({ status: null, body: null }, 'en'), {
    ok: false, problems: ['The billing action could not reach the server. Check your connection and try again.'],
  });
  const off = readPrepared({ status: 404, body: null }, 'fr');
  assert.ok(!off.ok);
  assert.match(off.problems[0]!, /fonctions logiques/);
  assert.deepEqual(readPrepared({ status: 200, body: { ok: true, form: { ...FORM, mailboxes: 'm1' } } }, 'en'), {
    ok: false, problems: ['The billing action failed (HTTP 200).'],
  });
});

test('Send’s answer is the snackbar, a warning when the document could not be marked, or the problems to list', () => {
  assert.deepEqual(readSent({ status: 200, body: { ok: true, message: 'Sent to camille@calibre.example.', marked: true } }, 'en'), {
    ok: true, message: 'Sent to camille@calibre.example.', variant: 'success',
  });
  assert.deepEqual(readSent({ status: 200, body: { ok: true, message: 'Sent, but not marked (ref x).', marked: false } }, 'en'), {
    ok: true, message: 'Sent, but not marked (ref x).', variant: 'warning',
  });
  assert.deepEqual(readSent({ status: 403, body: { ok: false, problems: [{ code: 'EMAIL_NOT_ALLOWED', message: 'Your role cannot send email.' }] } }, 'en'), {
    ok: false, unconfirmed: false, problems: ['Your role cannot send email.'],
  });
});

test('a route body is read as the route worded it, whatever its status: the route’s own 500 included', () => {
  const unexpected = 'The email may have gone: check your Sent folder before trying again (ref 7f3a…).';
  assert.deepEqual(readSent({ status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: unexpected }] } }, 'en'), {
    ok: false, unconfirmed: false, problems: [unexpected],
  });
  assert.deepEqual(readSent({ status: 502, body: { ok: false, problems: [{ code: 'SEND_FAILED', message: 'The mail server refused it.' }] } }, 'en'), {
    ok: false, unconfirmed: false, problems: ['The mail server refused it.'],
  });
});

test('a send with no route body that may have gone says so, in the person’s language, and does not invite a resend', () => {
  const lost = [
    { status: null, body: null },
    { status: 500, body: null },
    { status: 502, body: '<html>' },
    { status: 504, body: null },
    // The request got through to something that answered success without the route's body: the email may have gone too.
    { status: 200, body: '<html>' },
    { status: 200, body: { ok: true } },
  ];
  for (const answer of lost) {
    assert.deepEqual(readSent(answer, 'en'), { ok: false, unconfirmed: true, problems: [UNCONFIRMED_EN] }, JSON.stringify(answer));
    assert.deepEqual(readSent(answer, 'fr-FR'), { ok: false, unconfirmed: true, problems: [UNCONFIRMED_FR] }, JSON.stringify(answer));
  }
});

test('a send that never reached the route sent nothing: the buttons’ words, and the person may try again', () => {
  assert.deepEqual(readSent({ status: 404, body: null }, 'en'), {
    ok: false, unconfirmed: false,
    problems: ['The billing actions need logic functions, which are turned off on this server. See “Issuing documents” in the app’s README.'],
  });
  assert.deepEqual(readSent({ status: 400, body: 'Bad Request' }, 'en'), { ok: false, unconfirmed: false, problems: ['The billing action failed (HTTP 400).'] });
  assert.deepEqual(readSent({ status: 429, body: null }, 'fr'), { ok: false, unconfirmed: false, problems: ['L’action de facturation a échoué (HTTP 429).'] });
});

test('a change event’s value is read from its detail, else its target', () => {
  assert.equal(inputValue({ detail: { value: 'a@x.example' } }), 'a@x.example');
  assert.equal(inputValue({ target: { value: 'b@x.example' } }), 'b@x.example');
  assert.equal(inputValue({ detail: { value: '' }, target: { value: 'stale' } }), '');
  assert.equal(inputValue({ detail: { value: 3 } }), '');
  assert.equal(inputValue(null), '');
});

test('an edit makes a new form, the one shown left as it was', () => {
  assert.deepEqual(withField(FORM, 'to', 'a@x.example'), { ...FORM, to: 'a@x.example' });
  assert.equal(FORM.to, 'camille@calibre.example');
});

test('the form’s words follow the person’s language, and its French takes no plain space before : ; ? !', () => {
  const en = formWords('en');
  assert.equal(en.heading('billingInvoice', 'F2026-0017'), 'Send invoice F2026-0017');
  assert.equal(en.heading('billingCreditNote', 'AV2026-0001'), 'Send credit note AV2026-0001');
  assert.equal(en.attachmentLine('F2026-0017.pdf'), 'Attachment: F2026-0017.pdf');
  assert.equal(en.noRecord, 'No document is selected.');
  const fr = formWords('fr-FR');
  assert.equal(fr.heading('billingCreditNote', 'AV2026-0001'), 'Envoyer l’avoir AV2026-0001');
  assert.equal(fr.attachmentLine('F2026-0017.pdf'), 'Pièce jointe\u00a0: F2026-0017.pdf');
  assert.equal(fr.noRecord, 'Aucun document n’est sélectionné.');
  const texts = [
    fr.heading('billingQuote', 'D2026-0004'), fr.attachmentLine('x.pdf'), fr.from, fr.to, fr.cc, fr.subject, fr.message, fr.separate,
    fr.loading, fr.noRecord, fr.send, fr.sending, fr.cancel, UNCONFIRMED_FR,
  ];
  for (const text of texts) assert.doesNotMatch(text, / [:;?!]|« | »/, text);
});

const SENT: SentRead = { ok: true, message: 'Sent to camille@calibre.example.', variant: 'success' };
const SENT_NOT_MARKED: SentRead = { ok: true, message: 'Sent, but not marked (ref x).', variant: 'warning' };
const REFUSED: SentRead = { ok: false, unconfirmed: false, problems: ['Your role cannot send email.'] };
const UNCONFIRMED: SentRead = { ok: false, unconfirmed: true, problems: [UNCONFIRMED_EN] };

const run = (...events: SendEvent[]): SendState => events.reduce<SendState>(sendStep, SEND_START);
/** The state of a form Prepare has filled for a record. */
const loaded = (record: string): SendEvent[] => [{ type: 'select', record }, { type: 'loaded', record }];

test('Send starts disabled, and a record whose form is not loaded cannot be sent', () => {
  assert.equal(canSend(SEND_START), false);
  assert.equal(canSend(run({ type: 'select', record: 'a' })), false);
  assert.equal(canSend(run({ type: 'select', record: null })), false);
  const waiting = run({ type: 'select', record: 'a' });
  assert.equal(sendStep(waiting, { type: 'send', record: 'a' }), waiting, 'Send before the form is loaded does nothing');
  assert.equal(canSend(run(...loaded('a'))), true);
});

test('a loaded form goes from idle to sending on Send, and a second Send while sending does nothing', () => {
  const idle = run(...loaded('a'));
  assert.deepEqual(idle, { record: 'a', phase: 'idle' });
  const sending = sendStep(idle, { type: 'send', record: 'a' });
  assert.deepEqual(sending, { record: 'a', phase: 'sending' });
  assert.equal(canSend(sending), false);
  assert.equal(sendStep(sending, { type: 'send', record: 'a' }), sending, 'the very same state: nothing was accepted');
});

test('a confirmed answer leaves the form sent: Send stays disabled, and a second Send does nothing', () => {
  for (const read of [SENT, SENT_NOT_MARKED]) {
    const sent = run(...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read });
    assert.deepEqual(sent, { record: 'a', phase: 'sent' });
    assert.equal(canSend(sent), false);
    assert.equal(sendStep(sent, { type: 'send', record: 'a' }), sent);
    assert.equal(sendStep(sent, { type: 'loaded', record: 'a' }), sent, 'a late Prepare does not unlock it');
  }
});

test('an unconfirmed answer leaves the form locked as a success does: Send stays disabled for the form’s life', () => {
  const unconfirmed = run(...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read: UNCONFIRMED });
  assert.deepEqual(unconfirmed, { record: 'a', phase: 'unconfirmed' });
  assert.equal(canSend(unconfirmed), false);
  assert.equal(sendStep(unconfirmed, { type: 'send', record: 'a' }), unconfirmed);
  assert.equal(sendStep(unconfirmed, { type: 'answer', record: 'a', read: REFUSED }), unconfirmed, 'a stray answer does not unlock it either');
});

test('a refused answer, or a request that never reached the route, gives Send back, and a retry may follow', () => {
  const refused = run(...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read: REFUSED });
  assert.deepEqual(refused, { record: 'a', phase: 'idle' });
  assert.equal(canSend(refused), true);
  const notReached = readSent({ status: 404, body: null }, 'en');
  assert.equal(notReached.ok, false);
  const again = run(...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read: notReached }, { type: 'send', record: 'a' });
  assert.deepEqual(again, { record: 'a', phase: 'sending' });
});

test('an answer nobody is waiting for changes nothing', () => {
  const idle = run(...loaded('a'));
  assert.equal(sendStep(idle, { type: 'answer', record: 'a', read: SENT }), idle);
  const waiting = run({ type: 'select', record: 'a' });
  assert.equal(sendStep(waiting, { type: 'answer', record: 'a', read: SENT }), waiting);
});

test('a record change resets the form: whatever phase it was in, the new record starts unloaded', () => {
  const starts: SendEvent[][] = [
    loaded('a'),
    [...loaded('a'), { type: 'send', record: 'a' }],
    [...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read: SENT }],
    [...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read: UNCONFIRMED }],
  ];
  for (const events of starts) {
    const moved = run(...events, { type: 'select', record: 'b' });
    assert.deepEqual(moved, { record: 'b', phase: 'unloaded' });
    assert.equal(canSend(moved), false);
    assert.equal(sendStep(moved, { type: 'send', record: 'b' }), moved, 'B’s Send waits for B’s form');
    assert.equal(canSend(sendStep(moved, { type: 'loaded', record: 'b' })), true);
  }
});

test('an answer asked for another record is ignored, Prepare’s and Send’s', () => {
  const sendingA = run(...loaded('a'), { type: 'send', record: 'a' });
  // The selection moves to B while A’s Send is in flight.
  const onB = sendStep(sendingA, { type: 'select', record: 'b' });
  assert.equal(sendStep(onB, { type: 'answer', record: 'a', read: SENT }), onB, 'A’s answer does not touch B’s form');
  assert.equal(sendStep(onB, { type: 'loaded', record: 'a' }), onB, 'A’s Prepare does not load into B');
  assert.equal(sendStep(onB, { type: 'send', record: 'a' }), onB, 'A’s id with B’s form is never sent');
  // B’s form is loaded and B’s Send in flight when A’s late answer arrives.
  const sendingB = sendStep(sendStep(onB, { type: 'loaded', record: 'b' }), { type: 'send', record: 'b' });
  assert.equal(sendStep(sendingB, { type: 'answer', record: 'a', read: UNCONFIRMED }), sendingB);
  assert.deepEqual(sendStep(sendingB, { type: 'answer', record: 'b', read: SENT }), { record: 'b', phase: 'sent' });
});
