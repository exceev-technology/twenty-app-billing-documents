import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import billingEmail, { respond, runEmail, type EmailDeps, type EmailOutcome } from '../src/logic-functions/billing-email.ts';
import { EmailNotAllowedError, SendFailedError, type Mailbox, type Mailer, type OutgoingEmail } from '../lifecycle/mailer.ts';
import type { Row } from '../lifecycle/store.ts';
import { IDS } from '../src/ids.ts';
import { TODAY, money, now, workspace, type Workspace } from './lifecycle/helpers/fixtures.ts';
import { bundleLogicFunction } from './helpers/logic-function-build.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/** The caller's mailboxes: the issuer's own address comes second, in another case. */
const MAILBOXES: Mailbox[] = [{ id: 'mailbox-me', handle: 'me@verdal.example' }, { id: 'mailbox-studio', handle: 'Bonjour@Verdal.example' }];
const PDF = { fileId: 'file-pdf-1', label: 'F2026-0001.pdf', extension: 'pdf', url: 'https://files.example/file-pdf-1' };
/** A quote's PDF field after two versions: the newest first. */
const QUOTE_PDFS = [{ fileId: 'file-q2', label: 'D2026-0004 v2.pdf' }, { fileId: 'file-q1', label: 'D2026-0004 v1.pdf' }];

/** A Mailer that lists the given mailboxes and records what it sends; `send` may refuse. */
function fakeMailer(over: { accounts?: Mailbox[]; send?: (email: OutgoingEmail) => Promise<void> } = {}) {
  const sent: OutgoingEmail[] = [];
  const mailer: Mailer = {
    accounts: async () => over.accounts ?? MAILBOXES,
    async send(email) {
      if (over.send) await over.send(email);
      sent.push(email);
    },
  };
  return { mailer, sent };
}

function setup(w: Workspace, over: Partial<EmailDeps> = {}) {
  const logs: Record<string, unknown>[] = [];
  const { mailer, sent } = fakeMailer();
  const deps: EmailDeps = {
    app: w.app, caller: w.db.store('MANUAL'), mailer, now, reference: () => 'ref-7f3a', log: (entry) => logs.push(entry), ...over,
  };
  return { deps, sent, logs };
}

/** The fixture's invoice as Issue leaves it, billed to Camille: F2026-0001, 9 792,00 €, due on 26/10/2026, its PDF in place. */
async function issuedInvoice(w: Workspace, over: Record<string, unknown> = {}): Promise<void> {
  await w.app.update('billingInvoices', w.invoice.id, {
    status: 'ISSUED', number: 'F2026-0001', issueDate: TODAY, dueDate: '2026-10-26', personId: w.person.id, total: money(9_792_000_000),
    snapshot: { printed: {}, record: {} }, pdf: [PDF], issuedAt: '2026-09-26T09:30:00.000Z', ...over,
  });
}

const prepareBody = (w: Workspace, over: Record<string, unknown> = {}) => ({
  step: 'prepare', object: 'billingInvoice', recordId: w.invoice.id, localDate: TODAY, locale: 'en', ...over,
});
const problemCodes = (outcome: EmailOutcome): string[] => (outcome.body.ok ? [] : outcome.body.problems.map((problem) => problem.code));

/** The form Prepare answered; the test fails on any other answer. */
function formOf(outcome: EmailOutcome) {
  assert.ok(outcome.body.ok && 'form' in outcome.body, JSON.stringify(outcome.body));
  return outcome.body.form;
}

test('the route validates: POST /billing/email, signed in, thirty seconds', () => {
  assert.equal(billingEmail.success, true, billingEmail.errors.join('\n'));
  assert.equal(billingEmail.config.name, 'billing-email');
  assert.equal(billingEmail.config.universalIdentifier, IDS['logicFunction.billingEmail']);
  assert.deepEqual(billingEmail.config.httpRouteTriggerSettings, { path: '/billing/email', httpMethod: 'POST', isAuthRequired: true });
  assert.equal(billingEmail.config.timeoutSeconds, 30);
});

