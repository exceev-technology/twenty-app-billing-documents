import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_PATH, formWords, inputValue, postEmail, readPrepared, readSent, withField, type EmailForm, type EmailRequest } from '../src/front-components/email-form.ts';

const FORM: EmailForm = {
  number: 'F2026-0001', mailboxes: [{ id: 'm1', handle: 'bonjour@verdal.example' }], from: 'm1', to: 'camille@calibre.example', cc: '',
  subject: 'Facture F2026-0001', message: 'Bonjour', attachment: 'F2026-0001.pdf',
};
const PREPARE: EmailRequest = { step: 'prepare', object: 'billingInvoice', recordId: 'r1', localDate: '2026-09-26', locale: 'en' };
const restError = (status: number, body: unknown) => Object.assign(new Error('failed'), { name: 'RestApiClientError', status, body });

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
    ok: false, problems: ['Your role cannot send email.'],
  });
  assert.deepEqual(readSent({ status: 502, body: '<html>' }, 'en'), { ok: false, problems: ['The billing action failed (HTTP 502).'] });
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
  const fr = formWords('fr-FR');
  assert.equal(fr.heading('billingCreditNote', 'AV2026-0001'), 'Envoyer l’avoir AV2026-0001');
  assert.equal(fr.attachmentLine('F2026-0017.pdf'), 'Pièce jointe : F2026-0017.pdf');
  const texts = [
    fr.heading('billingQuote', 'D2026-0004'), fr.attachmentLine('x.pdf'), fr.from, fr.to, fr.cc, fr.subject, fr.message, fr.separate,
    fr.loading, fr.send, fr.sending, fr.cancel,
  ];
  for (const text of texts) assert.doesNotMatch(text, / [:;?!]|« | »/, text);
});
