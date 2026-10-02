import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EMAIL_PATH, SEND_START, SENDS_IN_FLIGHT, canSend, claimSend, formWords, inputValue, postEmail, readPrepared, readSent, releaseSend, sendKey, sendStep,
  staleNotice, withField,
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
  const unexpected = 'Something went wrong (ref 7f3a…).';
  assert.deepEqual(readSent({ status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: unexpected }] } }, 'en'), {
    ok: false, unconfirmed: false, problems: [unexpected],
  });
  assert.deepEqual(readSent({ status: 502, body: { ok: false, problems: [{ code: 'SEND_FAILED', message: 'The mail server refused it.' }] } }, 'en'), {
    ok: false, unconfirmed: false, problems: ['The mail server refused it.'],
  });
});

test('the route’s own “may have gone” code locks Send, and its message is shown as the route worded it', () => {
  const lost = 'The email may have gone: check your Sent folder before trying again (ref 7f3a…).';
  assert.deepEqual(readSent({ status: 500, body: { ok: false, problems: [{ code: 'SEND_UNCONFIRMED', message: lost }] } }, 'en'), {
    ok: false, unconfirmed: true, problems: [lost],
  });
  // The code decides, not the status, and not its place in the list.
  assert.deepEqual(
    readSent({ status: 502, body: { ok: false, problems: [{ code: 'SEND_FAILED', message: 'Refused.' }, { code: 'SEND_UNCONFIRMED', message: lost }] } }, 'fr'),
    { ok: false, unconfirmed: true, problems: ['Refused.', lost] },
  );
  // Any other UNEXPECTED keeps its reading: nothing was sent, the person may try again.
  const other = readSent({ status: 500, body: { ok: false, problems: [{ code: 'UNEXPECTED', message: lost }] } }, 'en');
  assert.deepEqual(other, { ok: false, unconfirmed: false, problems: [lost] });
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

test('the route’s own “may have gone” answer locks the form as a lost one does', () => {
  const lost = readSent({ status: 500, body: { ok: false, problems: [{ code: 'SEND_UNCONFIRMED', message: 'It may have gone (ref x).' }] } }, 'en');
  const locked = run(...loaded('a'), { type: 'send', record: 'a' }, { type: 'answer', record: 'a', read: lost });
  assert.deepEqual(locked, { record: 'a', phase: 'unconfirmed' });
  assert.equal(canSend(locked), false);
});

test('an answer for a record no longer shown still tells the person: the sent message, the warning, or that it could not be confirmed', () => {
  assert.deepEqual(staleNotice(SENT, 'en'), { message: 'Sent to camille@calibre.example.', variant: 'success' });
  assert.deepEqual(staleNotice(SENT_NOT_MARKED, 'en'), { message: 'Sent, but not marked (ref x).', variant: 'warning' });
  const lostAnswers = [
    { status: null, body: null },
    { status: 504, body: null },
    { status: 500, body: { ok: false, problems: [{ code: 'SEND_UNCONFIRMED', message: 'It may have gone (ref x).' }] } },
  ];
  for (const answer of lostAnswers) {
    assert.deepEqual(staleNotice(readSent(answer, 'en'), 'en'), { message: UNCONFIRMED_EN, variant: 'warning' }, JSON.stringify(answer));
    assert.deepEqual(staleNotice(readSent(answer, 'fr'), 'fr'), { message: UNCONFIRMED_FR, variant: 'warning' }, JSON.stringify(answer));
  }
});

test('a refusal for a record no longer shown says nothing: the person is not on that form any more', () => {
  assert.equal(staleNotice(REFUSED, 'en'), null);
  assert.equal(staleNotice(readSent({ status: 404, body: null }, 'en'), 'en'), null);
  assert.equal(staleNotice(readSent({ status: 422, body: { ok: false, problems: [{ code: 'MISSING_SUBJECT', message: 'Subject.' }] } }, 'en'), 'en'), null);
});

test('a document’s Send is claimed once at a time, released by any answer, and claimed again for a deliberate second send', () => {
  const inFlight = new Set<string>();
  const key = sendKey('billingInvoice', 'r1');
  assert.equal(claimSend(inFlight, key), true);
  assert.equal(claimSend(inFlight, key), false, 'refused while its first Send is in flight');
  assert.equal(claimSend(inFlight, sendKey('billingInvoice', 'r2')), true, 'another record is free');
  assert.equal(claimSend(inFlight, sendKey('billingQuote', 'r1')), true, 'the same id on another object is another document');
  releaseSend(inFlight, key);
  assert.equal(claimSend(inFlight, key), true, 'after an answer, a new form may send again');
  releaseSend(inFlight, key);
  releaseSend(inFlight, key);
  assert.equal(inFlight.has(key), false, 'releasing what is not claimed is harmless');
  assert.equal(SENDS_IN_FLIGHT.size, 0, 'the component’s own set starts empty');
});

/**
 * The component's source, comments dropped: its wiring is pinned as text, since a render needs React and the SDK's host.
 * Every pattern below lets whitespace vary (`\s*`), so a reformat does not break it, and a deleted line does.
 */
const FORM_SOURCE = readFileSync(new URL('../src/front-components/send-email-form.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|\s)\/\/[^\n]*/g, ' ');
/** The `submit` handler, and all that follows it. */
const SUBMIT = FORM_SOURCE.slice(FORM_SOURCE.search(/\bconst submit\s*=\s*async\b/));
const RELEASE = /\breleaseSend\(\s*SENDS_IN_FLIGHT\s*,\s*key\s*,?\s*\)/;

test('Send claims its document and its form before the first await: a second click in the same tick cannot send again', () => {
  assert.ok(SUBMIT.length > 0, 'the form has no submit handler');
  const firstAwait = SUBMIT.search(/\bawait\b/);
  assert.ok(firstAwait > 0, 'submit never awaits');
  const claims = [
    ['the document’s claim', /\bclaimSend\(\s*SENDS_IN_FLIGHT\s*,\s*key\s*,?\s*\)/],
    ['the form’s step to sending', /\bstep\(\s*\{\s*type:\s*'send'/],
  ] as const;
  for (const [name, pattern] of claims) {
    const at = SUBMIT.search(pattern);
    assert.ok(at >= 0, `${name} is gone`);
    assert.ok(at < firstAwait, `${name} comes after the first await`);
  }
});

test('Send releases its document in a finally, so any answer, or a throw, frees it for a later Send', () => {
  const posting = SUBMIT.search(/\bawait\s+postEmail\(/);
  assert.ok(posting >= 0, 'submit no longer awaits the post');
  assert.match(SUBMIT.slice(0, posting), /\btry\s*\{[^{}]*$/, 'the post is not in a try');
  // The first finally after the post, with no brace inside it: the one that belongs to that try.
  const finallyBlock = /^finally\s*\{([^{}]*)\}/.exec(SUBMIT.slice(posting + SUBMIT.slice(posting).search(/\bfinally\b/)));
  assert.ok(finallyBlock, 'the post’s try has no finally');
  assert.match(finallyBlock[1]!, RELEASE, 'the finally does not release the claim');
});

test('Cancel is disabled while a send is in flight: closing the panel then would lose the answer', () => {
  assert.match(FORM_SOURCE, /\bconst sending\s*=\s*send\.phase\s*===\s*'sending'/, '`sending` is not the machine’s sending phase');
  // Whole JSX opening tags; `=>` inside an attribute is not their end.
  const cancels = (FORM_SOURCE.match(/<button\b(?:=>|[^>])*>/g) ?? []).filter((tag) => /\bonClick=\{\s*close\s*\}/.test(tag));
  assert.ok(cancels.length > 0, 'no button closes the panel');
  // The last is the one beside Send, in the loaded form; the first, with no form, has no send to wait for.
  assert.match(cancels.at(-1)!, /\bdisabled=\{\s*sending\s*\}/, 'the form’s Cancel is not disabled while sending');
});

test('after a send the snackbar and the closing of the panel each have a try of their own: a failed snackbar still closes, a panel that stays open still leaves the form', () => {
  const snackbar = SUBMIT.search(/\bawait\s+enqueueSnackbar\(\s*\{\s*message:\s*read\.message\b/);
  const closing = SUBMIT.search(/\bawait\s+closeSidePanel\(\s*\)/);
  assert.ok(snackbar >= 0, 'submit no longer shows the sent message');
  assert.ok(closing > snackbar, 'submit no longer closes the panel after the message');
  assert.match(SUBMIT.slice(0, snackbar), /\btry\s*\{\s*$/, 'the snackbar is not in a try of its own');
  assert.match(SUBMIT.slice(0, closing), /\btry\s*\{\s*$/, 'closing the panel is not in a try of its own');
  assert.match(SUBMIT.slice(snackbar, closing), /\}\s*catch\b[^]*\}\s*try\s*\{\s*$/, 'the snackbar’s try is not closed, with its catch, before the panel’s opens');
});