test('a call no signed-in person made is refused as NOT_ALLOWED, in the caller’s language, before anything is read', async () => {
  const w = workspace();
  const noDeps = (): EmailDeps => {
    throw new Error('the route must not build its dependencies for this call');
  };
  const answer = await respond({ body: prepareBody(w, { locale: 'fr-FR' }), userWorkspaceId: null }, { workspaceMemberId: null }, noDeps);
  assert.equal(answer.status, 403);
  assert.deepEqual(answer.body, {
    ok: false,
    problems: [{ code: 'NOT_ALLOWED', message: 'Votre rôle ne permet pas de modifier ce document\u00a0: vous ne pouvez donc pas lancer cette action.' }],
  });
});

test('a signed-in person’s request runs, its body read as JSON, and the answer carries the outcome’s status', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps } = setup(w);
  const answer = await respond({ body: JSON.stringify(prepareBody(w)), userWorkspaceId: 'uw-1' }, { workspaceMemberId: 'member-1' }, () => deps);
  assert.equal(answer.status, 200);
  assert.equal((answer.body as { form: { attachment: string } }).form.attachment, 'F2026-0001.pdf');
});

test('Prepare fills the form in the document’s language: the person’s address, the issuer’s mailbox, the PDF by its number; it writes and sends nothing', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(prepareBody(w), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.deepEqual(outcome.body, {
    ok: true,
    form: {
      number: 'F2026-0001', mailboxes: MAILBOXES, from: 'mailbox-studio', to: 'camille@calibre.example', cc: '',
      subject: 'Facture F2026-0001 de Verdal Studio',
      message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint la facture F2026-0001 d’un montant de 9\u00a0792,00\u00a0€, à régler au plus tard le 26/10/2026.\n\nCordialement,\nVerdal Studio',
      attachment: 'F2026-0001.pdf',
    },
  });
  assert.deepEqual([w.db.writes.length, sent.length, w.db.timeline.length], [before, 0, 0]);
});

test('an English invoice billed to a company alone starts with no recipient, and greets no one by name', async () => {
  const w = workspace();
  await issuedInvoice(w, { language: 'EN', personId: null });
  const form = formOf(await runEmail(prepareBody(w), setup(w).deps));
  assert.deepEqual([form.to, form.subject, form.message], [
    '', 'Invoice F2026-0001 from Verdal Studio',
    'Hello,\n\nPlease find attached invoice F2026-0001 for 9\u00a0792,00\u00a0€, due on 26/10/2026.\n\nKind regards,\nVerdal Studio',
  ]);
});

test('an invoice Sent and past its due date is prefilled with a reminder', async () => {
  const w = workspace();
  await issuedInvoice(w, { status: 'SENT', dueDate: '2026-09-20' });
  const form = formOf(await runEmail(prepareBody(w), setup(w).deps));
  assert.equal(form.subject, 'Relance\u00a0: facture F2026-0001 de Verdal Studio');
  assert.match(form.message, /la facture F2026-0001 d’un montant de 9\u00a0792,00\u00a0€, échue le 20\/09\/2026, n’est pas encore réglée/);
});

test('a credit note names the invoice it corrects; a quote its version, its validity and its newest PDF', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps } = setup(w);
  const note = w.addCreditNote({
    status: 'ISSUED', number: 'AV2026-0001', invoiceId: w.invoice.id, personId: w.person.id, language: 'EN', snapshot: { printed: {}, record: {} },
    pdf: [{ fileId: 'file-cn', label: 'AV2026-0001.pdf' }], total: money(1_440_000_000),
  });
  const credit = formOf(await runEmail(prepareBody(w, { object: 'billingCreditNote', recordId: note.id }), deps));
  assert.deepEqual([credit.subject, credit.message, credit.attachment], [
    'Credit note AV2026-0001 from Verdal Studio',
    'Hello Camille,\n\nPlease find attached credit note AV2026-0001 for 1\u00a0440,00\u00a0€, which corrects invoice F2026-0001.\n\nKind regards,\nVerdal Studio',
    'AV2026-0001.pdf',
  ]);
  const quote = w.addQuote({
    status: 'SENT', number: 'D2026-0004', version: 2, personId: w.person.id, language: 'EN', validUntil: '2026-10-26', total: money(600_000_000), pdf: QUOTE_PDFS,
  });
  const quoted = formOf(await runEmail(prepareBody(w, { object: 'billingQuote', recordId: quote.id }), deps));
  assert.deepEqual([quoted.number, quoted.subject, quoted.message, quoted.attachment], [
    'D2026-0004', 'Quote D2026-0004 (version 2) from Verdal Studio',
    'Hello Camille,\n\nPlease find attached our quote D2026-0004 (version 2) for 600,00\u00a0€, valid until 26/10/2026.\n\nKind regards,\nVerdal Studio',
    'D2026-0004 v2.pdf',
  ]);
});

test('Prepare lists every refusal at once, in the person’s language: a draft, a cancelled or deleted document, a quote with no PDF, no mailbox', async () => {
  const w = workspace();
  const noMailbox = setup(w, { mailer: fakeMailer({ accounts: [] }).mailer }).deps;
  const draft = await runEmail(prepareBody(w), noMailbox);
  assert.equal(draft.status, 422);
  assert.ok(!draft.body.ok);
  assert.deepEqual(draft.body.problems.map((problem) => problem.message), [
    'Only an issued invoice can be sent: issue this one first.',
    'You have no mailbox connected to Twenty: connect yours in Settings → Accounts, then open this form again.',
  ]);
  const { deps } = setup(w);
  await issuedInvoice(w, { status: 'CANCELLED' });
  assert.deepEqual(problemCodes(await runEmail(prepareBody(w), deps)), ['NOT_SENDABLE']);
  await w.app.softDelete('billingInvoices', w.invoice.id);
  const deleted = await runEmail(prepareBody(w, { locale: 'fr' }), deps);
  assert.ok(!deleted.body.ok);
  assert.deepEqual(deleted.body.problems.map((problem) => problem.message), ['Ce document est supprimé\u00a0: restaurez-le pour l’envoyer.']);
  const quote = w.addQuote({ number: 'D2026-0004', pdf: [] });
  assert.deepEqual(problemCodes(await runEmail(prepareBody(w, { object: 'billingQuote', recordId: quote.id }), deps)), ['NO_PDF']);
  const note = w.addCreditNote({ invoiceId: w.invoice.id });
  assert.deepEqual(problemCodes(await runEmail(prepareBody(w, { object: 'billingCreditNote', recordId: note.id }), deps)), ['NOT_SENDABLE']);
});

test('a person who cannot read the document, or from whom it is hidden, gets NOT_ALLOWED, and nothing of it', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const refused = await runEmail(prepareBody(w), setup(w, { caller: w.db.store('MANUAL', { canRead: () => false }) }).deps);
  assert.equal(refused.status, 403);
  assert.deepEqual(problemCodes(refused), ['NOT_ALLOWED']);
  assert.doesNotMatch(JSON.stringify(refused.body), /camille|F2026/i);
  const hidden = await runEmail(prepareBody(w), setup(w, { caller: { ...w.db.store('MANUAL'), get: async () => null } }).deps);
  assert.deepEqual([hidden.status, problemCodes(hidden)], [403, ['NOT_ALLOWED']]);
});

test('a request the route does not answer is unexpected: a reference, and a log', async () => {
  const w = workspace();
  const { deps, logs } = setup(w);
  const odd = await runEmail({ step: 'send', object: 'billingInvoice' }, deps);
  assert.equal(odd.status, 500);
  assert.deepEqual(odd.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] });
  assert.deepEqual([logs[0]?.reference, logs[0]?.step], ['ref-7f3a', 'request']);
});

test('bundled as the CLI bundles it, the route prepares a form, and carries neither pdfmake nor the Renderer’s layouts', async () => {
  // Inside node_modules, so that the two client modules left external resolve, as the platform provides them.
  mkdirSync(join(ROOT, 'node_modules/.cache'), { recursive: true });
  const folder = mkdtempSync(join(ROOT, 'node_modules/.cache/email-bundle-'));
  try {
    const inputs = await bundleLogicFunction(join(ROOT, 'src/logic-functions/billing-email.ts'), join(folder, 'route.mjs'));
    assert.ok(inputs.some((input) => input.endsWith('lifecycle/email.ts')), 'the route bundles lifecycle/email.ts');
    assert.ok(!inputs.some((input) => input.includes('pdfmake')), 'the route bundles pdfmake');
    assert.ok(!inputs.some((input) => input.includes('render/document.ts') || input.includes('render/layouts/') || input.includes('render/pdf.ts')), 'the route bundles the Renderer');

    const entry = join(folder, 'entry.ts');
    writeFileSync(entry, [
      `import { respond } from ${JSON.stringify(join(ROOT, 'src/logic-functions/billing-email.ts'))};`,
      `import { TODAY, money, now, workspace } from ${JSON.stringify(join(ROOT, 'test/lifecycle/helpers/fixtures.ts'))};`,
      'const w = workspace();',
      `await w.app.update('billingInvoices', w.invoice.id, { status: 'ISSUED', number: 'F2026-0001', snapshot: {}, pdf: [{ fileId: 'f1', label: 'F2026-0001.pdf' }], total: money(9792000000), dueDate: '2026-10-26' });`,
      'const mailer = { accounts: async () => [{ id: "m1", handle: "bonjour@verdal.example" }], send: async () => {} };',
      'const deps = () => ({ app: w.app, caller: w.db.store("MANUAL"), mailer, now, reference: () => "ref", log: () => {} });',
      'const body = { step: "prepare", object: "billingInvoice", recordId: w.invoice.id, localDate: TODAY, locale: "en" };',
      'const response = await respond({ body, userWorkspaceId: "uw" }, { workspaceMemberId: "wm" }, deps);',
      'console.log(JSON.stringify({ status: response.status, subject: response.body.form.subject, attachment: response.body.form.attachment }));',
    ].join('\n'));
    await bundleLogicFunction(entry, join(folder, 'entry.mjs'));
    const output = execFileSync(process.execPath, [join(folder, 'entry.mjs')], { cwd: folder, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { status: 200, subject: 'Facture F2026-0001 de Verdal Studio', attachment: 'F2026-0001.pdf' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

const sendBody = (w: Workspace, over: Record<string, unknown> = {}) => ({
  ...prepareBody(w), step: 'send', from: 'mailbox-studio', to: 'camille@calibre.example', cc: '',
  subject: 'Facture F2026-0001 de Verdal Studio', message: 'Bonjour Camille,\n\nVeuillez trouver ci-joint la facture F2026-0001.', ...over,
});
const sentState = (row: Row): unknown[] => [row.status, row.sentAt];

test('Send checks the message first and lists every problem; nothing is written or sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w, { to: 'Camille <camille@calibre.example>', cc: 'compta@calibre', subject: ' ', message: '' }), deps);
  assert.equal(outcome.status, 422);
  assert.ok(!outcome.body.ok);
  assert.deepEqual(outcome.body.problems.map((problem) => problem.message), [
    'Camille <camille@calibre.example> is not an email address.', 'compta@calibre is not an email address.', 'Write a subject.', 'Write a message.',
  ]);
  assert.deepEqual(problemCodes(await runEmail(sendBody(w, { to: '' }), deps)), ['MISSING_RECIPIENT']);
  assert.deepEqual([w.db.writes.length, sent.length], [before, 0]);
});

test('Send refuses as Prepare does when the document changed while the form was open', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  await w.app.update('billingInvoices', w.invoice.id, { status: 'CANCELLED' });
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(problemCodes(outcome), ['NOT_SENDABLE']);
  assert.deepEqual([w.db.writes.length, sent.length], [before, 0]);
});

test('a mailbox no longer connected, or not the caller’s, is NO_MAILBOX: nothing is written or sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w, { from: 'mailbox-of-someone-else' }), deps);
  assert.equal(outcome.status, 422);
  assert.deepEqual(outcome.body, {
    ok: false,
    problems: [{ code: 'NO_MAILBOX', field: 'from', message: 'The mailbox chosen is no longer connected to Twenty: close this form and open it again.' }],
  });
  assert.deepEqual([w.db.writes.length, sent.length], [before, 0]);
});

test('a caller whose role cannot edit the document gets NOT_ALLOWED, and nothing is sent', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w, { caller: w.db.store('MANUAL', { canUpdate: () => false }) });
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 403);
  assert.deepEqual(problemCodes(outcome), ['NOT_ALLOWED']);
  assert.deepEqual(sent, []);
});

test('an issued invoice goes from the chosen mailbox as the person: the recipients, the subject on one line, the message as HTML, its PDF', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent } = setup(w);
  const before = w.db.writes.length;
  const outcome = await runEmail(sendBody(w, {
    to: 'camille@calibre.example, ', cc: 'compta@calibre.example', subject: 'Facture F2026-0001\nde Verdal Studio', message: 'Bonjour <Camille>,\r\n\r\nCi-joint & merci.',
  }), deps);
  assert.equal(outcome.status, 200, JSON.stringify(outcome.body));
  assert.deepEqual(outcome.body, { ok: true, message: 'Sent to camille@calibre.example.', marked: true });
  assert.deepEqual(sent, [{
    mailboxId: 'mailbox-studio', to: ['camille@calibre.example'], cc: ['compta@calibre.example'], subject: 'Facture F2026-0001 de Verdal Studio',
    html: '<p>Bonjour &lt;Camille&gt;,</p><p>Ci-joint &amp; merci.</p>', files: [{ id: 'file-pdf-1', name: 'F2026-0001.pdf' }],
  }]);
  assert.deepEqual(w.db.writes.slice(before).map((write) => [write.op, write.plural, write.source, write.data]), [
    ['update', 'billingInvoices', 'MANUAL', { sentAt: null }],
    ['update', 'billingInvoices', 'APPLICATION', { status: 'SENT', sentAt: '2026-09-26T09:30:00.000Z' }],
  ]);
  const after = w.db.row('billingInvoices', w.invoice.id)!;
  assert.deepEqual([...sentState(after), after.pdf], ['SENT', '2026-09-26T09:30:00.000Z', [PDF]]);
  assert.deepEqual(w.db.timeline.map((entry) => [entry.kind, entry.recordId, entry.text]), [
    ['SENT', w.invoice.id, 'E-mail envoyé depuis Bonjour@Verdal.example à camille@calibre.example, en copie à compta@calibre.example.'],
  ]);
});

test('a second send keeps the first send’s date, and leaves a second row', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps } = setup(w);
  assert.equal((await runEmail(sendBody(w), deps)).status, 200);
  const before = w.db.writes.length;
  const later = { ...deps, now: () => new Date('2026-09-27T08:00:00.000Z') };
  assert.equal((await runEmail(sendBody(w), later)).status, 200);
  assert.deepEqual(w.db.writes.slice(before).map((write) => write.source), ['MANUAL'], 'the caller’s write only: nothing left to mark');
  assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['SENT', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(w.db.timeline.map((entry) => entry.kind), ['SENT', 'SENT']);
});

test('a Paid invoice stays Paid, a Draft quote becomes Sent, an Accepted one stays Accepted, an issued credit note gets its date', async () => {
  const w = workspace();
  await issuedInvoice(w, { status: 'PAID', sentAt: '2026-09-01T08:00:00.000Z' });
  const { deps, sent } = setup(w);
  assert.equal((await runEmail(sendBody(w), deps)).status, 200);
  assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['PAID', '2026-09-01T08:00:00.000Z']);

  const draft = w.addQuote({ status: 'DRAFT', number: 'D2026-0004', version: 2, pdf: QUOTE_PDFS, total: money(600_000_000), personId: w.person.id });
  const accepted = w.addQuote({ status: 'ACCEPTED', number: 'D2026-0005', version: 1, pdf: [{ fileId: 'file-q5', label: 'D2026-0005 v1.pdf' }], total: money(600_000_000) });
  const note = w.addCreditNote({
    status: 'ISSUED', number: 'AV2026-0001', invoiceId: w.invoice.id, snapshot: { printed: {}, record: {} },
    pdf: [{ fileId: 'file-cn', label: 'AV2026-0001.pdf' }], total: money(1_440_000_000),
  });
  const documents = [['billingQuote', draft.id], ['billingQuote', accepted.id], ['billingCreditNote', note.id]] as const;
  for (const [object, recordId] of documents) {
    const outcome = await runEmail(sendBody(w, { object, recordId }), deps);
    assert.equal(outcome.status, 200, `${object}: ${JSON.stringify(outcome.body)}`);
  }
  assert.deepEqual(sentState(w.db.row('billingQuotes', draft.id)!), ['SENT', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(sentState(w.db.row('billingQuotes', accepted.id)!), ['ACCEPTED', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(sentState(w.db.row('billingCreditNotes', note.id)!), ['ISSUED', '2026-09-26T09:30:00.000Z']);
  assert.deepEqual(sent.map((email) => email.files), [
    [{ id: 'file-pdf-1', name: 'F2026-0001.pdf' }], [{ id: 'file-q2', name: 'D2026-0004 v2.pdf' }],
    [{ id: 'file-q5', name: 'D2026-0005 v1.pdf' }], [{ id: 'file-cn', name: 'AV2026-0001.pdf' }],
  ]);
});

test('a refused permission is EMAIL_NOT_ALLOWED, a refused email SEND_FAILED with Twenty’s reason, and neither marks the document', async () => {
  const cases = [
    [new EmailNotAllowedError('Forbidden resource'), 403, 'EMAIL_NOT_ALLOWED', /Settings → Roles, under your role, “Send email”/],
    [new SendFailedError('Invalid recipients: camille@calibre.example'), 502, 'SEND_FAILED', /^The email could not be sent: Invalid recipients: camille@calibre\.example$/],
  ] as const;
  for (const [error, status, code, message] of cases) {
    const w = workspace();
    await issuedInvoice(w);
    const { mailer } = fakeMailer({
      send: async () => {
        throw error;
      },
    });
    const outcome = await runEmail(sendBody(w), setup(w, { mailer }).deps);
    assert.equal(outcome.status, status, code);
    assert.ok(!outcome.body.ok);
    assert.deepEqual(outcome.body.problems.map((problem) => problem.code), [code]);
    assert.match(outcome.body.problems[0]!.message, message);
    assert.deepEqual(sentState(w.db.row('billingInvoices', w.invoice.id)!), ['ISSUED', null], code);
    assert.deepEqual(w.db.timeline, [], code);
  }
});

test('a failure after the send is answered as sent, says the document is not marked, and is logged with its reference', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { deps, sent, logs } = setup(w);
  w.db.failNext((op, plural, data) => op === 'update' && plural === 'billingInvoices' && data?.status === 'SENT');
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 200);
  assert.deepEqual(outcome.body, {
    ok: true, message: 'Sent to camille@calibre.example, but the invoice could not be marked as sent (ref ref-7f3a).', marked: false,
  });
  assert.equal(sent.length, 1);
  assert.deepEqual([logs[0]?.reference, logs[0]?.step], ['ref-7f3a', 'record']);
  assert.equal(w.db.row('billingInvoices', w.invoice.id)!.status, 'ISSUED');
});

test('a send that fails in transit is unexpected: a reference, and a log that holds no address, subject or message', async () => {
  const w = workspace();
  await issuedInvoice(w);
  const { mailer } = fakeMailer({
    send: async () => {
      throw new TypeError('fetch failed');
    },
  });
  const { deps, logs } = setup(w, { mailer });
  const outcome = await runEmail(sendBody(w), deps);
  assert.equal(outcome.status, 500);
  assert.deepEqual(outcome.body, { ok: false, problems: [{ code: 'UNEXPECTED', message: 'Something went wrong (ref ref-7f3a).' }] });
  assert.equal(logs[0]?.step, 'send');
  assert.doesNotMatch(JSON.stringify(logs), /camille|Bonjour|Facture/);
});
